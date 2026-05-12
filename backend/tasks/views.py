import logging
from collections import Counter
from datetime import date, timedelta

import requests
from django.contrib.auth.models import User
from django.db.models import Q, Sum
from rest_framework import status, viewsets, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import CachedPerson, CompanyAnalytics, HiringTrend, JobOpening, Recruiter, ScrapedJob, Task
from .serializers import (
    CompanyAnalyticsSerializer,
    HiringTrendSerializer,
    RecruiterSerializer,
    TaskSerializer,
    RequirementExtractionInputSerializer,
    RequirementExtractionOutputSerializer,
)
from django.conf import settings

from .ai_extractor import extract_requirements
from .apollo import search_mixed_companies, search_mixed_people, slim_organization, slim_person
from .dynamic_jobs import get_cached_dynamic_jobs, get_stored_dynamic_jobs
from .platform_jobs import filter_jobs, get_cached_platform_jobs
from authentication.permissions import IsAdminOrRecruiter, IsAdminRole, user_role

logger = logging.getLogger(__name__)

def _internal_opening_dict(job: JobOpening) -> dict:
    return {
        "job_id": f"internal-{job.pk}",
        "company": job.department,
        "title": job.title,
        "salary": "Internal posting",
        "location": job.location,
        "experience": "—",
        "url": "#",
        "source": "Internal",
        "skills": job.skills or [],
        "status": job.status,
        "applicants": job.applicants,
        "id": job.pk,
    }


def _dedupe_openings(rows: list[dict]) -> list[dict]:
    seen: set[str] = set()
    deduped: list[dict] = []
    for row in rows:
        key = "|".join(
            [
                str(row.get("source") or ""),
                str(row.get("job_id") or row.get("id") or ""),
                str(row.get("url") or ""),
                str(row.get("title") or ""),
                str(row.get("company") or ""),
            ]
        ).lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(row)
    return deduped


def _company_trends_from_jobs(
    jobs: list[dict], analytics: list[dict]
) -> list[dict]:
    by_company = Counter(
        (j.get("company") or "Unknown").strip() for j in jobs if j.get("company")
    )
    analytics_by_name = {a["company"]: a for a in analytics}
    rows = []
    for name, openings in by_company.most_common(20):
        row = analytics_by_name.get(name, {})
        hired = int(row.get("hired") or 0)
        growth = row.get("conversionRate") or "—"
        rows.append(
            {
                "name": name,
                "hired": hired,
                "openings": openings,
                "growth": growth,
            }
        )
    return rows


def _source_effectiveness(jobs: list[dict]) -> list[dict]:
    c = Counter((j.get("source") or "Unknown") for j in jobs)
    total = sum(c.values()) or 1
    return [
        {"name": name, "value": round(100 * count / total)}
        for name, count in c.most_common(8)
    ]


def _tech_demand(jobs: list[dict], top_n: int = 8) -> list[dict]:
    skill_counts: Counter[str] = Counter()
    for job in jobs:
        for s in job.get("skills") or []:
            skill_counts[str(s).strip()] += 1
    if not skill_counts:
        return []
    max_c = max(skill_counts.values())
    colors = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#0ea5e9", "#f97316", "#ec4899", "#6366f1"]
    out = []
    for i, (name, count) in enumerate(skill_counts.most_common(top_n)):
        demand = max(5, min(100, round(100 * count / max_c)))
        out.append(
            {
                "name": name,
                "demand": demand,
                "trend": f"{count} roles",
                "color": colors[i % len(colors)],
            }
        )
    return out


