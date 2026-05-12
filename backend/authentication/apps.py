from django.apps import AppConfig
from django.db.models.signals import post_migrate


def ensure_bootstrap_admin_after_migrate(**kwargs):
    from .bootstrap import ensure_bootstrap_admin

    ensure_bootstrap_admin()


class AuthenticationConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "authentication"

    def ready(self):
        post_migrate.connect(
            ensure_bootstrap_admin_after_migrate,
            sender=self,
            dispatch_uid="authentication.ensure_bootstrap_admin",
            weak=False,
        )
