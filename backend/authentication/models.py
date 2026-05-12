from django.conf import settings
from django.db import models


class UserProfile(models.Model):
    ROLE_ADMIN = "admin"
    ROLE_RECRUITER = "recruiter"
    ROLE_ANALYST = "analyst"

    ROLE_CHOICES = [
        (ROLE_ADMIN, "Admin"),
        (ROLE_RECRUITER, "Recruiter"),
        (ROLE_ANALYST, "Analyst"),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_RECRUITER)

    def __str__(self):
        return f"{self.user.username} ({self.role})"


class MfaChallenge(models.Model):
    PURPOSE_REGISTER = "register"
    PURPOSE_LOGIN = "login"
    PURPOSE_PASSWORD_RESET = "password_reset"

    PURPOSE_CHOICES = [
        (PURPOSE_REGISTER, "Register"),
        (PURPOSE_LOGIN, "Login"),
        (PURPOSE_PASSWORD_RESET, "Password reset"),
    ]

    purpose = models.CharField(max_length=20, choices=PURPOSE_CHOICES)
    email = models.EmailField(db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="mfa_challenges",
    )
    code_hash = models.CharField(max_length=255)
    pending_payload = models.JSONField(default=dict, blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["email", "purpose", "created_at"]),
        ]

    def __str__(self):
        return f"{self.email} {self.purpose} MFA"