def _company_hiring_signals(
    jobs: list[dict], analytics: list[dict], trends: list[dict]
) -> list[dict]:
    openings_by_company = Counter(
        (j.get("company") or "Unknown").strip() for j in jobs if j.get("company")
    )
    trend_hired = sum(int(row.get("hired") or 0) for row in trends)
    trend_applied = sum(int(row.get("applied") or 0) for row in trends)
    analytics_by_name = {a["company"]: a for a in analytics}
    rows = []
    for company, openings in openings_by_company.most_common(20):
        metrics = analytics_by_name.get(company, {})
        hired = int(metrics.get("hired") or 0)
        applicants = int(metrics.get("applicants") or 0)
        conversion = (hired / applicants) if applicants else 0
        score = min(100, round((openings * 8) + (hired * 4) + (conversion * 25)))
        title_blob = " ".join(
            str(job.get("title") or "").lower()
            for job in jobs
            if (job.get("company") or "").strip() == company
        )
        if openings == 0 or (trend_applied and trend_hired / trend_applied < 0.02):
            trend = "Hiring Freeze Risk"
        elif "intern" in title_blob or "trainee" in title_blob:
            trend = "Internship Hiring"
        elif openings >= 8 or score >= 75:
            trend = "Aggressive Hiring"
        elif openings >= 4:
            trend = "Expansion Hiring"
        else:
            trend = "Steady Hiring"
        rows.append(
            {
                "company": company,
                "trend": trend,
                "score": score,
                "openings": openings,
                "hired": hired,
                "conversion_rate": f"{round(conversion * 100, 1)}%",
            }
        )
    return rows


class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Task.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class RequirementExtractionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        input_serializer = RequirementExtractionInputSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)

        description = input_serializer.validated_data["description"]
        provider = input_serializer.validated_data.get("provider", "openai")
        extracted = extract_requirements(description=description, provider=provider)

        output_serializer = RequirementExtractionOutputSerializer(data=extracted)
        output_serializer.is_valid(raise_exception=True)
        return Response(output_serializer.validated_data, status=status.HTTP_200_OK)


class IndeedAutocompleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = (request.query_params.get("query") or "").strip()
        where = (request.query_params.get("where") or "Hyderabad, Telangana").strip()
        if len(query) < 2:
            return Response({"suggestions": []}, status=status.HTTP_200_OK)

        try:
            count = int(request.query_params.get("count", 10))
        except ValueError:
            count = 10

        params = {
            "country": request.query_params.get("country", "IN"),
            "language": request.query_params.get("language", "en"),
            "count": min(10, max(1, count)),
            "formatted": 1,
            "query": query,
            "useEachWord": "false",
            "page": "homepage",
            "accountKey": "",
            "showAlternateSuggestions": "false",
            "rich": "true",
            "where": where,
        }
        try:
            response = requests.get(
                "https://autocomplete.indeed.com/api/v0/suggestions/what",
                params=params,
                timeout=8,
                headers={"Accept": "application/json"},
            )
            response.raise_for_status()
            payload = response.json()
        except (requests.RequestException, ValueError) as exc:
            logger.warning("Indeed autocomplete failed: %s", exc)
            return Response(
                {"suggestions": [], "detail": "Autocomplete is temporarily unavailable."},
                status=status.HTTP_200_OK,
            )

        rows = payload.get("value") if isinstance(payload, dict) else payload
        suggestions: list[str] = []
        if isinstance(rows, list):
            for row in rows:
                if not isinstance(row, dict):
                    continue
                suggestion = row.get("suggestion")
                if not suggestion and isinstance(row.get("payload"), dict):
                    suggestion = row["payload"].get("suggestion")
                suggestion = str(suggestion or "").strip()
                if suggestion and suggestion not in suggestions:
                    suggestions.append(suggestion)

        return Response(
            {"suggestions": suggestions[: params["count"]]},
            status=status.HTTP_200_OK,
        )


class RefreshJobSourcesView(APIView):
    permission_classes = [IsAdminOrRecruiter]

    def post(self, request):
        from django.core.cache import cache

        from .celery_tasks import refresh_platform_jobs
        from .platform_jobs import CACHE_KEY, CACHE_TTL, load_all_platform_jobs

        jobs = load_all_platform_jobs()
        cache.set(CACHE_KEY, jobs, CACHE_TTL)
        refresh_platform_jobs.delay()
        return Response({"status": "ok", "count": len(jobs)}, status=status.HTTP_200_OK)


