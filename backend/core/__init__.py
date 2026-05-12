# Import Celery app when Django loads the `core` package so `shared_task` uses
# CELERY_* from settings (Redis) instead of the default AMQP broker.
from .celery import app as celery_app

__all__ = ("celery_app",)
