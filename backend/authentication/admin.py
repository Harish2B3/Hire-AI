from django.contrib import admin

from .models import MfaChallenge, UserProfile


admin.site.register(UserProfile)
admin.site.register(MfaChallenge)