class DashboardDataView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        search = request.query_params.get("search", "").strip()
        status_filter = request.query_params.get("status", "all").strip().lower()
        skills_filter = [
            item.strip().lower()
            for item in request.query_params.get("skills", "").split(",")
            if item.strip()
        ]
        date_range = request.query_params.get("dateRange", "last-30-days")

        platform_jobs = get_cached_platform_jobs()
        filtered_platform = filter_jobs(platform_jobs, search, skills_filter)

        openings_qs = JobOpening.objects.all()
        if search:
            openings_qs = openings_qs.filter(
                Q(title__icontains=search)
                | Q(department__icontains=search)
                | Q(location__icontains=search)
            )
        if status_filter != "all":
            openings_qs = openings_qs.filter(status__iexact=status_filter)
        for skill in skills_filter:
            openings_qs = openings_qs.filter(skills__icontains=skill)

        internal_rows = [_internal_opening_dict(j) for j in openings_qs]
        platform_rows = []
        for raw in filtered_platform:
            if status_filter != "all" and str(raw.get("status", "Active")).lower() != status_filter:
                continue
            platform_rows.append(
                {
                    **raw,
                    "status": raw.get("status", "Active"),
                    "applicants": raw.get("applicants", 0),
                    "id": raw["job_id"],
                }
            )

        if search:
            dynamic_jobs = (get_cached_dynamic_jobs(search) or []) + get_stored_dynamic_jobs(search)
            filtered_dynamic = filter_jobs(dynamic_jobs, search, skills_filter)
            for raw in filtered_dynamic:
                if status_filter != "all" and str(raw.get("status", "Active")).lower() != status_filter:
                    continue
                platform_rows.append(
                    {
                        **raw,
                        "status": raw.get("status", "Active"),
                        "applicants": raw.get("applicants", 0),
                        "id": raw["job_id"],
                    }
                )

        all_openings = _dedupe_openings(internal_rows + platform_rows)

        today = date.today()
        range_days = {"last-30-days": 30, "last-90-days": 90, "year-to-date": 365}.get(
            date_range, 30
        )
        trend_start = today - timedelta(days=range_days)
        trends_qs = HiringTrend.objects.filter(recorded_on__gte=trend_start)
        analytics_qs = CompanyAnalytics.objects.all()
        recruiters_qs = Recruiter.objects.all()

        trends = HiringTrendSerializer(trends_qs, many=True).data
        analytics = CompanyAnalyticsSerializer(analytics_qs, many=True).data
        recruiters = RecruiterSerializer(recruiters_qs, many=True).data

        hiring_volume_history = [
            {
                "month": row["month"],
                "hired": row["hired"],
                "applied": row["applied"],
            }
            for row in trends
        ]

        company_trends = _company_trends_from_jobs(platform_jobs, analytics)
        source_effectiveness = _source_effectiveness(platform_jobs)
        tech_demand = _tech_demand(filtered_platform or platform_jobs)
        hiring_signals = _company_hiring_signals(platform_jobs, analytics, trends)

        total_hired = trends_qs.aggregate(total=Sum("hired"))["total"] or 0
        active_internal = openings_qs.filter(status="Active").count()
        active_openings_count = active_internal + len(filtered_platform)

        total_applicants = (openings_qs.aggregate(total=Sum("applicants"))["total"] or 0) + sum(
            int(j.get("applicants") or 0) for j in platform_rows
        )
        interview_ratio = (
            f"{round((total_hired / total_applicants) * 100)}%"
            if total_applicants
            else "0%"
        )

        conv_values = []
        for a in analytics:
            cr = a.get("conversionRate") or "0%"
            try:
                conv_values.append(float(str(cr).rstrip("%")))
            except ValueError:
                pass
        quality_hire = (
            f"{round(sum(conv_values) / len(conv_values), 1)}%"
            if conv_values
            else None
        )

        kpis = [
            {
                "id": "total-hired",
                "label": "Total Hired",
                "value": total_hired,
                "trend": "DB + trends",
                "status": "increase",
            },
            {
                "id": "active-openings",
                "label": "Active Openings",
                "value": active_openings_count,
                "trend": "Live sources",
                "status": "increase",
            },
            {
                "id": "time-to-fill",
                "label": "Avg Time to Fill",
                "value": "N/A",
                "trend": "—",
                "status": "decrease",
            },
            {
                "id": "interview-ratio",
                "label": "Interview Ratio",
                "value": interview_ratio,
                "trend": "Applicants vs hired",
                "status": "increase",
            },
        ]

        payload = {
            "user": {
                "username": request.user.get_username(),
                "role": user_role(request.user),
                "is_bootstrap_admin": request.user.get_username()
                == getattr(settings, "BOOTSTRAP_ADMIN_EMAIL", "hireai.default.admin@gmail.com"),
            },
            "kpis": kpis,
            "trends": trends,
            "hiring_volume_history": hiring_volume_history,
            "company_trends": company_trends,
            "openings": all_openings,
            "recruiters": recruiters,
            "analytics": analytics,
            "source_effectiveness": source_effectiveness,
            "tech_demand": tech_demand,
            "hiring_signals": hiring_signals,
            "quality_of_hire_percent": quality_hire,
        }
        return Response(payload, status=status.HTTP_200_OK)


