import os
from django.apps import AppConfig


class TasksConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "tasks"

    def ready(self):
        # Only launch when running the main server (avoid launch on reload or secondary processes)
        if os.environ.get("RUN_MAIN") == "true":
            from .automation.browser import launch_remote_debugging_chrome
            launch_remote_debugging_chrome()
