"""
Load and normalize job records produced by automation scripts (JSON under tasks/automation/).
Same shape the frontend expects: job_id, company, title, salary, location, experience, url, source, skills.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

AUTOMATION_DIR = Path(__file__).resolve().parent / "automation"

CACHE_KEY = "platform_jobs:merged"
CACHE_TTL = 60 * 30

# (folder label used as "source", filename)
SOURCE_FILES: list[tuple[str, str]] = [
    ("Naukri", "structured_jobs_final.json"),
    ("Indeed", "indeed_jobs.json"),
    ("LinkedIn", "linkedin_public_results.json"),
]


def _skills_from_text(title: str, description: str = "") -> list[str]:
    text = f"{title} {description}".lower()
    keywords = [
        "python", "django", "fastapi", "flask", "react", "typescript", "javascript",
        "node", "aws", "azure", "gcp", "kubernetes", "docker", "sql", "postgres",
        "mongodb", "java", "go ", " golang", "rust", "ml", "ai", "tensorflow",
        "pytorch", "kubernetes", "angular", "vue",
    ]
    found: list[str] = []
    for kw in keywords:
        if kw in text and kw.strip().title() not in found:
            found.append(kw.strip().title())
    return found[:12]


def _normalize_record(raw: dict[str, Any], source: str) -> dict[str, Any] | None:
    job_id = str(raw.get("job_id") or raw.get("id") or "").strip()
    title = (raw.get("title") or raw.get("jobTitle") or "").strip()
    company = (raw.get("company") or raw.get("companyName") or "Unknown").strip()
    if not title:
        return None
    if not job_id:
        job_id = re.sub(r"\W+", "-", f"{source}-{company}-{title}")[:120]

    salary = (raw.get("salary") or raw.get("pay") or "Not disclosed").strip()
    location = (raw.get("location") or "N/A").strip()
    experience = (
        raw.get("experience")
        or raw.get("job_type")
        or raw.get("jobType")
        or "N/A"
    )
    if isinstance(experience, str):
        experience = experience.strip()
    else:
        experience = str(experience)

    url = raw.get("url") or raw.get("jdURL") or ""
    if isinstance(url, str) and url.startswith("/"):
        url = f"https://www.naukri.com{url}"

    desc = raw.get("description") or raw.get("abstract") or ""
    if not isinstance(desc, str):
        desc = str(desc)

    skills = raw.get("skills") or raw.get("tags")
    if isinstance(skills, str):
        skills = [s.strip() for s in re.split(r"[,|]", skills) if s.strip()]
    elif isinstance(skills, list):
        skills = [str(s).strip() for s in skills if str(s).strip()]
    else:
        skills = _skills_from_text(title, desc)

    return {
        "job_id": job_id,
        "company": company,
        "title": title,
        "salary": salary if isinstance(salary, str) else str(salary),
        "location": location,
        "experience": experience,
        "url": url or "#",
        "source": source,
        "skills": skills,
        "status": "Active",
    }


def load_all_platform_jobs() -> list[dict[str, Any]]:
    merged: dict[tuple[str, str], dict[str, Any]] = {}
    for source, filename in SOURCE_FILES:
        path = AUTOMATION_DIR / filename
        if not path.is_file():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        if not isinstance(data, list):
            continue
        for raw in data:
            if not isinstance(raw, dict):
                continue
            norm = _normalize_record(raw, source)
            if not norm:
                continue
            key = (norm["source"], str(norm["job_id"]))
            merged[key] = norm
    return list(merged.values())


def filter_jobs(
    jobs: list[dict[str, Any]],
    search: str,
    skills_filter: list[str],
) -> list[dict[str, Any]]:
    search_tokens = [t for t in re.findall(r"[a-z0-9]+", search.lower()) if len(t) >= 2]
    out = []
    for job in jobs:
        if search_tokens:
            blob = " ".join(
                [
                    str(job.get("title", "")),
                    str(job.get("company", "")),
                    str(job.get("location", "")),
                    str(job.get("experience", "")),
                    str(job.get("source", "")),
                    " ".join(str(s) for s in (job.get("skills") or [])),
                ]
            ).lower()
            blob_tokens = set(re.findall(r"[a-z0-9]+", blob))
            compact_blob = re.sub(r"[^a-z0-9]+", "", blob)
            if not all(t in blob_tokens or t in compact_blob for t in search_tokens):
                continue
        if skills_filter:
            sk_blob = " ".join(str(s).lower() for s in (job.get("skills") or []))
            title_l = str(job.get("title", "")).lower()
            if not all(
                s in sk_blob or s in title_l for s in skills_filter
            ):
                continue
        out.append(job)
    return out


def get_cached_platform_jobs() -> list[dict[str, Any]]:
    from django.core.cache import cache

    data = cache.get(CACHE_KEY)
    if data is None:
        data = load_all_platform_jobs()
        cache.set(CACHE_KEY, data, CACHE_TTL)
    return data