class AdminDashboardView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        platform_jobs = get_cached_platform_jobs()
        source_counts = Counter(job.get("source") or "Unknown" for job in platform_jobs)
        scraped_source_counts = Counter(
            ScrapedJob.objects.values_list("source", flat=True)
        )
        recent_scraped = [
            {
                "id": job.id,
                "source": job.source,
                "query": job.search_query,
                "title": job.title,
                "company": job.company,
                "scraped_at": job.scraped_at.isoformat() if job.scraped_at else None,
            }
            for job in ScrapedJob.objects.order_by("-scraped_at")[:12]
        ]
        users = [
            {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "role": user_role(user),
                "is_active": user.is_active,
                "is_staff": user.is_staff,
                "last_login": user.last_login.isoformat() if user.last_login else None,
                "date_joined": user.date_joined.isoformat() if user.date_joined else None,
            }
            for user in User.objects.select_related("profile").order_by("username")
        ]
        trends = HiringTrendSerializer(HiringTrend.objects.all(), many=True).data
        analytics = CompanyAnalyticsSerializer(CompanyAnalytics.objects.all(), many=True).data
        recruiters = RecruiterSerializer(Recruiter.objects.all(), many=True).data
        all_jobs_for_skills = platform_jobs + [job.raw for job in ScrapedJob.objects.all() if job.raw]

        payload = {
            "user_management": {
                "total_users": len(users),
                "active_users": sum(1 for user in users if user["is_active"]),
                "admins": sum(1 for user in users if user["role"] == "admin"),
                "users": users,
            },
            "data_monitoring": {
                "internal_openings": JobOpening.objects.count(),
                "scraped_jobs": ScrapedJob.objects.count(),
                "recruiters": Recruiter.objects.count(),
                "companies": CompanyAnalytics.objects.count(),
                "hiring_trend_rows": HiringTrend.objects.count(),
                "platform_cache_jobs": len(platform_jobs),
                "source_counts": [
                    {"name": name, "count": count}
                    for name, count in (source_counts + scraped_source_counts).most_common(10)
                ],
            },
            "scraping_status": {
                "redis_configured": bool(getattr(settings, "REDIS_URL", "")),
                "celery_broker": getattr(settings, "CELERY_BROKER_URL", ""),
                "playwright_cdp_url": getattr(settings, "PLAYWRIGHT_CDP_URL", ""),
                "recent_jobs": recent_scraped,
            },
            "analytics_dashboard": {
                "hiring_volume_history": [
                    {"month": row["month"], "hired": row["hired"], "applied": row["applied"]}
                    for row in trends
                ],
                "company_analytics": analytics,
                "technology_demand": _tech_demand(all_jobs_for_skills),
                "hiring_signals": _company_hiring_signals(platform_jobs, analytics, trends),
                "recruiter_performance": recruiters,
            },
            "reports_management": {
                "available_reports": [
                    {"id": "company", "name": "Company Reports", "exports": ["PDF", "Excel", "CSV"]},
                    {"id": "tech", "name": "Technology Demand Reports", "exports": ["PDF", "Excel", "CSV"]},
                    {"id": "hiring", "name": "Hiring Frequency Reports", "exports": ["PDF", "Excel", "CSV"]},
                    {"id": "location", "name": "Location-Based Analysis", "exports": ["PDF", "Excel", "CSV"]},
                    {"id": "skills", "name": "Skill Demand Analytics", "exports": ["PDF", "Excel", "CSV"]},
                ],
                "last_generated": None,
                "scheduled_reports_enabled": False,
            },
        }
        return Response(payload, status=status.HTTP_200_OK)


