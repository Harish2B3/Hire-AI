import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.contrib.auth.models import User
from django.core.mail import send_mail
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import MfaChallenge, UserProfile
from .serializers import (
    BootstrapAdminSetupSerializer,
    ForgotPasswordStartSerializer,
    LoginStartSerializer,
    MfaVerifySerializer,
    PasswordResetVerifySerializer,
    UserSerializer,
)
from .throttles import AuthScopedRateThrottle


def _token_payload(user: User) -> dict:
    refresh = RefreshToken.for_user(user)
    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
    }


def _create_mfa_challenge(
    *,
    email: str,
    purpose: str,
    user: User | None = None,
    pending_payload: dict | None = None,
) -> MfaChallenge:
    now = timezone.now()
    (
        MfaChallenge.objects.filter(
            email=email,
            purpose=purpose,
            consumed_at__isnull=True,
            expires_at__gt=now,
        ).update(consumed_at=now)
    )
    code = f"{secrets.randbelow(1_000_000):06d}"
    challenge = MfaChallenge.objects.create(
        email=email,
        purpose=purpose,
        user=user,
        pending_payload=pending_payload or {},
        code_hash=make_password(code),
        expires_at=now + timedelta(minutes=getattr(settings, "MFA_CODE_TTL_MINUTES", 10)),
    )
    send_mail(
        subject="Your Hire AI OTP code",
        message=(
            f"Your Hire AI OTP code is {code}.\n\n"
            f"This code expires in {getattr(settings, 'MFA_CODE_TTL_MINUTES', 10)} minutes."
        ),
        from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
        recipient_list=[email],
        fail_silently=False,
    )
    return challenge


def _resend_mfa_challenge(challenge: MfaChallenge) -> MfaChallenge:
    return _create_mfa_challenge(
        email=challenge.email,
        purpose=challenge.purpose,
        user=challenge.user,
        pending_payload=challenge.pending_payload,
    )


