const TOKEN_KEY = 'hireai_access_token';
const REFRESH_KEY = 'hireai_refresh_token';

export function getApiOrigin(): string {
  return import.meta.env.VITE_API_URL?.replace(/\/$/, '') || '';
}

export function getStoredAccessToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setStoredTokens(access: string, refresh: string) {
  sessionStorage.setItem(TOKEN_KEY, access);
  sessionStorage.setItem(REFRESH_KEY, refresh);
}

export function clearStoredTokens() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
}

export const AUTH_EXPIRED_EVENT = 'hireai-auth-expired';

function expireAuthSession() {
  clearStoredTokens();
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}

function apiUrl(path: string): string {
  const origin = getApiOrigin();
  if (origin) return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
  return path;
}

/** Short error text for failed API responses (avoids dumping Django HTML debug pages). */
async function bodyToApiErrorMessage(res: Response): Promise<string> {
  const text = await res.text();
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('application/json')) {
    try {
      const j = JSON.parse(text) as { code?: unknown; detail?: unknown; [key: string]: unknown };
      if (res.status === 401 || j.code === 'token_not_valid') {
        expireAuthSession();
        return 'Your session expired. Please sign in again.';
      }
      if (typeof j.detail === 'string' && j.detail.trim()) return j.detail.trim();
      const fieldErrors = Object.entries(j)
        .filter(([key]) => key !== 'code')
        .flatMap(([field, value]) => {
          const label = field === 'non_field_errors' ? 'Error' : field.replace(/_/g, ' ');
          if (Array.isArray(value)) {
            return value.map((item) => `${label}: ${String(item)}`);
          }
          if (typeof value === 'string') return [`${label}: ${value}`];
          return [];
        });
      if (fieldErrors.length) return fieldErrors.join(' ');
    } catch {
      /* ignore */
    }
  }
  if (/<!DOCTYPE/i.test(text) || /<html[\s>]/i.test(text)) {
    const m = text.match(/<title>\s*([^<]+?)\s*<\/title>/i);
    if (m?.[1]) return m[1].trim();
    return `Request failed (${res.status}). Check the API server and logs.`;
  }
  const trimmed = text.trim();
  return trimmed || res.statusText;
}

export type DashboardOpening = {
  job_id: string;
  company: string;
  title: string;
  salary: string;
  location: string;
  experience: string;
  url: string;
  source?: string;
  skills?: string[];
  status?: string;
  applicants?: number;
  id?: string | number;
};

export type DashboardPayload = {
  user?: {
    username: string;
    role: string;
    is_bootstrap_admin?: boolean;
  };
  kpis: Array<{
    id: string;
    label: string;
    value: string | number;
    trend: string;
    status: string;
  }>;
  trends: Array<{ month: string; hired: number; applied: number; recorded_on?: string }>;
  hiring_volume_history: Array<{ month: string; hired: number; applied: number }>;
  company_trends: Array<{ name: string; hired: number; openings: number; growth: string }>;
  openings: DashboardOpening[];
  recruiters: Array<{
    id: number;
    company?: string;
    name: string;
    designation?: string;
    email?: string;
    linkedin?: string;
    phone?: string;
    roles: string[];
    performance: number;
    hires: number;
    avatar?: string;
  }>;
  analytics: Array<{ company: string; applicants: number; hired: number; conversionRate: string }>;
  source_effectiveness: Array<{ name: string; value: number }>;
  tech_demand: Array<{ name: string; demand: number; trend: string; color: string }>;
  hiring_signals: Array<{
    company: string;
    trend: string;
    score: number;
    openings: number;
    hired: number;
    conversion_rate: string;
  }>;
  quality_of_hire_percent: string | null;
};

