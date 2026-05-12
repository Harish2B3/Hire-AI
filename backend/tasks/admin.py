from django.contrib import admin
from .models import CachedPerson, CompanyAnalytics, HiringTrend, JobOpening, Recruiter, ScrapedJob, Task

admin.site.register(Task)
admin.site.register(HiringTrend)
admin.site.register(JobOpening)
admin.site.register(Recruiter)
admin.site.register(CachedPerson)
admin.site.register(CompanyAnalytics)
admin.site.register(ScrapedJob)
