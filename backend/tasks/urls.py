from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    TaskViewSet,
    RequirementExtractionView,
    DashboardDataView,
    RefreshJobSourcesView,
    ApolloOrganizationsView,
    DynamicJobSearchStartView,
    DynamicJobSearchStatusView,
    GeminiGenerateView,
    IndeedAutocompleteView,
    AdminDashboardView,
    CompanyEnrichCompaniesView,
    PeopleSearchView,
)

router = DefaultRouter()
router.register(r'', TaskViewSet, basename='task')

urlpatterns = [
    path('dashboard-data/', DashboardDataView.as_view(), name='dashboard_data'),
    path('admin-dashboard/', AdminDashboardView.as_view(), name='admin_dashboard'),
    path('apollo-organizations/', ApolloOrganizationsView.as_view(), name='apollo_organizations'),
    path('people-search/', PeopleSearchView.as_view(), name='people_search'),
    path('refresh-sources/', RefreshJobSourcesView.as_view(), name='refresh_sources'),
    path('dynamic-search/', DynamicJobSearchStartView.as_view(), name='dynamic_search_start'),
    path('dynamic-search/status/', DynamicJobSearchStatusView.as_view(), name='dynamic_search_status'),
    path('gemini/generate/', GeminiGenerateView.as_view(), name='gemini_generate'),
    path('indeed-autocomplete/', IndeedAutocompleteView.as_view(), name='indeed_autocomplete'),
    path('extract-requirements/', RequirementExtractionView.as_view(), name='extract_requirements'),
    path('company-enrich/', CompanyEnrichCompaniesView.as_view(), name='company_enrich'),
    path('', include(router.urls)),
]
