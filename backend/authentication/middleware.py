from .bootstrap import ensure_bootstrap_admin


class BootstrapAdminMiddleware:
    _checked = False

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not BootstrapAdminMiddleware._checked:
            ensure_bootstrap_admin()
            BootstrapAdminMiddleware._checked = True
        return self.get_response(request)