class ApolloOrganizationsView(APIView):
    """
    Proxy Apollo mixed_companies/search. Returns slimmed `organizations` + `pagination`.
    Set APOLLO_API_KEY in the environment.
    """

    permission_classes = [IsAdminOrRecruiter]

    def get(self, request):
        api_key = (getattr(settings, "APOLLO_API_KEY", None) or "").strip()
        if not api_key:
            return Response(
                {"detail": "APOLLO_API_KEY is not configured on the server."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            page = max(1, int(request.query_params.get("page", 1)))
        except ValueError:
            page = 1
        try:
            per_page = int(request.query_params.get("per_page", 25))
        except ValueError:
            per_page = 25
        per_page = min(100, max(1, per_page))

        keyword = (request.query_params.get("keyword") or "").strip()
        body: dict = {"page": page, "per_page": per_page}
        if keyword:
            body["q_organization_keyword_tags"] = [keyword]

        data_raw, status_code = search_mixed_companies(api_key, body)
        if status_code >= 400:
            # Prevent 401 from Apollo causing the frontend to log the user out
            mapped_status = status.HTTP_502_BAD_GATEWAY if status_code == 401 else status_code
            if isinstance(data_raw, dict):
                return Response(data_raw, status=mapped_status)
            return Response({"detail": str(data_raw)}, status=mapped_status)

        if not isinstance(data_raw, dict):
            return Response(
                {"detail": "Unexpected Apollo response shape."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        orgs = data_raw.get("organizations") or []
        pagination = data_raw.get("pagination") or {}

        slimmed = [
            slim_organization(o)
            for o in orgs
            if isinstance(o, dict)
        ]

        return Response(
            {
                "organizations": slimmed,
                "pagination": {
                    "page": pagination.get("page", page),
                    "per_page": pagination.get("per_page", per_page),
                    "total_entries": pagination.get("total_entries"),
                    "total_pages": pagination.get("total_pages"),
                },
            },
            status=status.HTTP_200_OK,
        )


class DynamicJobSearchStartView(APIView):
    permission_classes = [IsAdminOrRecruiter]

    def post(self, request):
        from kombu.exceptions import OperationalError

        from .celery_tasks import fetch_dynamic_jobs

        query = (request.data.get("query") or "").strip()
        if len(query) < 2:
            return Response(
                {"detail": "Query must be at least 2 characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            try:
                async_result = fetch_dynamic_jobs.delay(query)
            except OperationalError:
                logger.warning(
                    "Celery broker unreachable; running fetch_dynamic_jobs in-process",
                    exc_info=True,
                )
                async_result = fetch_dynamic_jobs.apply(args=[query])
        except Exception as exc:
            logger.exception("Dynamic job search could not be started")
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(
            {"task_id": async_result.id, "query": query},
            status=status.HTTP_202_ACCEPTED,
        )


class DynamicJobSearchStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from celery.result import AsyncResult

        task_id = (request.query_params.get("task_id") or "").strip()
        if not task_id:
            return Response(
                {"detail": "task_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        result = AsyncResult(task_id)
        body: dict = {
            "task_id": task_id,
            "status": result.state,
            "ready": result.ready(),
        }
        if result.successful():
            body["count"] = result.result
        elif result.failed():
            body["error"] = str(result.info)
        return Response(body, status=status.HTTP_200_OK)


def _company_enrich_location(location: dict | None) -> str:
    if not isinstance(location, dict):
        return ""
    city = location.get("city") if isinstance(location.get("city"), dict) else None
    state = location.get("state") if isinstance(location.get("state"), dict) else None
    country = location.get("country") if isinstance(location.get("country"), dict) else None
    parts = [
        city.get("name") if city else None,
        state.get("name") if state else None,
        country.get("name") if country else None,
    ]
    return ", ".join(str(part) for part in parts if part)


def _slim_company_enrich_company(company: dict) -> dict:
    financial = company.get("financial") if isinstance(company.get("financial"), dict) else {}
    socials = company.get("socials") if isinstance(company.get("socials"), dict) else {}
    location = company.get("location") if isinstance(company.get("location"), dict) else {}
    return {
        "id": company.get("id"),
        "name": company.get("name"),
        "domain": company.get("domain"),
        "website": company.get("website"),
        "type": company.get("type"),
        "industry": company.get("industry"),
        "industries": company.get("industries") or [],
        "categories": company.get("categories") or [],
        "employees": company.get("employees"),
        "revenue": company.get("revenue"),
        "description": company.get("description") or company.get("seo_description") or "",
        "keywords": company.get("keywords") or [],
        "technologies": company.get("technologies") or [],
        "founded_year": company.get("founded_year"),
        "location_label": _company_enrich_location(location),
        "address": location.get("address") if isinstance(location, dict) else None,
        "phone": location.get("phone") if isinstance(location, dict) else None,
        "stock_symbol": financial.get("stock_symbol"),
        "stock_exchange": financial.get("stock_exchange"),
        "total_funding": financial.get("total_funding"),
        "funding_stage": financial.get("funding_stage"),
        "linkedin_url": socials.get("linkedin_url"),
        "twitter_url": socials.get("twitter_url"),
        "facebook_url": socials.get("facebook_url"),
        "crunchbase_url": socials.get("crunchbase_url"),
        "logo_url": company.get("logo_url"),
        "page_rank": company.get("page_rank"),
        "updated_at": company.get("updated_at"),
        "raw": company,
    }


def _normalized_people_query(query: str) -> str:
    return " ".join(query.lower().split())


def _person_location(location: dict | None) -> str:
    if not isinstance(location, dict):
        return ""
    return str(location.get("address") or "").strip()


def _current_company_from_experiences(experiences: list | None) -> tuple[str, str]:
    if not isinstance(experiences, list):
        return "", ""
    current = next(
        (
            item
            for item in experiences
            if isinstance(item, dict) and item.get("isCurrent")
        ),
        None,
    )
    if not current:
        current = next((item for item in experiences if isinstance(item, dict)), None)
    if not isinstance(current, dict):
        return "", ""
    company = current.get("company")
    if isinstance(company, dict):
        return str(company.get("name") or ""), str(company.get("domain") or "")
    return str(current.get("companyName") or ""), ""


def _slim_company_enrich_person(person: dict) -> dict:
    socials = person.get("socials") if isinstance(person.get("socials"), dict) else {}
    company, domain = _current_company_from_experiences(person.get("experiences"))
    return {
        "id": str(person.get("id") or ""),
        "name": person.get("name") or "",
        "first_name": person.get("first_name") or "",
        "last_name": person.get("last_name") or "",
        "position": person.get("position") or "",
        "seniority": person.get("seniority") or "",
        "department": person.get("department") or "",
        "company": company,
        "company_domain": domain,
        "location": _person_location(person.get("location")),
        "linkedin_url": socials.get("linkedin_url") or "",
        "image_url": person.get("image_url") or "",
        "source": "companyenrich",
        "raw": person,
    }


def _cached_person_to_dict(person: CachedPerson) -> dict:
    return {
        "id": person.source_id,
        "name": person.name,
        "first_name": person.first_name,
        "last_name": person.last_name,
        "position": person.position,
        "seniority": person.seniority,
        "department": person.department,
        "company": person.company,
        "company_domain": person.company_domain,
        "location": person.location,
        "linkedin_url": person.linkedin_url,
        "image_url": person.image_url,
        "source": person.source,
        "raw": person.raw,
    }


def _save_people_to_cache(people: list[dict], search_query: str) -> None:
    for person in people:
        source_id = str(person.get("id") or "").strip()
        source = str(person.get("source") or "").strip()
        name = str(person.get("name") or "").strip()
        if not source_id or not source or not name:
            continue
        CachedPerson.objects.update_or_create(
            source=source,
            source_id=source_id,
            defaults={
                "search_query": search_query,
                "name": name,
                "first_name": person.get("first_name") or "",
                "last_name": person.get("last_name") or "",
                "position": person.get("position") or "",
                "seniority": person.get("seniority") or "",
                "department": person.get("department") or "",
                "company": person.get("company") or "",
                "company_domain": person.get("company_domain") or "",
                "location": person.get("location") or "",
                "linkedin_url": person.get("linkedin_url") or "",
                "image_url": person.get("image_url") or "",
                "raw": person.get("raw") or {},
            },
        )


class CompanyEnrichCompaniesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = (request.query_params.get("query") or "").strip()
        try:
            page = max(1, int(request.query_params.get("page", 1)))
        except ValueError:
            page = 1
        try:
            page_size = int(request.query_params.get("pageSize", 25))
        except ValueError:
            page_size = 25
        page_size = min(100, max(1, page_size))

        api_key = (getattr(settings, "COMPANY_ENRICH_API_KEY", "") or "").strip()
        if not api_key:
            return Response(
                {"detail": "COMPANY_ENRICH_API_KEY is not configured on the server."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        body = {"page": page, "pageSize": page_size}
        if query:
            body["query"] = query

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }
        try:
            response = requests.post(
                "https://api.companyenrich.com/companies/search",
                headers=headers,
                json=body,
                timeout=15,
            )
            response.raise_for_status()
            data = response.json()
        except (requests.RequestException, ValueError) as exc:
            logger.exception("CompanyEnrich API error")
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        items = data.get("items") if isinstance(data, dict) else []
        if not isinstance(items, list):
            items = []
        companies = [
            _slim_company_enrich_company(item)
            for item in items
            if isinstance(item, dict)
        ]
        return Response(
            {
                "companies": companies,
                "page": data.get("page", page) if isinstance(data, dict) else page,
                "totalPages": data.get("totalPages") if isinstance(data, dict) else None,
                "totalItems": data.get("totalItems") if isinstance(data, dict) else None,
            },
            status=status.HTTP_200_OK,
        )


class PeopleSearchView(APIView):
    permission_classes = [IsAdminOrRecruiter]

    def get(self, request):
        query = (request.query_params.get("query") or "").strip()
        search_key = _normalized_people_query(query)
        try:
            page_size = int(request.query_params.get("pageSize", 25))
        except ValueError:
            page_size = 25
        page_size = min(100, max(1, page_size))
        cursor = (request.query_params.get("cursor") or "").strip()

        if not cursor:
            cached = list(CachedPerson.objects.filter(search_query=search_key).order_by("-updated_at")[:page_size])
            if cached:
                return Response(
                    {
                        "people": [_cached_person_to_dict(person) for person in cached],
                        "source": "cache",
                        "from_cache": True,
                        "totalItems": CachedPerson.objects.filter(search_query=search_key).count(),
                        "nextCursor": None,
                    },
                    status=status.HTTP_200_OK,
                )

        company_enrich_key = (getattr(settings, "COMPANY_ENRICH_API_KEY", "") or "").strip()
        company_enrich_error: str | None = None
        if company_enrich_key:
            body: dict = {"pageSize": page_size}
            if query:
                body["query"] = query
            if cursor:
                body["cursor"] = cursor
            try:
                response = requests.post(
                    "https://api.companyenrich.com/people/search/scroll",
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {company_enrich_key}",
                    },
                    json=body,
                    timeout=20,
                )
                response.raise_for_status()
                payload = response.json()
                items = payload.get("items") if isinstance(payload, dict) else []
                if isinstance(items, list) and items:
                    people = [
                        _slim_company_enrich_person(item)
                        for item in items
                        if isinstance(item, dict)
                    ]
                    _save_people_to_cache(people, search_key)
                    return Response(
                        {
                            "people": people,
                            "source": "companyenrich",
                            "from_cache": False,
                            "totalItems": payload.get("totalItems"),
                            "nextCursor": payload.get("nextCursor"),
                        },
                        status=status.HTTP_200_OK,
                    )
            except (requests.RequestException, ValueError) as exc:
                company_enrich_error = str(exc)
                logger.warning("CompanyEnrich people search failed: %s", exc)

        apollo_key = (getattr(settings, "APOLLO_API_KEY", "") or "").strip()
        if apollo_key:
            body: dict = {"page": 1, "per_page": page_size}
            if query:
                body["q_keywords"] = query
            data_raw, status_code = search_mixed_people(apollo_key, body)
            if status_code < 400 and isinstance(data_raw, dict):
                rows = data_raw.get("people") or data_raw.get("contacts") or []
                if isinstance(rows, list) and rows:
                    people = [
                        slim_person(row)
                        for row in rows
                        if isinstance(row, dict)
                    ]
                    _save_people_to_cache(people, search_key)
                    return Response(
                        {
                            "people": people,
                            "source": "apollo",
                            "from_cache": False,
                            "totalItems": data_raw.get("pagination", {}).get("total_entries")
                            if isinstance(data_raw.get("pagination"), dict)
                            else len(people),
                            "nextCursor": None,
                        },
                        status=status.HTTP_200_OK,
                    )

        detail = "No people found."
        if company_enrich_error:
            detail = f"CompanyEnrich failed and Apollo fallback returned no people: {company_enrich_error}"
        return Response(
            {"people": [], "source": "none", "from_cache": False, "totalItems": 0, "nextCursor": None, "detail": detail},
            status=status.HTTP_200_OK,
        )
