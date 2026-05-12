from rest_framework.throttling import ScopedRateThrottle


class AuthScopedRateThrottle(ScopedRateThrottle):
    """
    Scoped throttle keying by client IP to protect auth endpoints.
    """

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        scope = getattr(view, "throttle_scope", None)
        if not scope or not ident:
            return None
        return self.cache_format % {"scope": scope, "ident": ident}