export type AdminDashboardPayload = {
  user_management: {
    total_users: number;
    active_users: number;
    admins: number;
    users: Array<{
      id: number;
      username: string;
      email: string;
      role: string;
      is_active: boolean;
      is_staff: boolean;
      last_login: string | null;
      date_joined: string | null;
    }>;
  };
  data_monitoring: {
    internal_openings: number;
    scraped_jobs: number;
    recruiters: number;
    companies: number;
    hiring_trend_rows: number;
    platform_cache_jobs: number;
    source_counts: Array<{ name: string; count: number }>;
  };
  scraping_status: {
    redis_configured: boolean;
    celery_broker: string;
    playwright_cdp_url: string;
    recent_jobs: Array<{
      id: number;
      source: string;
      query: string;
      title: string;
      company: string;
      scraped_at: string | null;
    }>;
  };
  analytics_dashboard: {
    hiring_volume_history: Array<{ month: string; hired: number; applied: number }>;
    company_analytics: Array<{ company: string; applicants: number; hired: number; conversionRate: string }>;
    technology_demand: Array<{ name: string; demand: number; trend: string; color: string }>;
    hiring_signals: Array<{
      company: string;
      trend: string;
      score: number;
      openings: number;
      hired: number;
      conversion_rate: string;
    }>;
    recruiter_performance: DashboardPayload['recruiters'];
  };
  reports_management: {
    available_reports: Array<{ id: string; name: string; exports: string[] }>;
    last_generated: string | null;
    scheduled_reports_enabled: boolean;
  };
};

export type MfaStartResponse = {
  mfa_required: true;
  challenge_id: number | null;
  email: string;
  detail: string;
};

export type TokenResponse = {
  access: string;
  refresh: string;
  detail?: string;
};

export async function loginRequest(username: string, password: string) {
  const res = await fetch(apiUrl('/api/token/'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error(await bodyToApiErrorMessage(res));
  }
  return res.json() as Promise<MfaStartResponse>;
}

export async function registerRequest(body: {
  username: string;
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
}) {
  const res = await fetch(apiUrl('/api/register/'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await bodyToApiErrorMessage(res));
  }
  return res.json() as Promise<MfaStartResponse>;
}

export async function verifyMfaRequest(
  purpose: 'login' | 'register',
  challengeId: number,
  code: string
): Promise<TokenResponse> {
  const endpoint = purpose === 'register' ? '/api/register/verify/' : '/api/token/verify/';
  const res = await fetch(apiUrl(endpoint), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge_id: challengeId, code }),
  });
  if (!res.ok) {
    throw new Error(await bodyToApiErrorMessage(res));
  }
  return res.json();
}

export async function resendMfaRequest(challengeId: number): Promise<MfaStartResponse> {
  const res = await fetch(apiUrl('/api/mfa/resend/'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge_id: challengeId }),
  });
  if (!res.ok) {
    throw new Error(await bodyToApiErrorMessage(res));
  }
  return res.json();
}

export async function forgotPasswordRequest(email: string): Promise<MfaStartResponse> {
  const res = await fetch(apiUrl('/api/password/forgot/'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    throw new Error(await bodyToApiErrorMessage(res));
  }
  return res.json();
}

export async function verifyPasswordResetRequest(
  challengeId: number,
  code: string,
  newPassword: string,
  confirmPassword: string
): Promise<{ detail: string }> {
  const res = await fetch(apiUrl('/api/password/reset/verify/'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challenge_id: challengeId,
      code,
      new_password: newPassword,
      confirm_password: confirmPassword,
    }),
  });
  if (!res.ok) {
    throw new Error(await bodyToApiErrorMessage(res));
  }
  return res.json();
}