def _verify_challenge(challenge_id: int, code: str, purpose: str) -> MfaChallenge:
    try:
        challenge = MfaChallenge.objects.select_related("user").get(
            id=challenge_id,
            purpose=purpose,
            consumed_at__isnull=True,
        )
    except MfaChallenge.DoesNotExist:
        raise ValueError("Verification code was not found or was already used.")

    if challenge.expires_at <= timezone.now():
        raise ValueError("Verification code expired. Please start again.")

    if challenge.attempts >= getattr(settings, "MFA_MAX_ATTEMPTS", 5):
        raise ValueError("Too many attempts. Please start again.")

    challenge.attempts += 1
    challenge.save(update_fields=["attempts"])
    if not check_password(code, challenge.code_hash):
        raise ValueError("Invalid verification code.")

    challenge.consumed_at = timezone.now()
    challenge.save(update_fields=["consumed_at"])
    return challenge


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = (AllowAny,)
    serializer_class = UserSerializer
    throttle_classes = [AuthScopedRateThrottle]
    throttle_scope = "auth_register"

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        email = (data.get("email") or data["username"]).strip().lower()
        username = data["username"].strip().lower()
        if User.objects.filter(username=username).exists() or User.objects.filter(email=email).exists():
            return Response(
                {"detail": "An account with this email already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        challenge = _create_mfa_challenge(
            email=email,
            purpose=MfaChallenge.PURPOSE_REGISTER,
            pending_payload={
                "username": username,
                "email": email,
                "password_hash": make_password(data["password"]),
                "first_name": data.get("first_name", ""),
                "last_name": data.get("last_name", ""),
                "role": data.get("role", UserProfile.ROLE_RECRUITER),
            },
        )
        return Response(
            {
                "mfa_required": True,
                "challenge_id": challenge.id,
                "email": email,
                "detail": "Verification code sent to your email.",
            },
            status=status.HTTP_202_ACCEPTED,
        )


class RegisterVerifyView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthScopedRateThrottle]
    throttle_scope = "auth_verify"

    def post(self, request):
        serializer = MfaVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            challenge = _verify_challenge(
                serializer.validated_data["challenge_id"],
                serializer.validated_data["code"],
                MfaChallenge.PURPOSE_REGISTER,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        data = challenge.pending_payload
        with transaction.atomic():
            if User.objects.filter(username=data["username"]).exists() or User.objects.filter(email=data["email"]).exists():
                return Response(
                    {"detail": "An account with this email already exists."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user = User(
                username=data["username"],
                email=data["email"],
                password=data["password_hash"],
                first_name=data.get("first_name", ""),
                last_name=data.get("last_name", ""),
            )
            user.save()
            UserProfile.objects.create(user=user, role=data.get("role", UserProfile.ROLE_RECRUITER))

        return Response(
            {
                "detail": "Account verified.",
                **_token_payload(user),
            },
            status=status.HTTP_201_CREATED,
        )


class LoginStartView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthScopedRateThrottle]
    throttle_scope = "auth_login_start"

    def post(self, request):
        serializer = LoginStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username = serializer.validated_data["username"].strip().lower()
        password = serializer.validated_data["password"]
        user = authenticate(request, username=username, password=password)
        if user is None:
            user = authenticate(request, username=User.objects.filter(email__iexact=username).values_list("username", flat=True).first() or username, password=password)
        if user is None:
            return Response({"detail": "No active account found with the given credentials."}, status=status.HTTP_401_UNAUTHORIZED)
        if not user.is_active:
            return Response({"detail": "This account is inactive."}, status=status.HTTP_403_FORBIDDEN)

        email = (user.email or user.username).strip().lower()
        challenge = _create_mfa_challenge(
            email=email,
            purpose=MfaChallenge.PURPOSE_LOGIN,
            user=user,
        )
        return Response(
            {
                "mfa_required": True,
                "challenge_id": challenge.id,
                "email": email,
                "detail": "Verification code sent to your email.",
            },
            status=status.HTTP_202_ACCEPTED,
        )


class LoginVerifyView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthScopedRateThrottle]
    throttle_scope = "auth_verify"

    def post(self, request):
        serializer = MfaVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            challenge = _verify_challenge(
                serializer.validated_data["challenge_id"],
                serializer.validated_data["code"],
                MfaChallenge.PURPOSE_LOGIN,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if not challenge.user or not challenge.user.is_active:
            return Response({"detail": "This account is inactive."}, status=status.HTTP_403_FORBIDDEN)

        return Response(
            {
                "detail": "Login verified.",
                **_token_payload(challenge.user),
            },
            status=status.HTTP_200_OK,
        )


class MfaResendView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthScopedRateThrottle]
    throttle_scope = "auth_resend"

    def post(self, request):
        if "challenge_id" not in request.data:
            return Response({"detail": "challenge_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            challenge = MfaChallenge.objects.select_related("user").get(
                id=request.data["challenge_id"],
                consumed_at__isnull=True,
            )
        except (MfaChallenge.DoesNotExist, ValueError, TypeError):
            return Response(
                {"detail": "Verification challenge was not found or was already used."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if challenge.expires_at <= timezone.now():
            return Response(
                {"detail": "Verification challenge expired. Please start again."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        min_resend_after = challenge.created_at + timedelta(
            seconds=getattr(settings, "MFA_RESEND_COOLDOWN_SECONDS", 45)
        )
        now = timezone.now()
        if now < min_resend_after:
            wait_seconds = int((min_resend_after - now).total_seconds()) + 1
            return Response(
                {
                    "detail": (
                        f"Please wait {wait_seconds} seconds before requesting a new OTP."
                    )
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        try:
            next_challenge = _resend_mfa_challenge(challenge)
        except Exception:
            return Response(
                {"detail": "Could not send OTP email. Check Gmail app password settings on the server."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response(
            {
                "mfa_required": True,
                "challenge_id": next_challenge.id,
                "email": next_challenge.email,
                "detail": "A new OTP code was sent to your email.",
            },
            status=status.HTTP_200_OK,
        )


class ForgotPasswordStartView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthScopedRateThrottle]
    throttle_scope = "auth_password_forgot"

    def post(self, request):
        serializer = ForgotPasswordStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        user = User.objects.filter(email__iexact=email).first()
        if user and user.is_active:
            challenge = _create_mfa_challenge(
                email=(user.email or user.username).strip().lower(),
                purpose=MfaChallenge.PURPOSE_PASSWORD_RESET,
                user=user,
            )
            return Response(
                {
                    "mfa_required": True,
                    "challenge_id": challenge.id,
                    "email": challenge.email,
                    "detail": "If this account exists, a verification code has been sent.",
                },
                status=status.HTTP_202_ACCEPTED,
            )
        return Response(
            {
                "mfa_required": True,
                "challenge_id": None,
                "email": email,
                "detail": "If this account exists, a verification code has been sent.",
            },
            status=status.HTTP_202_ACCEPTED,
        )


class PasswordResetVerifyView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthScopedRateThrottle]
    throttle_scope = "auth_password_reset_verify"

    def post(self, request):
        serializer = PasswordResetVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            challenge = _verify_challenge(
                serializer.validated_data["challenge_id"],
                serializer.validated_data["code"],
                MfaChallenge.PURPOSE_PASSWORD_RESET,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if not challenge.user or not challenge.user.is_active:
            return Response({"detail": "This account is inactive."}, status=status.HTTP_403_FORBIDDEN)

        challenge.user.set_password(serializer.validated_data["new_password"])
        challenge.user.save(update_fields=["password"])
        return Response(
            {"detail": "Password reset successful. Please sign in with your new password."},
            status=status.HTTP_200_OK,
        )


class BootstrapAdminSetupView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [AuthScopedRateThrottle]
    throttle_scope = "auth_bootstrap"

    def post(self, request):
        bootstrap_email = getattr(
            settings,
            "BOOTSTRAP_ADMIN_EMAIL",
            "hireai.default.admin@gmail.com",
        )
        if request.user.username != bootstrap_email:
            return Response(
                {"detail": "Only the bootstrap admin can complete first-time setup."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = BootstrapAdminSetupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        with transaction.atomic():
            admin = User.objects.create_user(
                username=data["email"],
                email=data["email"],
                password=data["password"],
                first_name=data.get("first_name", ""),
                last_name=data.get("last_name", ""),
                is_staff=True,
                is_superuser=True,
            )
            UserProfile.objects.create(user=admin, role=UserProfile.ROLE_ADMIN)
            request.user.delete()

        refresh = RefreshToken.for_user(admin)
        return Response(
            {
                "detail": "Admin account created. Bootstrap account deleted.",
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": {
                    "username": admin.username,
                    "email": admin.email,
                    "role": "admin",
                },
            },
            status=status.HTTP_201_CREATED,
        )
