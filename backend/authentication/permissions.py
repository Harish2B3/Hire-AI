from rest_framework.permissions import BasePermission


def user_role(user) -> str:
    if not user or not user.is_authenticated:
        return ""
    if user.is_staff or user.is_superuser:
        return "admin"
    profile = getattr(user, "profile", None)
    return getattr(profile, "role", "") or "recruiter"


class IsAdminOrRecruiter(BasePermission):
    allowed_roles = {"admin", "recruiter"}

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and user_role(request.user) in self.allowed_roles
        )


class IsAdminRole(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and user_role(request.user) == "admin"
        )