export async function fetchDashboard(
  accessToken: string,
  query: Record<string, string> = {}
): Promise<DashboardPayload> {
  const qs = new URLSearchParams(query);
  const res = await fetch(apiUrl(`/api/tasks/dashboard-data/?${qs.toString()}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(await bodyToApiErrorMessage(res));
  }
  return res.json();
}

export async function setupBootstrapAdmin(
  accessToken: string,
  body: {
    email: string;
    password: string;
    first_name?: string;
    last_name?: string;
  }
) {
  const res = await fetch(apiUrl('/api/bootstrap-admin/setup/'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await bodyToApiErrorMessage(res));
  }
  return res.json() as Promise<{
    detail: string;
    access: string;
    refresh: string;
    user: { username: string; email: string; role: string };
  }>;
}

export async function fetchAdminDashboard(accessToken: string): Promise<AdminDashboardPayload> {
  const res = await fetch(apiUrl('/api/tasks/admin-dashboard/'), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(await bodyToApiErrorMessage(res));
  }
  return res.json();
}

export async function refreshSourcesRequest(accessToken: string) {
  const res = await fetch(apiUrl('/api/tasks/refresh-sources/'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(await bodyToApiErrorMessage(res));
  }
}

export async function fetchIndeedAutocomplete(
  accessToken: string,
  query: string,
  where = 'Hyderabad, Telangana'
): Promise<string[]> {
  const qs = new URLSearchParams({ query, where });
  const res = await fetch(apiUrl(`/api/tasks/indeed-autocomplete/?${qs.toString()}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(await bodyToApiErrorMessage(res));
  }
  const body = await res.json() as { suggestions?: unknown };
  return Array.isArray(body.suggestions)
    ? body.suggestions.filter((item): item is string => typeof item === 'string')
    : [];
}

export async function startDynamicJobSearch(accessToken: string, query: string) {
  const res = await fetch(apiUrl('/api/tasks/dynamic-search/'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error(await bodyToApiErrorMessage(res));
  }
  return res.json() as Promise<{ task_id: string; query: string }>;
}

export async function getDynamicJobSearchStatus(accessToken: string, taskId: string) {
  const qs = new URLSearchParams({ task_id: taskId });
  const res = await fetch(apiUrl(`/api/tasks/dynamic-search/status/?${qs.toString()}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(await bodyToApiErrorMessage(res));
  }
  return res.json() as Promise<{
    task_id: string;
    status: string;
    ready: boolean;
    count?: number;
    error?: string;
  }>;
}

export type ApolloOrganization = {
  id: string | null;
  name: string | null;
  website_url: string | null;
  primary_domain: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  phone: string | null;
  founded_year: number | null;
  logo_url: string | null;
  listed: string | null;
  languages: string[];
};

export type ApolloOrganizationsResponse = {
  organizations: ApolloOrganization[];
  pagination: {
    page: number;
    per_page: number;
    total_entries: number | null;
    total_pages: number | null;
  };
};

export async function fetchApolloOrganizations(
  accessToken: string,
  params: { keyword?: string; page?: number; per_page?: number }
): Promise<ApolloOrganizationsResponse> {
  const qs = new URLSearchParams();
  if (params.keyword) qs.set('keyword', params.keyword);
  if (params.page != null) qs.set('page', String(params.page));
  if (params.per_page != null) qs.set('per_page', String(params.per_page));
  const res = await fetch(apiUrl(`/api/tasks/apollo-organizations/?${qs.toString()}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(await bodyToApiErrorMessage(res));
  }
  return res.json();
}

export type CompanyEnrichCompany = {
  id: string | null;
  name: string | null;
  domain: string | null;
  website: string | null;
  type: string | null;
  industry: string | null;
  industries: string[];
  categories: string[];
  employees: string | null;
  revenue: string | null;
  description: string;
  keywords: string[];
  technologies: string[];
  founded_year: number | null;
  location_label: string;
  address: string | null;
  phone: string | null;
  stock_symbol: string | null;
  stock_exchange: string | null;
  total_funding: number | null;
  funding_stage: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  facebook_url: string | null;
  crunchbase_url: string | null;
  logo_url: string | null;
  page_rank: number | null;
  updated_at: string | null;
  raw?: any;
};

export type CompanyEnrichResponse = {
  companies: CompanyEnrichCompany[];
  page: number;
  totalPages: number | null;
  totalItems: number | null;
};

export async function fetchCompanyEnrichCompanies(
  accessToken: string,
  params: { query?: string; page?: number; pageSize?: number } = {}
): Promise<CompanyEnrichResponse> {
  const qs = new URLSearchParams();
  if (params.query) qs.set('query', params.query);
  if (params.page != null) qs.set('page', String(params.page));
  if (params.pageSize != null) qs.set('pageSize', String(params.pageSize));
  const res = await fetch(apiUrl(`/api/tasks/company-enrich/?${qs.toString()}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(await bodyToApiErrorMessage(res));
  }
  return res.json();
}

export type PeopleSearchPerson = {
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  position: string;
  seniority: string;
  department: string;
  company: string;
  company_domain: string;
  location: string;
  linkedin_url: string;
  image_url: string;
  source: string;
  raw?: any;
};

export type PeopleSearchResponse = {
  people: PeopleSearchPerson[];
  source: string;
  from_cache: boolean;
  totalItems: number | null;
  nextCursor: string | null;
  detail?: string;
};

export async function fetchPeopleSearch(
  accessToken: string,
  params: { query?: string; pageSize?: number; cursor?: string } = {}
): Promise<PeopleSearchResponse> {
  const qs = new URLSearchParams();
  if (params.query) qs.set('query', params.query);
  if (params.pageSize != null) qs.set('pageSize', String(params.pageSize));
  if (params.cursor) qs.set('cursor', params.cursor);
  const res = await fetch(apiUrl(`/api/tasks/people-search/?${qs.toString()}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(await bodyToApiErrorMessage(res));
  }
  return res.json();
}
