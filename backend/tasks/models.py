from django.db import models
from django.contrib.auth.models import User


class Task(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='tasks')
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=[
        ('todo', 'To Do'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed')
    ], default='todo')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title


class HiringTrend(models.Model):
    month = models.CharField(max_length=20)
    hired = models.PositiveIntegerField(default=0)
    applied = models.PositiveIntegerField(default=0)
    recorded_on = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["recorded_on"]

    def __str__(self):
        return f"{self.month} ({self.recorded_on})"


class JobOpening(models.Model):
    STATUS_CHOICES = [
        ("Active", "Active"),
        ("Draft", "Draft"),
        ("Closed", "Closed"),
    ]

    title = models.CharField(max_length=255)
    department = models.CharField(max_length=120)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="Active")
    location = models.CharField(max_length=120)
    applicants = models.PositiveIntegerField(default=0)
    skills = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return self.title


class ScrapedJob(models.Model):
    source = models.CharField(max_length=40)
    external_id = models.CharField(max_length=255)
    search_query = models.CharField(max_length=255, db_index=True)
    title = models.CharField(max_length=255)
    company = models.CharField(max_length=255, blank=True)
    location = models.CharField(max_length=255, blank=True)
    salary = models.CharField(max_length=255, blank=True)
    experience = models.CharField(max_length=255, blank=True)
    url = models.URLField(max_length=1000, blank=True)
    description = models.TextField(blank=True)
    skills = models.JSONField(default=list, blank=True)
    raw = models.JSONField(default=dict, blank=True)
    scraped_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-scraped_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["source", "external_id"],
                name="unique_scraped_job_per_source",
            )
        ]
        indexes = [
            models.Index(fields=["search_query", "source"]),
        ]

    def __str__(self):
        return f"{self.title} at {self.company or 'Unknown'}"


class Recruiter(models.Model):
    company = models.CharField(max_length=120, blank=True)
    name = models.CharField(max_length=120)
    designation = models.CharField(max_length=120, blank=True)
    email = models.EmailField(blank=True)
    linkedin = models.URLField(blank=True)
    phone = models.CharField(max_length=40, blank=True)
    roles = models.JSONField(default=list, blank=True)
    performance = models.PositiveIntegerField(default=0)
    hires = models.PositiveIntegerField(default=0)
    avatar = models.URLField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-performance", "name"]

    def __str__(self):
        return self.name


class CachedPerson(models.Model):
    source = models.CharField(max_length=40)
    source_id = models.CharField(max_length=120)
    search_query = models.CharField(max_length=255, blank=True, db_index=True)
    name = models.CharField(max_length=255)
    first_name = models.CharField(max_length=120, blank=True)
    last_name = models.CharField(max_length=120, blank=True)
    position = models.CharField(max_length=500, blank=True)
    seniority = models.CharField(max_length=120, blank=True)
    department = models.CharField(max_length=255, blank=True)
    company = models.CharField(max_length=255, blank=True)
    company_domain = models.CharField(max_length=255, blank=True)
    location = models.CharField(max_length=255, blank=True)
    linkedin_url = models.URLField(max_length=1000, blank=True)
    image_url = models.URLField(max_length=1000, blank=True)
    raw = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["source", "source_id"],
                name="unique_cached_person_per_source",
            )
        ]
        indexes = [
            models.Index(fields=["search_query", "source"]),
        ]

    def __str__(self):
        return self.name


class CompanyAnalytics(models.Model):
    company = models.CharField(max_length=120, unique=True)
    applicants = models.PositiveIntegerField(default=0)
    hired = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Company analytics"
        ordering = ["company"]

    def __str__(self):
        return self.company

class GlassdoorCompany(models.Model):
    company_id = models.IntegerField(unique=True)
    name = models.CharField(max_length=255)
    company_link = models.URLField(max_length=1000, blank=True)
    rating = models.FloatField(null=True, blank=True)
    review_count = models.IntegerField(default=0)
    salary_count = models.IntegerField(default=0)
    job_count = models.IntegerField(default=0)
    headquarters_location = models.CharField(max_length=255, blank=True)
    logo = models.URLField(max_length=1000, blank=True)
    company_size = models.CharField(max_length=255, blank=True)
    company_description = models.TextField(blank=True)
    industry = models.CharField(max_length=255, blank=True)
    website = models.URLField(max_length=1000, blank=True)
    company_type = models.CharField(max_length=255, blank=True)
    revenue = models.CharField(max_length=255, blank=True)
    company_size_category = models.CharField(max_length=80, blank=True)
    business_outlook_rating = models.FloatField(null=True, blank=True)
    career_opportunities_rating = models.FloatField(null=True, blank=True)
    ceo = models.CharField(max_length=255, blank=True)
    ceo_rating = models.FloatField(null=True, blank=True)
    compensation_and_benefits_rating = models.FloatField(null=True, blank=True)
    culture_and_values_rating = models.FloatField(null=True, blank=True)
    diversity_and_inclusion_rating = models.FloatField(null=True, blank=True)
    recommend_to_friend_rating = models.FloatField(null=True, blank=True)
    senior_management_rating = models.FloatField(null=True, blank=True)
    work_life_balance_rating = models.FloatField(null=True, blank=True)
    stock = models.CharField(max_length=40, blank=True)
    year_founded = models.PositiveIntegerField(null=True, blank=True)
    reviews_link = models.URLField(max_length=1000, blank=True)
    jobs_link = models.URLField(max_length=1000, blank=True)
    faq_link = models.URLField(max_length=1000, blank=True)
    competitors = models.JSONField(default=list, blank=True)
    office_locations = models.JSONField(default=list, blank=True)
    best_places_to_work_awards = models.JSONField(default=list, blank=True)
    raw = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Glassdoor companies"
        ordering = ["name"]

    def __str__(self):
        return self.name
