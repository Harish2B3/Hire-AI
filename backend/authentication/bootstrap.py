import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import OperationalError, ProgrammingError, transaction
from django.db.models import Q

from .models import UserProfile

logger = logging.getLogger(__name__)


def ensure_bootstrap_admin() -> None:
    """
    Recreate the bootstrap admin when the database has no admin accounts.

    This covers local/dev databases where all users were deleted after the
    initial migration already ran.
    """
    User = get_user_model()
    email = getattr(settings, "BOOTSTRAP_ADMIN_EMAIL", "hireai.default.admin@gmail.com")
    password = getattr(settings, "BOOTSTRAP_ADMIN_PASSWORD", "") or "Admin@12345"

    try:
        has_admin = User.objects.filter(
            Q(is_superuser=True) | Q(profile__role=UserProfile.ROLE_ADMIN)
        ).exists()
        if has_admin:
            return

        with transaction.atomic():
            user, created = User.objects.get_or_create(
                username=email,
                defaults={
                    "email": email,
                    "is_staff": True,
                    "is_superuser": True,
                    "is_active": True,
                },
            )
            changed_fields: list[str] = []
            if user.email != email:
                user.email = email
                changed_fields.append("email")
            if not user.is_staff:
                user.is_staff = True
                changed_fields.append("is_staff")
            if not user.is_superuser:
                user.is_superuser = True
                changed_fields.append("is_superuser")
            if not user.is_active:
                user.is_active = True
                changed_fields.append("is_active")
            if created:
                user.set_password(password)
                user.save()
            elif changed_fields:
                user.save(update_fields=changed_fields)

            UserProfile.objects.update_or_create(
                user=user,
                defaults={"role": UserProfile.ROLE_ADMIN},
            )
        logger.info("Bootstrap admin is available: %s", email)
    except (OperationalError, ProgrammingError):
        logger.debug("Skipped bootstrap admin check before auth tables were ready.")
