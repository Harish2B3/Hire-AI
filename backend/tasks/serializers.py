from rest_framework import serializers
from .models import CompanyAnalytics, HiringTrend, JobOpening, Recruiter, Task

class TaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = '__all__'
        read_only_fields = ('user', 'created_at', 'updated_at')


class RequirementExtractionInputSerializer(serializers.Serializer):
    description = serializers.CharField()
    provider = serializers.ChoiceField(
        choices=["openai", "gemini", "heuristic"],
        required=False,
        default="openai",
    )


class RequirementExtractionOutputSerializer(serializers.Serializer):
    role = serializers.CharField()
    skills = serializers.ListField(child=serializers.CharField())
    experience = serializers.CharField()
    provider_used = serializers.CharField()


class GeminiGenerateSerializer(serializers.Serializer):
    contents = serializers.JSONField()
    config = serializers.JSONField(required=False)


class HiringTrendSerializer(serializers.ModelSerializer):
    class Meta:
        model = HiringTrend
        fields = ("month", "hired", "applied", "recorded_on")


class JobOpeningSerializer(serializers.ModelSerializer):
    class Meta:
        model = JobOpening
        fields = ("id", "title", "department", "status", "location", "applicants", "skills")


class RecruiterSerializer(serializers.ModelSerializer):
    class Meta:
        model = Recruiter
        fields = (
            "id",
            "company",
            "name",
            "designation",
            "email",
            "linkedin",
            "phone",
            "roles",
            "performance",
            "hires",
            "avatar",
        )


class CompanyAnalyticsSerializer(serializers.ModelSerializer):
    conversionRate = serializers.SerializerMethodField()

    class Meta:
        model = CompanyAnalytics
        fields = ("company", "applicants", "hired", "conversionRate")

    def get_conversionRate(self, obj):
        if not obj.applicants:
            return "0%"
        return f"{round((obj.hired / obj.applicants) * 100, 1)}%"


class DashboardDataSerializer(serializers.Serializer):
    kpis = serializers.ListField()
    trends = HiringTrendSerializer(many=True)
    openings = JobOpeningSerializer(many=True)
    recruiters = RecruiterSerializer(many=True)
    analytics = CompanyAnalyticsSerializer(many=True)
