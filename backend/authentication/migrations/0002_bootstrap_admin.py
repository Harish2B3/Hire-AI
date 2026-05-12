from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.db import migrations


def create_bootstrap_admin(apps, schema_editor):
    User = apps.get_model("auth", "User")
    UserProfile = apps.get_model("authentication", "UserProfile")

    email = getattr(settings, "BOOTSTRAP_ADMIN_EMAIL", "hireai.default.admin@gmail.com")
    password = getattr(settings, "BOOTSTRAP_ADMIN_PASSWORD", "Admin@12345")

    user, created = User.objects.get_or_create(
        username=email,
        defaults={
            "email": email,
            "is_staff": True,
            "is_superuser": True,
            "is_active": True,
        },
    )
    if created:
        user.password = make_password(password)
        user.save(update_fields=["password"])
    else:
        changed = False
        if not user.email:
            user.email = email
            changed = True
        if not user.is_staff or not user.is_superuser:
            user.is_staff = True
            user.is_superuser = True
            changed = True
        if changed:
            user.save(update_fields=["email", "is_staff", "is_superuser"])

    UserProfile.objects.update_or_create(user=user, defaults={"role": "admin"})


def remove_bootstrap_admin(apps, schema_editor):
    User = apps.get_model("auth", "User")
    email = getattr(settings, "BOOTSTRAP_ADMIN_EMAIL", "hireai.default.admin@gmail.com")
    User.objects.filter(username=email).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("authentication", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(create_bootstrap_admin, remove_bootstrap_admin),
    ]
