/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, ArrowRight, Loader2, Zap, Eye, EyeOff, Send, User, Bot, LogOut, MessageSquarePlus, Search, FolderDot, Sparkles, Ellipsis, Mic, Headphones, ImageIcon, PenLine, Globe, ChevronDown, Gift, Plus, Briefcase, TrendingUp, BarChart2, Cpu, Users, Filter, Paperclip, X, FileText, Clock, DollarSign, Target, Award, FileCheck, Settings, Menu, ClipboardList, MapPin, Activity, FileSpreadsheet, Download, FileJson } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, LineChart, Line, AreaChart, Area, Legend, PieChart, Pie } from 'recharts';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';

import {
  clearStoredTokens,
  fetchAdminDashboard,
  fetchDashboard,
  fetchIndeedAutocomplete,
  getStoredAccessToken,
  fetchPeopleSearch,
  forgotPasswordRequest,
  geminiGenerateRequest,
  loginRequest,
  registerRequest,
  resendMfaRequest,
  fetchCompanyEnrichCompanies,
  refreshSourcesRequest,
  getDynamicJobSearchStatus,
  startDynamicJobSearch,
  setStoredTokens,
  setupBootstrapAdmin,
  verifyMfaRequest,
  AUTH_EXPIRED_EVENT,
  type CompanyEnrichCompany,
  type PeopleSearchPerson,
  type AdminDashboardPayload,
  type DashboardPayload,
  verifyPasswordResetRequest,
} from './api';

function searchTokens(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9]+/g)?.filter((token) => token.length >= 2) ?? [];
}

function openingMatchesSearch(job: {
  title: string;
  company: string;
  location: string;
  salary: string;
  experience: string;
  source?: string;
  skills?: string[];
}, search: string): boolean {
  const tokens = searchTokens(search);
  if (tokens.length === 0) return true;
  const blob = [
    job.title,
    job.company,
    job.location,
    job.salary,
    job.experience,
    job.source ?? '',
    ...(job.skills ?? []),
  ].join(' ').toLowerCase();
  const blobTokens = new Set(searchTokens(blob));
  const compactBlob = blob.replace(/[^a-z0-9]+/g, '');
  return tokens.every((token) => blobTokens.has(token) || compactBlob.includes(token));
}

function formatCompanyValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'number') return value.toLocaleString();
  return String(value);
}

function normalizedText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function estimateHiringTrendFromCompany(company: CompanyEnrichCompany): string {
  const employeeText = normalizedText(company.employees);
  const hasLargeTeamSignal =
    employeeText.includes('1000') ||
    employeeText.includes('5000') ||
    employeeText.includes('10000') ||
    employeeText.includes('enterprise') ||
    employeeText.includes('+');
  const hasFundingSignal = typeof company.total_funding === 'number' && company.total_funding > 0;
  const hasGrowthSignal =
    normalizedText(company.funding_stage).includes('series') ||
    normalizedText(company.funding_stage).includes('growth');

  if (hasGrowthSignal || (hasFundingSignal && hasLargeTeamSignal)) return 'Aggressive Hiring';
  if (hasFundingSignal || hasLargeTeamSignal) return 'Expansion Hiring';
  return 'Steady Hiring';
}

function getGeminiErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return 'Gemini request failed. Check the API key and model access.';
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authScreen, setAuthScreen] = useState<'landing' | 'features' | 'login'>('landing');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [pendingMfa, setPendingMfa] = useState<{
    challengeId: number;
    email: string;
    purpose: 'login' | 'register';
  } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [isResendingMfa, setIsResendingMfa] = useState(false);
  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);
  const [forgotPasswordStep, setForgotPasswordStep] = useState<'request' | 'verify'>('request');
  const [forgotPasswordChallengeId, setForgotPasswordChallengeId] = useState<number | null>(null);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordOtp, setForgotPasswordOtp] = useState('');
  const [forgotPasswordNewPassword, setForgotPasswordNewPassword] = useState('');
  const [forgotPasswordConfirmPassword, setForgotPasswordConfirmPassword] = useState('');
  const [isForgotPasswordLoading, setIsForgotPasswordLoading] = useState(false);
  const [isForgotPasswordResending, setIsForgotPasswordResending] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', text: string }[]>([]);
  const [input, setInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [activeTab, setActiveTab] = useState('chat');
  const [reportType, setReportType] = useState('hiring');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<any>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [trendsSearchTerm, setTrendsSearchTerm] = useState('');
  const [skillSearchTerm, setSkillSearchTerm] = useState('');
  const [openingSearchTerm, setOpeningSearchTerm] = useState('');
  const [analyticsSearchTerm, setAnalyticsSearchTerm] = useState('');
  const [openingSalaryFilter, setOpeningSalaryFilter] = useState('');
  const [openingLocationFilter, setOpeningLocationFilter] = useState('');
  const [isOpeningsFilterOpen, setIsOpeningsFilterOpen] = useState(false);
  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false);
  const [companySearchResults, setCompanySearchResults] = useState<CompanyEnrichCompany[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<CompanyEnrichCompany | null>(null);
  const [isCompanySearchLoading, setIsCompanySearchLoading] = useState(false);
  const [companySearchError, setCompanySearchError] = useState<string | null>(null);
  
  // Resume Parsing state
  const [isParsingResume, setIsParsingResume] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<{name: string, roles: string[], skills: string[]} | null>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);

  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [setupAdminEmail, setSetupAdminEmail] = useState('');
  const [setupAdminPassword, setSetupAdminPassword] = useState('');
  const [setupAdminConfirm, setSetupAdminConfirm] = useState('');
  const [setupAdminError, setSetupAdminError] = useState<string | null>(null);
  const [isSetupAdminSaving, setIsSetupAdminSaving] = useState(false);

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardPayload | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [adminData, setAdminData] = useState<AdminDashboardPayload | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [adminSection, setAdminSection] = useState('users');
  const [isRefreshingSources, setIsRefreshingSources] = useState(false);
  const [isDynamicJobSearchLoading, setIsDynamicJobSearchLoading] = useState(false);
  const [dynamicJobSearchError, setDynamicJobSearchError] = useState<string | null>(null);
  const [debouncedOpeningSearch, setDebouncedOpeningSearch] = useState('');
  const [openingSuggestions, setOpeningSuggestions] = useState<string[]>([]);
  const [isOpeningSuggestionsLoading, setIsOpeningSuggestionsLoading] = useState(false);
  const [isOpeningSuggestOpen, setIsOpeningSuggestOpen] = useState(false);
  const [forcedOpeningSearch, setForcedOpeningSearch] = useState<{ term: string; id: number } | null>(null);

  const [recruiterOrgKeywordInput, setRecruiterOrgKeywordInput] = useState('');
  const [recruiterOrgKeyword, setRecruiterOrgKeyword] = useState('');
  const [peopleResults, setPeopleResults] = useState<PeopleSearchPerson[]>([]);
  const [peopleSource, setPeopleSource] = useState('');
  const [peopleTotal, setPeopleTotal] = useState<number | null>(null);
  const [peopleNextCursor, setPeopleNextCursor] = useState<string | null>(null);
  const [peopleSearchLoading, setPeopleSearchLoading] = useState(false);
  const [peopleSearchError, setPeopleSearchError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const generateGeminiContent = async (request: {
    contents: any;
    config?: Record<string, unknown>;
  }) => {
    if (!accessToken) {
      throw new Error('Please sign in before using Gemini features.');
    }
    return geminiGenerateRequest(accessToken, request);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dashboardDataRef = useRef<DashboardPayload | null>(null);
  const dynamicSearchDoneForTermRef = useRef<string | null>(null);
  const didAutoRefreshSourcesRef = useRef(false);

  const handleSavePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      alert("Passwords do not match!");
      return;
    }
    // Simulate API call
    alert("Password updated successfully!");
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setIsAccountModalOpen(false);
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    alert("Settings saved successfully!");
    setIsSettingsModalOpen(false);
  };

  const handleResumeFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResumeFile(file);
    parseResume(file);
  };

  const parseResume = async (file: File) => {
    setIsParsingResume(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target?.result as string;
        
        try {
          const result = await generateGeminiContent({
            contents: `
              Analyze the following resume text and extract the information in strict JSON format.
              JSON structure:
              {
                "name": "Full Name",
                "roles": ["Extracted Role 1", "Extracted Role 2"],
                "skills": ["Extracted Skill 1", "Extracted Skill 2", ...]
              }
              
              Resume Text:
              ${text}
            `
          });
          const responseText = result.text;
          
          // Clean the response text for JSON parsing (sometimes AI adds markdown blocks)
          const jsonMatch = responseText?.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const data = JSON.parse(jsonMatch[0]);
            setParsedData(data);
          }
        } catch (err) {
          console.error("AI Parsing failed:", err);
          setNotification({ type: 'error', message: getGeminiErrorMessage(err) });
        } finally {
          setIsParsingResume(false);
        }
      };
      
      // Read as text for simplicity in this demo. 
      // For PDF/DOCX, a real app would use a library or Gemini's multimodal capabilities.
      reader.readAsText(file);
    } catch (err) {
      console.error(err);
      setIsParsingResume(false);
    }
  };

  const openings = dashboardData?.openings ?? [];
  const filteredOpenings = useMemo(() => {
    return openings.filter((job) => {
      const matchSearch = openingMatchesSearch(job, openingSearchTerm);
      const matchSalary = openingSalaryFilter === '' || job.salary === openingSalaryFilter;
      const matchLocation = openingLocationFilter === '' || job.location === openingLocationFilter;
      return matchSearch && matchSalary && matchLocation;
    });
  }, [openings, openingSearchTerm, openingSalaryFilter, openingLocationFilter]);
  dashboardDataRef.current = dashboardData;
  const companyTrends = dashboardData?.company_trends ?? [];
  const hiringSignals = dashboardData?.hiring_signals ?? [];
  const selectedTrendQuery = useMemo(
    () => normalizedText(selectedCompany?.name || trendsSearchTerm),
    [selectedCompany, trendsSearchTerm]
  );
  const filteredCompanyTrends = useMemo(() => {
    if (!selectedTrendQuery) return companyTrends;
    return companyTrends.filter((company) => normalizedText(company.name).includes(selectedTrendQuery));
  }, [companyTrends, selectedTrendQuery]);
  const chartCompanyTrends = filteredCompanyTrends.length > 0 ? filteredCompanyTrends : companyTrends;
  const selectedCompanySignal = useMemo(() => {
    if (!selectedTrendQuery) return null;
    return hiringSignals.find((signal) => normalizedText(signal.company).includes(selectedTrendQuery)) ?? null;
  }, [hiringSignals, selectedTrendQuery]);
  const selectedCompanyTrend = useMemo(() => {
    if (!selectedTrendQuery) return null;
    return companyTrends.find((company) => normalizedText(company.name).includes(selectedTrendQuery)) ?? null;
  }, [companyTrends, selectedTrendQuery]);
  const inferredCompanyTrend = selectedCompany ? estimateHiringTrendFromCompany(selectedCompany) : null;
  const resumeMatchTerms = useMemo(() => {
    if (!parsedData) return [];
    return Array.from(new Set([
      ...parsedData.skills.flatMap(searchTokens),
      ...parsedData.roles.flatMap(searchTokens),
    ])).filter((token) => token.length >= 3);
  }, [parsedData]);
  const resumeMatchedOpenings = useMemo(() => {
    if (!parsedData || resumeMatchTerms.length === 0) return [];
    return openings
      .map((job) => {
        const titleTokens = new Set(searchTokens(job.title));
        const skillTokens = new Set((job.skills ?? []).flatMap(searchTokens));
        const blobTokens = new Set(searchTokens([
          job.title,
          job.company,
          job.location,
          job.experience,
          job.source ?? '',
          ...(job.skills ?? []),
        ].join(' ')));
        let score = 0;
        for (const term of resumeMatchTerms) {
          if (skillTokens.has(term)) score += 12;
          else if (titleTokens.has(term)) score += 10;
          else if (blobTokens.has(term)) score += 4;
        }
        const roleHit = parsedData.roles.some((role) => {
          const roleText = normalizedText(role);
          const titleText = normalizedText(job.title);
          return roleText && (titleText.includes(roleText) || roleText.includes(titleText));
        });
        if (roleHit) score += 18;
        return { job, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [openings, parsedData, resumeMatchTerms]);
  const resumeMatchedCompanies = useMemo(() => {
    if (!parsedData) return [];
    const companyScores = new Map<string, { name: string; openings: number; score: number; growth: string }>();
    for (const { job, score } of resumeMatchedOpenings) {
      const name = job.company || 'Unknown';
      const existing = companyScores.get(name) ?? { name, openings: 0, score: 0, growth: 'Matched roles' };
      existing.openings += 1;
      existing.score += score;
      const trend = companyTrends.find((company) => normalizedText(company.name) === normalizedText(name));
      if (trend) {
        existing.openings = Math.max(existing.openings, trend.openings);
        existing.growth = trend.growth;
      }
      companyScores.set(name, existing);
    }
    for (const company of companyTrends) {
      const blobTokens = new Set(searchTokens(company.name));
      const termHits = resumeMatchTerms.filter((term) => blobTokens.has(term)).length;
      if (termHits > 0 && !companyScores.has(company.name)) {
        companyScores.set(company.name, {
          name: company.name,
          openings: company.openings,
          score: termHits * 8,
          growth: company.growth,
        });
      }
    }
    return Array.from(companyScores.values())
      .map((company) => ({
        ...company,
        matchScore: Math.min(98, Math.max(55, Math.round(45 + company.score * 2))),
      }))
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 8);
  }, [companyTrends, parsedData, resumeMatchedOpenings, resumeMatchTerms]);
  const hiringVolumeHistory = useMemo(() => {
    const d = dashboardData;
    if (!d) return [];
    if (d.hiring_volume_history?.length) return d.hiring_volume_history;
    return (d.trends ?? []).map((t) => ({
      month: t.month,
      hired: t.hired,
      applied: t.applied,
    }));
  }, [dashboardData]);

  const techDemand = dashboardData?.tech_demand ?? [];
  const sourceEffectiveness = dashboardData?.source_effectiveness ?? [];
  const isAdmin = dashboardData?.user?.role === 'admin';

  const hiringMetrics = useMemo(() => {
    const kpis = dashboardData?.kpis ?? [];
    const icons = [Clock, DollarSign, Target, Users];
    return kpis.slice(0, 4).map((k, i) => ({
      title: k.label,
      value: String(k.value),
      trend: k.trend,
      icon: icons[i % icons.length],
      isGood: k.status !== 'decrease',
    }));
  }, [dashboardData]);

  useEffect(() => {
    if (window.location.hash === '#login') {
      setAuthScreen('login');
    } else if (window.location.hash === '#features') {
      setAuthScreen('features');
    }
  }, []);

  useEffect(() => {
    const storedAccess = getStoredAccessToken();
    if (!storedAccess) return;
    let cancelled = false;
    setIsDashboardLoading(true);
    fetchDashboard(storedAccess, {}, { suppressAuthExpiredEvent: true })
      .then((payload) => {
        if (cancelled) return;
        setAccessToken(storedAccess);
        setDashboardData(payload);
        setIsLoggedIn(true);
        setAuthScreen('landing');
      })
      .catch(() => {
        if (!cancelled) clearStoredTokens();
      })
      .finally(() => {
        if (!cancelled) setIsDashboardLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Client-side deterrent only; cannot fully block browser DevTools.
    const onContextMenu = (event: MouseEvent) => event.preventDefault();
    const onKeyDown = (event: KeyboardEvent) => {
      const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
      const ctrlOrMeta = event.ctrlKey || event.metaKey;
      if (
        event.key === 'F12' ||
        (ctrlOrMeta && event.shiftKey && (key === 'i' || key === 'j')) ||
        (ctrlOrMeta && key === 'u')
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    const handleExpired = () => {
      setAccessToken(null);
      setDashboardData(null);
      setAdminData(null);
      setDashboardError(null);
      setAdminError(null);
      setIsLoggedIn(false);
      setAuthScreen('login');
      setPendingMfa(null);
      setMfaCode('');
      setIsDynamicJobSearchLoading(false);
      setIsRefreshingSources(false);
      dynamicSearchDoneForTermRef.current = null;
      didAutoRefreshSourcesRef.current = false;
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedOpeningSearch(openingSearchTerm);
    }, 600);
    return () => window.clearTimeout(t);
  }, [openingSearchTerm]);

  useEffect(() => {
    if (!notification) return;
    const t = window.setTimeout(() => setNotification(null), 4500);
    return () => window.clearTimeout(t);
  }, [notification]);

  useEffect(() => {
    if (!isLoggedIn || !accessToken || activeTab !== 'openings') return;
    const term = openingSearchTerm.trim();
    if (term.length < 2) {
      setOpeningSuggestions([]);
      setIsOpeningSuggestOpen(false);
      setIsOpeningSuggestionsLoading(false);
      return;
    }

    let cancelled = false;
    setIsOpeningSuggestionsLoading(true);
    const t = window.setTimeout(() => {
      fetchIndeedAutocomplete(accessToken, term)
        .then((suggestions) => {
          if (!cancelled) {
            setOpeningSuggestions(suggestions);
            setIsOpeningSuggestOpen(suggestions.length > 0);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setOpeningSuggestions([]);
            setIsOpeningSuggestOpen(false);
          }
        })
        .finally(() => {
          if (!cancelled) setIsOpeningSuggestionsLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [activeTab, accessToken, isLoggedIn, openingSearchTerm]);

  useEffect(() => {
    if (!isLoggedIn || !accessToken) return;
    let cancelled = false;
    setIsDashboardLoading(true);
    const q: Record<string, string> = {};
    if (debouncedOpeningSearch.trim()) q.search = debouncedOpeningSearch.trim();
    fetchDashboard(accessToken, q)
      .then((d) => {
        if (!cancelled) {
          setDashboardData(d);
          setDashboardError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setDashboardError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsDashboardLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, accessToken, debouncedOpeningSearch]);

  useEffect(() => {
    if (!isLoggedIn || !accessToken) return;
    if (isDashboardLoading) return;
    const termLive = openingSearchTerm.trim();
    const term = debouncedOpeningSearch.trim();
    const isForced = forcedOpeningSearch?.term === term;
    if (termLive.length < 2) {
      dynamicSearchDoneForTermRef.current = null;
      setIsDynamicJobSearchLoading(false);
      return;
    }
    if (term.length < 2 || term !== termLive) {
      return;
    }

    const d = dashboardDataRef.current;
    if (!d) return;
    const rows = d.openings ?? [];
    if (rows.length > 0 && !isForced) {
      dynamicSearchDoneForTermRef.current = null;
      setDynamicJobSearchError(null);
      setIsDynamicJobSearchLoading(false);
      return;
    }

    if (dynamicSearchDoneForTermRef.current === term && !isForced) {
      return;
    }

    let cancelled = false;
    setIsDynamicJobSearchLoading(true);
    setDynamicJobSearchError(null);

    const run = async () => {
      const pollDeadline = Date.now() + 90_000;
      try {
        const { task_id } = await startDynamicJobSearch(accessToken, term);
        if (cancelled) return;
        dynamicSearchDoneForTermRef.current = term;
        while (!cancelled && Date.now() < pollDeadline) {
          const st = await getDynamicJobSearchStatus(accessToken, task_id);
          const q: Record<string, string> = { search: term };
          const fresh = await fetchDashboard(accessToken, q);
          if (!cancelled) {
            setDashboardData(fresh);
          }
          if (st.status === 'FAILURE') {
            if (!cancelled) {
              dynamicSearchDoneForTermRef.current = null;
              setDynamicJobSearchError(st.error || 'Worker reported a failure.');
            }
            return;
          }
          if (st.ready && st.status === 'SUCCESS') {
            if (!cancelled) {
              setForcedOpeningSearch(null);
              const found = (fresh.openings ?? []).length;
              if (found === 0 && (st.count ?? 0) === 0) {
                setDynamicJobSearchError(
                  'No roles matched your search in our feeds or on external listings.',
                );
              }
            }
            return;
          }
          await new Promise((r) => window.setTimeout(r, 2000));
        }
        if (!cancelled) {
          dynamicSearchDoneForTermRef.current = null;
          setDynamicJobSearchError(
            'Search is taking longer than expected. Start the Celery worker with Redis so background jobs can run.',
          );
          setForcedOpeningSearch(null);
        }
      } catch (err) {
        if (!cancelled) {
          dynamicSearchDoneForTermRef.current = null;
          setDynamicJobSearchError(err instanceof Error ? err.message : 'Dynamic search failed');
          setForcedOpeningSearch(null);
        }
      } finally {
        if (!cancelled) setIsDynamicJobSearchLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    isLoggedIn,
    accessToken,
    isDashboardLoading,
    debouncedOpeningSearch,
    forcedOpeningSearch,
    openingSearchTerm,
  ]);

  useEffect(() => {
    if (activeTab !== 'recruiters' || !accessToken) return;
    let cancelled = false;
    setPeopleSearchLoading(true);
    setPeopleSearchError(null);
    fetchPeopleSearch(accessToken, {
      query: recruiterOrgKeyword || undefined,
      pageSize: 25,
    })
      .then((r) => {
        if (!cancelled) {
          setPeopleResults(r.people);
          setPeopleSource(r.from_cache ? 'cache' : r.source);
          setPeopleTotal(r.totalItems);
          setPeopleNextCursor(r.nextCursor);
          if (r.detail && r.people.length === 0) setPeopleSearchError(r.detail);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setPeopleSearchError(err.message);
      })
      .finally(() => {
        if (!cancelled) setPeopleSearchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, accessToken, recruiterOrgKeyword]);

  useEffect(() => {
    if (activeTab !== 'admin' || !accessToken || !isAdmin) return;
    let cancelled = false;
    setIsAdminLoading(true);
    setAdminError(null);
    fetchAdminDashboard(accessToken)
      .then((payload) => {
        if (!cancelled) setAdminData(payload);
      })
      .catch((err: Error) => {
        if (!cancelled) setAdminError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsAdminLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, accessToken, isAdmin]);

  const handleRefreshSources = async () => {
    if (!accessToken) return;
    setIsRefreshingSources(true);
    setDashboardError(null);
    try {
      await refreshSourcesRequest(accessToken);
      const q: Record<string, string> = {};
      if (openingSearchTerm.trim()) q.search = openingSearchTerm.trim();
      const d = await fetchDashboard(accessToken, q);
      setDashboardData(d);
    } catch (err) {
      setDashboardError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setIsRefreshingSources(false);
    }
  };

  useEffect(() => {
    if (!isLoggedIn || !accessToken) return;
    if (isRefreshingSources) return;
    if (didAutoRefreshSourcesRef.current) return;
    if (activeTab !== 'openings' && activeTab !== 'tech') return;
    didAutoRefreshSourcesRef.current = true;
    void handleRefreshSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, accessToken, isLoggedIn, isRefreshingSources]);

  useEffect(() => {
    if (activeTab === 'admin' && dashboardData && !isAdmin) {
      setActiveTab('chat');
    }
  }, [activeTab, dashboardData, isAdmin]);

  const handleLogout = () => {
    clearStoredTokens();
    setAccessToken(null);
    setDashboardData(null);
    setAdminData(null);
    setIsLoggedIn(false);
    setAuthScreen('landing');
    setPendingMfa(null);
    setMfaCode('');
    didAutoRefreshSourcesRef.current = false;
  };

  const showLoginPage = () => {
    setAuthScreen('login');
    setIsForgotPasswordMode(false);
    setForgotPasswordStep('request');
    setForgotPasswordChallengeId(null);
    setForgotPasswordOtp('');
    setForgotPasswordNewPassword('');
    setForgotPasswordConfirmPassword('');
    window.history.pushState(null, '', '#login');
  };

  const showFeaturesPage = () => {
    setAuthScreen('features');
    window.history.pushState(null, '', '#features');
  };

  const showLandingPage = () => {
    setAuthScreen('landing');
    setPendingMfa(null);
    setMfaCode('');
    window.history.pushState(null, '', window.location.pathname);
  };

  const handleForceOpeningSearch = () => {
    const term = openingSearchTerm.trim();
    if (term.length < 2) return;
    dynamicSearchDoneForTermRef.current = null;
    setDynamicJobSearchError(null);
    setDebouncedOpeningSearch(term);
    setForcedOpeningSearch({ term, id: Date.now() });
    setIsOpeningSuggestOpen(false);
  };

  const handleBootstrapAdminSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    const nextEmail = setupAdminEmail.trim().toLowerCase();
    if (!nextEmail.endsWith('@gmail.com')) {
      setSetupAdminError('Use a valid Gmail address.');
      return;
    }
    if (setupAdminPassword !== setupAdminConfirm) {
      setSetupAdminError('Passwords do not match.');
      return;
    }
    setIsSetupAdminSaving(true);
    setSetupAdminError(null);
    try {
      const result = await setupBootstrapAdmin(accessToken, {
        email: nextEmail,
        password: setupAdminPassword,
      });
      setStoredTokens(result.access, result.refresh);
      setAccessToken(result.access);
      setEmail(nextEmail);
      setPassword('');
      setSetupAdminEmail('');
      setSetupAdminPassword('');
      setSetupAdminConfirm('');
      const fresh = await fetchDashboard(result.access);
      setDashboardData(fresh);
    } catch (err) {
      setSetupAdminError(err instanceof Error ? err.message : 'Could not create admin account.');
    } finally {
      setIsSetupAdminSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setDashboardError(null);
    setPendingMfa(null);
    setMfaCode('');
    try {
      if (isRegistering) {
        const res = await registerRequest({
          username: email,
          email,
          password,
        });
        setPendingMfa({
          challengeId: res.challenge_id,
          email: res.email,
          purpose: 'register',
        });
      } else {
        const res = await loginRequest(email, password);
        if ('access' in res && 'refresh' in res) {
          setAccessToken(res.access);
          setStoredTokens(res.access, res.refresh, rememberMe);
          setPassword('');
          setRememberMe(false);
          setIsLoggedIn(true);
          const fresh = await fetchDashboard(res.access);
          setDashboardData(fresh);
        } else {
          setPendingMfa({
            challengeId: res.challenge_id,
            email: res.email,
            purpose: 'login',
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      setDashboardError(msg);
      setNotification({ type: 'error', message: msg });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingMfa) return;
    setIsLoading(true);
    setDashboardError(null);
    try {
      const tokens = await verifyMfaRequest(pendingMfa.purpose, pendingMfa.challengeId, mfaCode.trim());
      setAccessToken(tokens.access);
      setStoredTokens(tokens.access, tokens.refresh, pendingMfa.purpose === 'login' && rememberMe);
      setPendingMfa(null);
      setMfaCode('');
      setPassword('');
      setRememberMe(false);
      setIsLoggedIn(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Verification failed';
      setDashboardError(msg);
      setNotification({ type: 'error', message: msg });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendMfa = async () => {
    if (!pendingMfa) return;
    setIsResendingMfa(true);
    setDashboardError(null);
    try {
      const res = await resendMfaRequest(pendingMfa.challengeId);
      setPendingMfa({
        challengeId: res.challenge_id,
        email: res.email,
        purpose: pendingMfa.purpose,
      });
      setMfaCode('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not resend OTP';
      setDashboardError(msg);
      setNotification({ type: 'error', message: msg });
    } finally {
      setIsResendingMfa(false);
    }
  };

  const handleCompanySearch = async (e?: React.SyntheticEvent, queryOverride?: string) => {
    if (e) e.preventDefault();
    const query = (queryOverride ?? analyticsSearchTerm).trim();
    if (!accessToken || !query) return;
    setIsCompanySearchLoading(true);
    setCompanySearchError(null);
    setSelectedCompany(null);
    try {
      const res = await fetchCompanyEnrichCompanies(accessToken, { query, page: 1, pageSize: 25 });
      setCompanySearchResults(res.companies);
      if (res.companies.length > 0) {
        setSelectedCompany(res.companies[0]);
      } else {
        setCompanySearchError("No company details found.");
      }
    } catch (err) {
      setCompanySearchError(err instanceof Error ? err.message : "Failed to fetch company details");
    } finally {
      setIsCompanySearchLoading(false);
    }
  };

  const handleForgotPasswordStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsForgotPasswordLoading(true);
    setDashboardError(null);
    try {
      const res = await forgotPasswordRequest(forgotPasswordEmail.trim().toLowerCase());
      if (!res.challenge_id) {
        throw new Error('If the account exists, OTP was sent. Please try again in a moment.');
      }
      setForgotPasswordChallengeId(res.challenge_id);
      setForgotPasswordStep('verify');
      setNotification({ type: 'success', message: 'OTP sent. Verify it and set your new password.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not start password reset';
      setDashboardError(msg);
      setNotification({ type: 'error', message: msg });
    } finally {
      setIsForgotPasswordLoading(false);
    }
  };

  const handleForgotPasswordVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotPasswordChallengeId) return;
    setIsForgotPasswordLoading(true);
    setDashboardError(null);
    try {
      const res = await verifyPasswordResetRequest(
        forgotPasswordChallengeId,
        forgotPasswordOtp.trim(),
        forgotPasswordNewPassword,
        forgotPasswordConfirmPassword
      );
      setNotification({ type: 'success', message: res.detail });
      setIsForgotPasswordMode(false);
      setForgotPasswordStep('request');
      setForgotPasswordChallengeId(null);
      setForgotPasswordOtp('');
      setForgotPasswordNewPassword('');
      setForgotPasswordConfirmPassword('');
      setPassword('');
      setIsRegistering(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Password reset failed';
      setDashboardError(msg);
      setNotification({ type: 'error', message: msg });
    } finally {
      setIsForgotPasswordLoading(false);
    }
  };

  const handleForgotPasswordResend = async () => {
    if (!forgotPasswordChallengeId) return;
    setIsForgotPasswordResending(true);
    setDashboardError(null);
    try {
      const res = await resendMfaRequest(forgotPasswordChallengeId);
      if (res.challenge_id) setForgotPasswordChallengeId(res.challenge_id);
      setForgotPasswordOtp('');
      setNotification({ type: 'success', message: 'A new OTP has been sent.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not resend OTP';
      setDashboardError(msg);
      setNotification({ type: 'error', message: msg });
    } finally {
      setIsForgotPasswordResending(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() && selectedFiles.length === 0) return;
    
    const currentInput = input;
    const currentFiles = [...selectedFiles];
    
    setInput('');
    setSelectedFiles([]);
    setIsChatLoading(true);

    const userMessageText = currentInput + (currentFiles.length > 0 ? `\n\n[Attached ${currentFiles.length} file(s)]` : '');
    const userMessage = { role: 'user' as const, text: userMessageText };
    setMessages(prev => [...prev, userMessage]);

    try {
      const fileParts = await Promise.all(currentFiles.map(async (file) => {
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        return {
          inlineData: {
            data: base64Data,
            mimeType: file.type || 'text/plain'
          }
        };
      }));

      const requestContents = [
        ...fileParts,
        currentInput
      ].filter(x => x);

      const response = await generateGeminiContent({
        contents: requestContents,
        config: {
          systemInstruction: "You are Hire AI, a highly professional and expert guide for recruitment and job searching. Your primary role is to help users find suitable companies based on their Job Descriptions (JD), resumes, queries, or specific details they provide. Analyze the provided context meticulously, identify key skills, experiences, and requirements, and suggest relevant companies, job titles, or market trends. Maintain a formal, encouraging, and insightful tone. Provide actionable advice tailored to their profile."
        }
      });
      setMessages(prev => [...prev, { role: 'ai', text: response.text || "Sorry, I couldn't generate a response." }]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'ai', text: `Error: ${getGeminiErrorMessage(error)}` }]);
      setNotification({ type: 'error', message: getGeminiErrorMessage(error) });
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {notification && (
          <motion.div
            key="notification"
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className={`fixed right-5 top-5 z-[100] flex w-[min(420px,calc(100vw-40px))] items-start gap-3 rounded-lg border p-4 shadow-lg ${
              notification.type === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-900'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900'
            }`}
          >
            <div className={`mt-0.5 h-2.5 w-2.5 rounded-full ${notification.type === 'error' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{notification.type === 'error' ? 'Action needed' : 'Success'}</div>
              <div className="mt-1 text-sm leading-5">{notification.message}</div>
            </div>
            <button
              type="button"
              onClick={() => setNotification(null)}
              className="rounded-md p-1 text-current opacity-60 transition-opacity hover:opacity-100"
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence mode="wait">
        {!isLoggedIn && authScreen === 'landing' ? (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="min-h-screen bg-white text-slate-950 font-sans antialiased"
          >
            <section className="border-b border-slate-200 bg-white">
              <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
                    <Zap size={19} className="text-white" fill="currentColor" />
                  </div>
                  <span className="text-xl font-bold tracking-tight text-slate-900">Hire AI</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={showLandingPage}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
                  >
                    Home
                  </button>
                  <button
                    onClick={showFeaturesPage}
                    className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                  >
                    Features
                  </button>
                  <button
                    onClick={showLoginPage}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                  >
                    Login
                    <ArrowRight size={16} />
                  </button>
                </div>
              </nav>
            </section>

            <section className="bg-slate-50 px-6 py-16 lg:px-8">
              <div className="mx-auto max-w-7xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm lg:p-12">
                <div className="max-w-4xl">
                  <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                    Hiring intelligence dashboard
                  </div>
                  <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-slate-950 md:text-6xl">
                    Professional hiring operations, centralized in one workspace.
                  </h1>
                  <p className="mt-6 max-w-3xl text-base leading-8 text-slate-600 md:text-lg">
                    Turn job signals, company data, recruiter intelligence, and market demand into a focused hiring command center.
                  </p>
                  <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                    <button
                      onClick={showFeaturesPage}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      Explore Features
                      <ArrowRight size={18} />
                    </button>
                    <button
                      onClick={showLoginPage}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                    >
                      Start Now
                      <ArrowRight size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-white px-6 py-12 lg:px-8">
              <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 md:grid-cols-4">
                {[
                  { label: 'Hiring teams onboarded', value: '120+' },
                  { label: 'Openings tracked monthly', value: '35K+' },
                  { label: 'Company profiles enriched', value: '8K+' },
                  { label: 'Average report prep time reduced', value: '62%' },
                ].map((metric) => (
                  <div key={metric.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <div className="text-2xl font-semibold text-slate-900">{metric.value}</div>
                    <div className="mt-1 text-xs text-slate-600">{metric.label}</div>
                  </div>
                ))}
              </div>
            </section>

            <section id="platform" className="bg-white px-6 py-14 lg:px-8">
              <div className="mx-auto max-w-7xl">
                <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-600">One operating view</p>
                    <h2 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950">Built for active hiring decisions</h2>
                  </div>
                  <p className="max-w-xl text-sm leading-6 text-slate-600">
                    Move from scattered job boards and company lookups to one clear workspace for openings, trends, enriched company analytics, skills, and reports.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {[
                    { icon: Briefcase, title: 'Openings', body: 'Track live roles, internal jobs, applicants, and search signals in one place.' },
                    { icon: Activity, title: 'Company Analytics', body: 'Search a company and review enriched profile, location, funding, technology, and web signals.' },
                    { icon: FileSpreadsheet, title: 'Reports', body: 'Export clean hiring, company, technology, and location reports for review.' },
                  ].map((item) => (
                    <div key={item.title} className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                      <item.icon className="mb-4 text-blue-600" size={24} />
                      <h3 className="text-base font-semibold text-slate-950">{item.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{item.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="bg-slate-50 px-6 py-14 lg:px-8">
              <div className="mx-auto max-w-7xl">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-600">How it works</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">A simple workflow for fast hiring execution</h2>
                <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-4">
                  {[
                    { icon: Search, title: 'Collect', body: 'Ingest openings and market role signals from connected sources.' },
                    { icon: Activity, title: 'Enrich', body: 'Add company and recruiter intelligence to every opportunity.' },
                    { icon: TrendingUp, title: 'Analyze', body: 'Track hiring trends, demand changes, and performance indicators.' },
                    { icon: FileSpreadsheet, title: 'Report', body: 'Export structured summaries for leadership and hiring reviews.' },
                  ].map((step, index) => (
                    <div key={step.title} className="rounded-2xl border border-slate-200 bg-white p-5">
                      <div className="mb-3 flex items-center justify-between">
                        <step.icon size={18} className="text-blue-600" />
                        <span className="text-xs font-semibold text-slate-400">0{index + 1}</span>
                      </div>
                      <h3 className="text-base font-semibold text-slate-900">{step.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{step.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="bg-white px-6 py-14 lg:px-8">
              <div className="mx-auto grid max-w-7xl grid-cols-1 gap-5 md:grid-cols-3">
                {[
                  { icon: Target, title: 'Higher quality pipelines', body: 'Focus hiring decisions on verified role, company, and skills intelligence.' },
                  { icon: Clock, title: 'Faster hiring reviews', body: 'Reduce manual data collection and move to decision-ready dashboards.' },
                  { icon: Award, title: 'Executive-ready reporting', body: 'Deliver consistent metrics and summaries across teams and leadership.' },
                ].map((item) => (
                  <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                    <item.icon size={20} className="text-blue-600" />
                    <h3 className="mt-4 text-lg font-semibold text-slate-900">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{item.body}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-slate-900 px-6 py-14 text-white lg:px-8">
              <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-5 md:flex-row md:items-center">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-200">Get started</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight">Build a modern hiring operating system with Hire AI.</h2>
                </div>
                <button
                  onClick={showLoginPage}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-500"
                >
                  Continue to Login
                  <ArrowRight size={16} />
                </button>
              </div>
            </section>
          </motion.div>
        ) : !isLoggedIn && authScreen === 'features' ? (
          <motion.div
            key="features"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="min-h-screen bg-slate-50 text-slate-950 font-sans antialiased"
          >
            <div className="mx-auto max-w-7xl px-6 py-6 lg:px-8">
              <nav className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
                    <Zap size={16} className="text-white" fill="currentColor" />
                  </div>
                  <span className="text-base font-bold tracking-tight">Hire AI</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={showLandingPage} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Home</button>
                  <button onClick={showFeaturesPage} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Features</button>
                  <button onClick={showLoginPage} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Login</button>
                </div>
              </nav>

              <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm lg:p-12">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-600">Platform capabilities</p>
                <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950 lg:text-5xl">Everything your hiring team needs in one professional workspace.</h1>
                <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
                  Hire AI combines openings intelligence, company enrichment, recruiter visibility, skill demand analysis, and exports into a single workflow that supports real hiring decisions.
                </p>
              </section>

              <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[
                  { icon: Briefcase, title: 'Openings Intelligence', body: 'Track active roles, applicants, and source-level visibility with structured filtering.' },
                  { icon: TrendingUp, title: 'Hiring Trends', body: 'Understand hiring momentum and company-level signals with dynamic trend analysis.' },
                  { icon: Activity, title: 'Company Enrichment', body: 'Search and review enriched company details including funding, industry, and technology stack.' },
                  { icon: Cpu, title: 'Tech Demand', body: 'See market technology demand patterns and emerging skill shifts in one charted view.' },
                  { icon: Users, title: 'Recruiter Insights', body: 'Manage recruiter contact intelligence and hiring performance summaries.' },
                  { icon: FileSpreadsheet, title: 'Executive Reporting', body: 'Export polished hiring reports as PDF, CSV, and Excel for stakeholder reviews.' },
                ].map((item) => (
                  <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <item.icon size={22} className="text-blue-600" />
                    <h3 className="mt-4 text-lg font-semibold text-slate-900">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{item.body}</p>
                  </div>
                ))}
              </section>

              <section className="mt-8 mb-8 flex flex-col items-start justify-between gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-6 md:flex-row md:items-center">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Ready to launch your hiring command center?</h2>
                  <p className="mt-1 text-sm text-slate-600">Sign in to access the dashboard, analytics, and automated workflows.</p>
                </div>
                <button onClick={showLoginPage} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
                  Continue to Login
                  <ArrowRight size={16} />
                </button>
              </section>
            </div>
          </motion.div>
        ) : !isLoggedIn ? (
          <motion.div 
            key="login"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4 antialiased selection:bg-blue-500 selection:text-white font-sans text-slate-900"
          >
            <div className="w-full max-w-[680px] min-h-[480px] bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.06)] border border-slate-200 flex flex-col md:flex-row overflow-hidden">
              {/* Branding Side (Left) */}
              <div className="w-full md:w-[240px] bg-[#0F172A] p-7 flex flex-col justify-between text-white relative overflow-hidden">
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-5">
                    <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
                      <Zap size={16} className="text-white" fill="currentColor" />
                    </div>
                    <span className="text-base font-bold tracking-tight">Hire AI</span>
                  </div>
                  <h2 className="text-xl font-semibold leading-tight mb-3 text-white">
                    {isRegistering ? "Join our network." : "Enterprise Scale."}
                  </h2>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    {isRegistering 
                      ? "Create an account to start managing your infrastructure." 
                      : "Access your unified dashboard for real-time analytics and monitoring."}
                  </p>
                </div>
                
                <div className="relative z-10 mt-6 md:mt-0">
                  <div className="flex items-center gap-2 p-2.5 bg-white/5 rounded-xl border border-white/10">
                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></div>
                    <span className="text-[9px] font-medium text-slate-300">Systems operational</span>
                  </div>
                </div>

                <div className="absolute top-0 right-0 w-48 h-48 bg-blue-600/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl opacity-50"></div>
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-600/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl opacity-50"></div>
              </div>

              {/* Form Side (Right) */}
              <div className="flex-1 p-8 md:p-10 flex flex-col justify-center bg-white">
                <div className="mb-6">
                  <button
                    type="button"
                    onClick={showLandingPage}
                    className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-700"
                  >
                    Back to home
                  </button>
                  <h1 className="text-2xl font-bold text-slate-900 mb-1">
                    {isRegistering ? "Create your account" : "Welcome Back"}
                  </h1>
                  <p className="text-slate-500 text-sm">
                    {isRegistering 
                      ? "Already have an account? " 
                      : "Don't have an account? "}
                    <button 
                      onClick={() => setIsRegistering(!isRegistering)}
                      className="font-semibold text-blue-600 hover:text-blue-700"
                    >
                      {isRegistering ? "Sign In" : "Sign Up"}
                    </button>
                  </p>
                </div>

                {pendingMfa ? (
                  <form onSubmit={handleMfaSubmit} className="space-y-4">
                    <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                      We sent a 6-digit OTP code to <span className="font-semibold">{pendingMfa.email}</span>. Check spam if it does not appear in your inbox.
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-widest mb-1.5 ml-0.5" htmlFor="mfa-code">
                        Verification Code
                      </label>
                      <input
                        id="mfa-code"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        required
                        minLength={6}
                        maxLength={6}
                        value={mfaCode}
                        onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-center text-lg font-semibold tracking-[0.35em] focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all placeholder:text-slate-300"
                      />
                    </div>
                    <button
                      id="verify-mfa-btn"
                      disabled={isLoading || mfaCode.length !== 6}
                      className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg shadow-md shadow-blue-500/20 hover:bg-blue-700 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-wait active:scale-[0.99] mt-2"
                    >
                      {isLoading ? <Loader2 className="animate-spin" size={18} /> : <><span>Verify & Continue</span><ArrowRight size={16} /></>}
                    </button>
                    <button
                      type="button"
                      onClick={handleResendMfa}
                      disabled={isResendingMfa}
                      className="w-full py-2 text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-60"
                    >
                      {isResendingMfa ? 'Sending new OTP...' : 'Resend OTP'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingMfa(null);
                        setMfaCode('');
                      }}
                      className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-800"
                    >
                      Use a different email
                    </button>
                  </form>
                ) : isForgotPasswordMode ? (
                <>
                {forgotPasswordStep === 'request' ? (
                  <form onSubmit={handleForgotPasswordStart} className="space-y-4">
                    <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                      Enter your account email to receive a one-time OTP for password reset.
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-widest mb-1.5 ml-0.5" htmlFor="forgot-email">
                        Email Address
                      </label>
                      <input
                        id="forgot-email"
                        type="email"
                        required
                        value={forgotPasswordEmail}
                        onChange={(e) => setForgotPasswordEmail(e.target.value)}
                        placeholder="name@company.com"
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all placeholder:text-slate-400"
                      />
                    </div>
                    <button
                      disabled={isForgotPasswordLoading}
                      className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg shadow-md shadow-blue-500/20 hover:bg-blue-700 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-wait"
                    >
                      {isForgotPasswordLoading ? <Loader2 className="animate-spin" size={18} /> : 'Send OTP'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleForgotPasswordVerify} className="space-y-4">
                    <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                      OTP sent to <span className="font-semibold">{forgotPasswordEmail}</span>. Verify OTP and set a new password.
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-widest mb-1.5 ml-0.5" htmlFor="forgot-otp">
                        Verification Code
                      </label>
                      <input
                        id="forgot-otp"
                        type="text"
                        inputMode="numeric"
                        required
                        minLength={6}
                        maxLength={6}
                        value={forgotPasswordOtp}
                        onChange={(e) => setForgotPasswordOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-center text-lg font-semibold tracking-[0.35em] focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all placeholder:text-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-widest mb-1.5 ml-0.5" htmlFor="forgot-new-password">
                        New Password
                      </label>
                      <input
                        id="forgot-new-password"
                        type="password"
                        required
                        value={forgotPasswordNewPassword}
                        onChange={(e) => setForgotPasswordNewPassword(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-widest mb-1.5 ml-0.5" htmlFor="forgot-confirm-password">
                        Confirm Password
                      </label>
                      <input
                        id="forgot-confirm-password"
                        type="password"
                        required
                        value={forgotPasswordConfirmPassword}
                        onChange={(e) => setForgotPasswordConfirmPassword(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                      />
                    </div>
                    <button
                      disabled={isForgotPasswordLoading || forgotPasswordOtp.length !== 6}
                      className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg shadow-md shadow-blue-500/20 hover:bg-blue-700 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-wait"
                    >
                      {isForgotPasswordLoading ? <Loader2 className="animate-spin" size={18} /> : 'Verify OTP & Reset Password'}
                    </button>
                    <button
                      type="button"
                      onClick={handleForgotPasswordResend}
                      disabled={isForgotPasswordResending}
                      className="w-full py-2 text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-60"
                    >
                      {isForgotPasswordResending ? 'Sending new OTP...' : 'Resend OTP'}
                    </button>
                  </form>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPasswordMode(false);
                    setForgotPasswordStep('request');
                    setForgotPasswordChallengeId(null);
                    setForgotPasswordOtp('');
                    setForgotPasswordNewPassword('');
                    setForgotPasswordConfirmPassword('');
                  }}
                  className="mt-4 w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  Back to sign in
                </button>
                </>
                ) : (
                <>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-widest mb-1.5 ml-0.5" htmlFor="email">
                      Email Address
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all placeholder:text-slate-400"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1.5 px-0.5">
                      <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-widest" htmlFor="password">
                        Password
                      </label>
                      {!isRegistering && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsForgotPasswordMode(true);
                            setForgotPasswordStep('request');
                            setForgotPasswordChallengeId(null);
                            setForgotPasswordOtp('');
                            setForgotPasswordNewPassword('');
                            setForgotPasswordConfirmPassword('');
                            setForgotPasswordEmail(email.trim().toLowerCase());
                          }}
                          className="text-[10px] font-bold text-blue-600 hover:text-blue-700 uppercase tracking-wider"
                        >
                          Forgot?
                        </button>
                      )}
                    </div>
                    <div className="relative group">
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {!isRegistering && (
                      <div className="flex items-center gap-2 py-1">
                        <input
                          type="checkbox"
                          id="remember"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500 focus:ring-offset-0 transition-all cursor-pointer"
                        />
                        <label htmlFor="remember" className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">Remember for 30 days</label>
                      </div>
                  )}

                  <button
                    id="submit-btn"
                    disabled={isLoading}
                    className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg shadow-md shadow-blue-500/20 hover:bg-blue-700 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-wait active:scale-[0.99] mt-2"
                  >
                    {isLoading ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : (
                      <>
                        <span>{isRegistering ? "Create Account" : "Sign In"}</span>
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </form>

                </>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex h-screen bg-white text-slate-900 font-sans"
          >
            {/* Sidebar */}
            <aside className={`bg-[#F9F9F9] flex flex-col border-r border-[#E5E5E5] flex-shrink-0 transition-all duration-300 ${isSidebarCollapsed ? 'w-[72px]' : 'w-[260px]'}`}>
              <div className="p-4 border-b border-[#E5E5E5] flex items-center justify-between">
                 <div className="flex items-center gap-2 overflow-hidden">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Zap size={18} className="text-white" fill="currentColor" />
                    </div>
                    {!isSidebarCollapsed && <span className="text-xl font-bold tracking-tight text-slate-800 whitespace-nowrap">Hire AI</span>}
                 </div>
                 <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="p-1 hover:bg-[#E5E5E5] rounded-md transition-colors flex-shrink-0">
                    <Menu size={18} className="text-slate-500" />
                 </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
                <nav className="space-y-1">
                   {!isSidebarCollapsed ? (
                     <div className="text-[10px] font-bold text-slate-500 px-2 py-2 uppercase tracking-wider">Main</div>
                   ) : (
                     <div className="h-6"></div>
                   )}
                   <button 
                      onClick={() => setActiveTab('chat')}
                      title="Hire AI Chat"
                      className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} p-2 rounded-lg font-medium transition-colors ${activeTab === 'chat' ? 'bg-[#E5E5E5] text-slate-900' : 'text-slate-700 hover:bg-[#E5E5E5]'}`}>
                      <div className="flex items-center gap-2">
                          <MessageSquarePlus size={18} />
                          {!isSidebarCollapsed && <span className="text-sm">Hire AI Chat</span>}
                      </div>
                   </button>
                   <button 
                      onClick={() => setActiveTab('openings')}
                      title="Active Openings"
                      className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} p-2 rounded-lg font-medium transition-colors ${activeTab === 'openings' ? 'bg-[#E5E5E5] text-slate-900' : 'text-slate-700 hover:bg-[#E5E5E5]'}`}>
                      <div className="flex items-center gap-2">
                          <Briefcase size={18} />
                          {!isSidebarCollapsed && <span className="text-sm">Active Openings</span>}
                      </div>
                   </button>
                   <button 
                      onClick={() => setActiveTab('trends')}
                      title="Hiring Trends"
                      className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} p-2 rounded-lg font-medium transition-colors ${activeTab === 'trends' ? 'bg-[#E5E5E5] text-slate-900' : 'text-slate-700 hover:bg-[#E5E5E5]'}`}>
                      <div className="flex items-center gap-2">
                          <TrendingUp size={18} />
                          {!isSidebarCollapsed && <span className="text-sm">Hiring Trends</span>}
                      </div>
                   </button>

                   {!isSidebarCollapsed ? (
                     <div className="text-[10px] font-bold text-slate-500 px-2 pt-4 pb-2 uppercase tracking-wider">Analytics & Data</div>
                   ) : (
                     <div className="h-4 border-b border-t border-transparent my-2" />
                   )}
                   <button 
                      onClick={() => setActiveTab('analytics')}
                      title="Company Analytics"
                      className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} p-2 rounded-lg font-medium transition-colors ${activeTab === 'analytics' ? 'bg-[#E5E5E5] text-slate-900' : 'text-slate-700 hover:bg-[#E5E5E5]'}`}>
                      <div className="flex items-center gap-2">
                          <BarChart2 size={18} />
                          {!isSidebarCollapsed && <span className="text-sm">Company Analytics</span>}
                      </div>
                   </button>
                   <button 
                      onClick={() => setActiveTab('tech')}
                      title="Tech Demand Analysis"
                      className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} p-2 rounded-lg font-medium transition-colors ${activeTab === 'tech' ? 'bg-[#E5E5E5] text-slate-900' : 'text-slate-700 hover:bg-[#E5E5E5]'}`}>
                      <div className="flex items-center gap-2">
                          <Cpu size={18} />
                          {!isSidebarCollapsed && <span className="text-sm">Tech Demand Analysis</span>}
                      </div>
                   </button>
                   <button 
                      onClick={() => setActiveTab('reports')}
                      title="Report Generator"
                      className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} p-2 rounded-lg font-medium transition-colors ${activeTab === 'reports' ? 'bg-[#E5E5E5] text-slate-900' : 'text-slate-700 hover:bg-[#E5E5E5]'}`}>
                      <div className="flex items-center gap-2">
                          <ClipboardList size={18} />
                          {!isSidebarCollapsed && <span className="text-sm">Report Generator</span>}
                      </div>
                   </button>

                   {!isSidebarCollapsed ? (
                     <div className="text-[10px] font-bold text-slate-500 px-2 pt-4 pb-2 uppercase tracking-wider">Recruitment</div>
                   ) : (
                     <div className="h-4 border-b border-t border-transparent my-2" />
                   )}
                   <button 
                      onClick={() => setActiveTab('recruiters')}
                      title="Recruiter Info"
                      className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} p-2 rounded-lg font-medium transition-colors ${activeTab === 'recruiters' ? 'bg-[#E5E5E5] text-slate-900' : 'text-slate-700 hover:bg-[#E5E5E5]'}`}>
                      <div className="flex items-center gap-2">
                          <Users size={18} />
                          {!isSidebarCollapsed && <span className="text-sm">Recruiter Info</span>}
                      </div>
                   </button>
                   <button 
                      onClick={() => setActiveTab('skills')}
                      title="Skill-Based Filtering"
                      className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} p-2 rounded-lg font-medium transition-colors ${activeTab === 'skills' ? 'bg-[#E5E5E5] text-slate-900' : 'text-slate-700 hover:bg-[#E5E5E5]'}`}>
                      <div className="flex items-center gap-2">
                          <Filter size={18} />
                          {!isSidebarCollapsed && <span className="text-sm">Skill-Based Filtering</span>}
                      </div>
                   </button>
                   {isAdmin && (
                    <>
                     {!isSidebarCollapsed ? (
                       <div className="text-[10px] font-bold text-slate-500 px-2 pt-4 pb-2 uppercase tracking-wider">Administration</div>
                     ) : (
                       <div className="h-4 border-b border-t border-transparent my-2" />
                     )}
                     <button
                        onClick={() => setActiveTab('admin')}
                        title="Admin Dashboard"
                        className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} p-2 rounded-lg font-medium transition-colors ${activeTab === 'admin' ? 'bg-[#E5E5E5] text-slate-900' : 'text-slate-700 hover:bg-[#E5E5E5]'}`}>
                        <div className="flex items-center gap-2">
                            <Settings size={18} />
                            {!isSidebarCollapsed && <span className="text-sm">Admin Dashboard</span>}
                        </div>
                     </button>
                    </>
                   )}
                </nav>
              </div>

              <div className="p-4 border-t border-[#E5E5E5]">
                <button onClick={handleLogout} title="Logout" className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : ''} gap-2 px-2 py-2 rounded-lg hover:bg-[#E5E5E5] transition-colors text-slate-700 font-medium text-sm`}>
                  <LogOut size={18} />
                  {!isSidebarCollapsed && <span>Logout</span>}
                </button>
              </div>
            </aside>

            {/* Main view */}
            <main className="flex-1 flex flex-col items-center justify-between">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  multiple 
                  onChange={(e) => {
                      if (e.target.files) {
                          setSelectedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                      }
                      e.target.value = '';
                  }} 
                />
                {(dashboardError || isDashboardLoading) && (
                  <div
                    className={`w-full px-4 py-2 text-sm border-b ${
                      dashboardError
                        ? 'bg-rose-50 text-rose-800 border-rose-100'
                        : 'bg-slate-50 text-slate-600 border-slate-100'
                    }`}
                  >
                    {dashboardError ? dashboardError : 'Loading dashboard data…'}
                  </div>
                )}
                <header className="w-full flex justify-between items-center p-3 border-b border-transparent bg-white z-10 sticky top-0">
                    <div className="flex items-center gap-2">
                    <button className="flex items-center gap-1 px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-colors font-semibold text-lg text-slate-700">
                        {activeTab === 'chat' && <>Hire AI <ChevronDown size={18} className="text-slate-500"/></>}
                        {activeTab === 'openings' && 'Active Openings'}
                        {activeTab === 'trends' && 'Hiring Trends'}
                        {activeTab === 'tech' && 'Tech Demand Analysis'}
                        {activeTab === 'analytics' && 'Company Analytics'}
                        {activeTab === 'reports' && 'Report Generator'}
                        {activeTab === 'recruiters' && 'People intelligence'}
                        {activeTab === 'skills' && 'Skill-Based Filtering'}
                        {activeTab === 'admin' && 'Admin Dashboard'}
                    </button>
                    </div>
                    <div className="flex items-center gap-3 relative">
                        <button 
                            onClick={() => setIsAccountDropdownOpen(!isAccountDropdownOpen)}
                            className="w-8 h-8 rounded-full flex justify-center items-center hover:bg-slate-100 transition-colors"
                        >
                            <div className="w-6 h-6 border-2 border-slate-300 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden">
                                <User size={14} className="text-slate-500" />
                            </div>
                        </button>
                        
                        <AnimatePresence>
                            {isAccountDropdownOpen && (
                                <motion.div 
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    transition={{ duration: 0.15 }}
                                    className="absolute top-10 right-0 w-48 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50"
                                >
                                    <div className="px-4 py-3 border-b border-slate-100 mb-1">
                                        <p className="text-sm font-medium text-slate-900 truncate">Hiring Manager</p>
                                        <p className="text-xs text-slate-500 truncate">hiring@company.com</p>
                                    </div>
                                    <button 
                                        onClick={() => {
                                            setIsAccountDropdownOpen(false);
                                            setIsAccountModalOpen(true);
                                        }}
                                        className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                                        <User size={16} /> Account
                                    </button>
                                    <button 
                                        onClick={() => {
                                            setIsAccountDropdownOpen(false);
                                            setIsSettingsModalOpen(true);
                                        }}
                                        className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                                        <Settings size={16} /> Settings
                                    </button>
                                    <div className="h-px bg-slate-100 my-1"></div>
                                    <button 
                                        onClick={handleLogout}
                                        className="w-full text-left px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                                    >
                                        <LogOut size={16} /> Logout
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </header>

                {activeTab === 'chat' && (
                  <>
                    {messages.length === 0 ? (
                      <div className="flex-1 w-full max-w-3xl flex flex-col justify-center px-6">
                        <h1 className="text-3xl font-medium text-center mb-8">What are you working on?</h1>
                        
                        <div className="relative border border-slate-200 rounded-[2rem] bg-[#f4f4f4] focus-within:bg-white focus-within:shadow-[0_0_15px_rgba(0,0,0,0.05)] focus-within:border-slate-300 transition-all p-3 mx-auto w-full max-w-2xl">
                            {selectedFiles.length > 0 && (
                              <div className="flex gap-2 overflow-x-auto pb-2 mb-2 px-2">
                                {selectedFiles.map((file, i) => (
                                  <div key={i} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg py-1.5 px-3 text-xs w-max max-w-[200px] shadow-sm">
                                     <FileText size={14} className="text-blue-500 flex-shrink-0" />
                                     <span className="truncate flex-1 font-medium">{file.name}</span>
                                     <button onClick={() => setSelectedFiles(prev => prev.filter((_, index) => index !== i))} className="text-slate-400 hover:text-slate-700 ml-1">
                                         <X size={14} />
                                     </button>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                                <button onClick={() => fileInputRef.current?.click()} className="w-8 h-8 flex items-center justify-center text-slate-500 hover:bg-slate-200 rounded-full flex-shrink-0 transition-colors">
                                    <Paperclip size={20} />
                                </button>
                                <input 
                                  value={input}
                                  onChange={(e) => setInput(e.target.value)}
                                  onKeyDown={(e) => {
                                     if(e.key === 'Enter') handleSendMessage()
                                  }}
                                  className="flex-1 bg-transparent border-none focus:ring-0 text-base py-2 outline-none placeholder:text-slate-500"
                                  placeholder="Ask anything"
                                />
                                <button 
                                    onClick={handleSendMessage} 
                                    disabled={(!input.trim() && selectedFiles.length === 0) || isChatLoading} 
                                    className={`w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0 transition-colors ${input.trim() || selectedFiles.length > 0 ? 'bg-black hover:bg-slate-800 text-white' : 'bg-slate-200 text-slate-400'}`}
                                >
                                    {isChatLoading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                                </button>
                            </div>
                        </div>

                        <div className="mx-auto w-full max-w-2xl mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
                            {[
                                { title: "Draft a tailored job description for a Senior React Developer", icon: <PenLine size={18} className="text-blue-500" /> },
                                { title: "Analyze hiring trends in New York for Q3", icon: <TrendingUp size={18} className="text-emerald-500" /> },
                                { title: "Find top-rated Full Stack engineers in India", icon: <Users size={18} className="text-amber-500" /> }
                            ].map((card, i) => (
                                <button key={i} onClick={() => setInput(card.title)} className="p-4 bg-white border border-slate-200 rounded-2xl hover:shadow-md hover:border-slate-300 transition-all text-left flex flex-col gap-3 group">
                                    <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        {card.icon}
                                    </div>
                                    <span className="text-sm font-medium text-slate-700 leading-snug">{card.title}</span>
                                </button>
                            ))}
                        </div>
                      </div>
                    ) : (
                        <div className="flex-1 w-full flex flex-col items-center w-full px-6 overflow-hidden">
                            <div className="w-full max-w-3xl flex-1 overflow-y-auto space-y-6 py-6 pb-20 no-scrollbar">
                                {messages.map((msg, i) => (
                                    <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        {msg.role === 'ai' && <div className="w-8 h-8 flex items-center justify-center flex-shrink-0 mt-1 border border-slate-200 rounded-full"><Sparkles size={16} className="text-slate-700" /></div>}
                                        <div className={`p-4 rounded-2xl text-base leading-relaxed ${msg.role === 'user' ? 'bg-[#f4f4f4] text-slate-900 max-w-[80%]' : 'text-slate-900 w-full overflow-hidden'}`}>
                                            {msg.role === 'user' ? (
                                                msg.text
                                            ) : (
                                                <div className="prose prose-slate max-w-none">
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                        {msg.text}
                                                    </ReactMarkdown>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {isChatLoading && <div className="flex gap-4">
                                   <div className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center flex-shrink-0 mt-1"><Sparkles size={16} className="text-slate-700" /></div>
                                   <div className="p-4 rounded-2xl text-base text-slate-500 flex items-center gap-2">
                                      <Loader2 size={16} className="animate-spin" /> Thinking...
                                   </div>
                                </div>}
                            </div>
                        </div>
                    )}
                        
                    {messages.length > 0 && (
                        <div className="w-full max-w-3xl px-6 pb-4 bg-white relative shrink-0">
                            <div className="absolute top-0 left-0 w-full h-8 -mt-8 bg-gradient-to-t from-white to-transparent pointer-events-none"></div>
                            <div className="relative border border-slate-200 rounded-[2rem] bg-[#f4f4f4] focus-within:bg-white focus-within:shadow-[0_0_15px_rgba(0,0,0,0.05)] focus-within:border-slate-300 transition-all p-3 mt-auto">
                                {selectedFiles.length > 0 && (
                                  <div className="flex gap-2 overflow-x-auto pb-2 mb-2 px-2">
                                    {selectedFiles.map((file, i) => (
                                      <div key={i} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg py-1.5 px-3 text-xs w-max max-w-[200px] shadow-sm">
                                         <FileText size={14} className="text-blue-500 flex-shrink-0" />
                                         <span className="truncate flex-1 font-medium">{file.name}</span>
                                         <button onClick={() => setSelectedFiles(prev => prev.filter((_, index) => index !== i))} className="text-slate-400 hover:text-slate-700 ml-1">
                                             <X size={14} />
                                         </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div className="flex items-center gap-2">
                                    <button onClick={() => fileInputRef.current?.click()} className="w-8 h-8 flex items-center justify-center text-slate-500 hover:bg-slate-200 rounded-full flex-shrink-0 transition-colors">
                                        <Paperclip size={20} />
                                    </button>
                                    <input 
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if(e.key === 'Enter') handleSendMessage()
                                    }}
                                    className="flex-1 bg-transparent border-none focus:ring-0 text-base py-2 outline-none placeholder:text-slate-500"
                                    placeholder="Message Hire AI"
                                    />
                                    <button 
                                        onClick={handleSendMessage} 
                                        disabled={(!input.trim() && selectedFiles.length === 0) || isChatLoading} 
                                        className={`w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0 transition-colors ${input.trim() || selectedFiles.length > 0 ? 'bg-black hover:bg-slate-800 text-white' : 'bg-slate-200 text-slate-400'}`}
                                    >
                                        {isChatLoading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                                    </button>
                                </div>
                            </div>
                            <div className="text-center text-[10px] text-slate-500 mt-2">
                                Hire AI can make mistakes. Check important info.
                            </div>
                        </div>
                    )}
                  </>
                )}

                {activeTab === 'openings' && (
                    <div className="flex-1 w-full bg-[#f4f4f4] overflow-y-auto p-8">
                       <div className="max-w-6xl mx-auto">
                          <div className="flex justify-between items-center mb-6">
                             <div>
                                <h1 className="text-2xl font-semibold text-slate-900 mb-1">Active Openings</h1>
                                <p className="text-slate-500 text-sm">Manage and track your current job postings</p>
                             </div>
                             <div className="flex items-center gap-3">
                                <div className="relative">
                                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                  <input 
                                      type="text" 
                                      placeholder="Search roles or companies..."
                                      value={openingSearchTerm}
                                      onChange={(e) => {
                                        setOpeningSearchTerm(e.target.value);
                                        setIsOpeningSuggestOpen(e.target.value.trim().length >= 2);
                                      }}
                                      onFocus={() => {
                                        if (openingSuggestions.length > 0) setIsOpeningSuggestOpen(true);
                                      }}
                                      onBlur={() => {
                                        window.setTimeout(() => setIsOpeningSuggestOpen(false), 120);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleForceOpeningSearch();
                                      }}
                                      className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-64"
                                  />
                                  {isOpeningSuggestionsLoading && (
                                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" size={14} />
                                  )}
                                  <AnimatePresence>
                                    {isOpeningSuggestOpen && openingSuggestions.length > 0 && (
                                      <motion.div
                                        initial={{ opacity: 0, y: 6, scale: 0.98 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 6, scale: 0.98 }}
                                        transition={{ duration: 0.12 }}
                                        className="absolute top-11 left-0 w-64 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50"
                                      >
                                        <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 border-b border-slate-100">
                                          Indeed suggestions
                                        </div>
                                        <div className="max-h-64 overflow-y-auto">
                                          {openingSuggestions.map((suggestion) => (
                                            <button
                                              key={suggestion}
                                              type="button"
                                              onMouseDown={(e) => e.preventDefault()}
                                              onClick={() => {
                                                setOpeningSearchTerm(suggestion);
                                                setDebouncedOpeningSearch(suggestion);
                                                setIsOpeningSuggestOpen(false);
                                              }}
                                              className="w-full px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-2"
                                            >
                                              <Search size={14} className="text-slate-400" />
                                              <span>{suggestion}</span>
                                            </button>
                                          ))}
                                        </div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                                <button
                                  type="button"
                                  onClick={handleForceOpeningSearch}
                                  disabled={openingSearchTerm.trim().length < 2 || isDynamicJobSearchLoading}
                                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                                  title="Run live search again"
                                >
                                  {isDynamicJobSearchLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                                  Search
                                </button>
                                <div className="relative">
                                  <button onClick={() => setIsOpeningsFilterOpen(!isOpeningsFilterOpen)} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2">
                                    <Filter size={16} />
                                    Advanced
                                  </button>
                                  <AnimatePresence>
                                      {isOpeningsFilterOpen && (
                                          <motion.div 
                                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                              animate={{ opacity: 1, y: 0, scale: 1 }}
                                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                              transition={{ duration: 0.15 }}
                                              className="absolute top-12 right-0 w-64 bg-white rounded-xl shadow-lg border border-slate-200 p-4 z-50 flex flex-col gap-4"
                                          >
                                              <div>
                                                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Salary Range</label>
                                                  <select 
                                                      value={openingSalaryFilter}
                                                      onChange={(e) => setOpeningSalaryFilter(e.target.value)}
                                                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                                  >
                                                      <option value="">All Salaries</option>
                                                      {Array.from(new Set(openings.map(j => j.salary))).map(s => <option key={s} value={s}>{s}</option>)}
                                                  </select>
                                              </div>
                                              <div>
                                                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Location</label>
                                                  <select 
                                                      value={openingLocationFilter}
                                                      onChange={(e) => setOpeningLocationFilter(e.target.value)}
                                                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                                  >
                                                      <option value="">All Locations</option>
                                                      {Array.from(new Set(openings.map(j => j.location))).map(l => <option key={l} value={l}>{l}</option>)}
                                                  </select>
                                              </div>
                                              {(openingSalaryFilter || openingLocationFilter) && (
                                                  <button 
                                                      onClick={() => { setOpeningSalaryFilter(''); setOpeningLocationFilter(''); }}
                                                      className="text-xs text-rose-600 font-medium hover:text-rose-700 text-left mt-1"
                                                  >
                                                      Clear Filters
                                                  </button>
                                              )}
                                          </motion.div>
                                      )}
                                  </AnimatePresence>
                                </div>
                             </div>
                          </div>
                          
                          <div className="relative bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                            <div className={`transition-all duration-200 ${isDynamicJobSearchLoading ? 'blur-[2px] opacity-60 pointer-events-none select-none' : ''}`}>
                             <table className="w-full text-left border-collapse">
                                <thead>
                                   <tr className="border-b border-slate-200 bg-[#f9f9f9]">
                                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
                                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Company</th>
                                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Location</th>
                                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Salary</th>
                                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Experience</th>
                                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Source</th>
                                   </tr>
                                </thead>
                                <tbody>
                                   {filteredOpenings.map((job, index) => (
                                      <tr key={job.id ?? job.job_id ?? index} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80 transition-colors">
                                         <td className="px-6 py-4">
                                            <div className="font-medium text-slate-900">{job.title}</div>
                                            {job.skills && job.skills.length > 0 && (
                                              <div className="mt-1 flex flex-wrap gap-1">
                                                {job.skills.slice(0, 3).map((skill) => (
                                                  <span key={skill} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">{skill}</span>
                                                ))}
                                              </div>
                                            )}
                                         </td>
                                         <td className="px-6 py-4 text-sm text-slate-700">{job.company}</td>
                                         <td className="px-6 py-4 text-sm text-slate-700">{job.location}</td>
                                         <td className="px-6 py-4 text-sm text-slate-700">{job.salary}</td>
                                         <td className="px-6 py-4 text-sm text-slate-700">{job.experience}</td>
                                         <td className="px-6 py-4">
                                           <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">{job.status || 'Active'}</span>
                                         </td>
                                         <td className="px-6 py-4 text-right">
                                           {job.url && job.url !== '#' ? (
                                             <a href={job.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-xs font-medium">{job.source || 'Open'}</a>
                                           ) : (
                                             <span className="text-xs text-slate-500">{job.source || 'Internal'}</span>
                                           )}
                                         </td>
                                      </tr>
                                   ))}
                                </tbody>
                             </table>
                             {filteredOpenings.length === 0 && (
                                <div className="py-12 flex flex-col items-center justify-center text-slate-500">
                                    {isDynamicJobSearchLoading ? (
                                      <>
                                        <Loader2 size={40} className="text-blue-500 mb-4 animate-spin" />
                                        <p className="text-base font-medium text-slate-700 mb-1">Searching external job boards</p>
                                        <p className="text-sm text-center max-w-sm">
                                          No matches in your synced listings. A Celery worker is fetching live jobs for &quot;{openingSearchTerm.trim()}&quot; using the Playwright automation scripts and updating this list as jobs arrive.
                                        </p>
                                        <p className="text-xs text-slate-400 mt-3 max-w-sm text-center">
                                          Listings link back to the original posting URL captured during scraping.
                                        </p>
                                      </>
                                    ) : (
                                      <>
                                        <FileCheck size={48} className="text-slate-300 mb-4" />
                                        <p className="text-base font-medium text-slate-700 mb-1">No openings found</p>
                                        <p className="text-sm text-center max-w-sm">
                                          {dynamicJobSearchError || 'Try a different role or company, or ensure Redis and Celery are running for live search.'}
                                        </p>
                                      </>
                                    )}
                                </div>
                             )}
                            </div>
                            {isDynamicJobSearchLoading && (
                              <div className="absolute inset-0 z-40 flex items-center justify-center bg-white/45 backdrop-blur-sm">
                                <div className="bg-white/90 border border-blue-100 shadow-xl rounded-2xl px-6 py-5 flex items-center gap-4 max-w-md mx-4">
                                  <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                                    <Loader2 size={24} className="text-blue-600 animate-spin" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold text-slate-900">Searching external job boards</p>
                                    <p className="text-xs text-slate-500 mt-1">
                                      New matches are saved as soon as each scraper finds them. This panel will clear when automation finishes.
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                       </div>
                    </div>
                )}

                {activeTab === 'trends' && (
                    <div className="flex-1 w-full bg-[#f4f4f4] overflow-y-auto p-8">
                       <div className="max-w-6xl mx-auto">
                          <div className="flex justify-between items-center mb-6">
                             <div>
                                <h1 className="text-2xl font-semibold text-slate-900 mb-1">Hiring Trends</h1>
                                <p className="text-slate-500 text-sm">Analyze top hiring companies and search for company specific data</p>
                             </div>
                          </div>

                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                                  <h2 className="text-lg font-semibold text-slate-800 mb-6">Top 10 Companies Hiring</h2>
                                  <div className="h-[300px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <BarChart
                                        data={chartCompanyTrends.slice(0, 10)}
                                        margin={{
                                          top: 5,
                                          right: 30,
                                          left: 20,
                                          bottom: 5,
                                        }}
                                      >
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5E5" />
                                        <XAxis 
                                            dataKey="name" 
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: '#64748B', fontSize: 12 }}
                                            dy={10}
                                        />
                                        <YAxis 
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: '#64748B', fontSize: 12 }}
                                        />
                                        <RechartsTooltip 
                                            cursor={{ fill: '#F1F5F9' }}
                                            contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                            labelStyle={{ fontWeight: 600, color: '#0F172A', marginBottom: '4px' }}
                                        />
                                        <Bar dataKey="openings" radius={[4, 4, 0, 0]}>
                                          {chartCompanyTrends.slice(0, 10).map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={index < 3 ? '#2563EB' : '#94A3B8'} />
                                          ))}
                                        </Bar>
                                      </BarChart>
                                    </ResponsiveContainer>
                                  </div>
                              </div>
                              
                              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col">
                                  <h2 className="text-lg font-semibold text-slate-800 mb-4">Company Search</h2>
                                  <div className="relative mb-6">
                                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                      <input 
                                          type="text" 
                                          placeholder="Search CompanyEnrich..."
                                          value={trendsSearchTerm}
                                          onChange={(e) => setTrendsSearchTerm(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleCompanySearch(e, trendsSearchTerm);
                                          }}
                                          className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                      />
                                  </div>
                                  <button
                                      onClick={(e) => handleCompanySearch(e, trendsSearchTerm)}
                                      disabled={isCompanySearchLoading || !trendsSearchTerm.trim()}
                                      className="w-full mb-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                  >
                                      {isCompanySearchLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                                      Search CompanyEnrich
                                  </button>
                                  
                                  <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-2">
                                      {companySearchResults.length > 0 && trendsSearchTerm.trim() && (
                                        <div className="mb-4 space-y-2">
                                          {companySearchResults.slice(0, 5).map((company) => (
                                            <button
                                              key={company.id ?? company.domain ?? company.name}
                                              onClick={() => {
                                                setSelectedCompany(company);
                                                setAnalyticsSearchTerm(company.name ?? trendsSearchTerm);
                                              }}
                                              className="w-full p-3 rounded-lg border border-blue-100 bg-blue-50/60 hover:bg-blue-50 transition-colors text-left"
                                            >
                                              <div className="flex justify-between gap-3">
                                                <span className="font-semibold text-slate-800">{company.name}</span>
                                                <span className="text-[10px] font-bold text-blue-700">{company.domain}</span>
                                              </div>
                                              <div className="mt-1 text-xs text-slate-500">{company.industry || company.location_label || 'CompanyEnrich result'}</div>
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                      {filteredCompanyTrends.map((company, index) => (
                                          <div key={index} className="p-3 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-colors">
                                              <div className="flex justify-between items-center mb-2">
                                                  <span className="font-semibold text-slate-800">{company.name}</span>
                                                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">{company.growth}</span>
                                              </div>
                                              <div className="flex justify-between text-sm">
                                                  <div className="text-slate-500"><span className="text-slate-900 font-medium">{company.hired}</span> Hired</div>
                                                  <div className="text-slate-500"><span className="text-slate-900 font-medium">{company.openings}</span> Openings</div>
                                              </div>
                                          </div>
                                      ))}
                                      {filteredCompanyTrends.length === 0 && (
                                          <div className="text-center py-8 text-slate-500 text-sm">
                                              No companies found matching "{trendsSearchTerm}"
                                          </div>
                                      )}
                                      {(selectedCompany || selectedCompanyTrend || selectedCompanySignal) && (
                                        <div className="mt-4 p-3 rounded-lg border border-indigo-100 bg-indigo-50/60">
                                          <div className="text-[11px] font-bold uppercase tracking-wide text-indigo-700 mb-2">
                                            Dynamic analysis
                                          </div>
                                          <div className="text-sm font-semibold text-slate-800">
                                            {selectedCompany?.name || selectedCompanyTrend?.name || selectedCompanySignal?.company}
                                          </div>
                                          <div className="mt-1 text-xs text-slate-600">
                                            Trend:{' '}
                                            <span className="font-semibold text-slate-800">
                                              {selectedCompanySignal?.trend || inferredCompanyTrend || selectedCompanyTrend?.growth || 'Insufficient historical records'}
                                            </span>
                                          </div>
                                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                                            <div className="rounded-md bg-white p-2 border border-slate-100">
                                              <div className="text-[10px] uppercase text-slate-400">Openings</div>
                                              <div className="font-semibold text-slate-800">{selectedCompanyTrend?.openings ?? selectedCompanySignal?.openings ?? '-'}</div>
                                            </div>
                                            <div className="rounded-md bg-white p-2 border border-slate-100">
                                              <div className="text-[10px] uppercase text-slate-400">Hired</div>
                                              <div className="font-semibold text-slate-800">{selectedCompanyTrend?.hired ?? selectedCompanySignal?.hired ?? '-'}</div>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                  </div>
                              </div>
                          </div>
                       </div>
                    </div>
                )}

                {activeTab === 'tech' && (
                    <div className="flex-1 w-full bg-[#f4f4f4] overflow-y-auto p-8">
                       <div className="max-w-6xl mx-auto">
                          <div className="flex justify-between items-center mb-6">
                             <div>
                                <h1 className="text-2xl font-semibold text-slate-900 mb-1">Tech Demand Analysis</h1>
                                <p className="text-slate-500 text-sm">Historical tracking of skills and technology demand across open roles</p>
                             </div>
                          </div>

                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                                  <h2 className="text-lg font-semibold text-slate-800 mb-6">Hiring volume (trends)</h2>
                                  <div className="h-[350px] w-full">
                                    {hiringVolumeHistory.length === 0 ? (
                                      <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                                        No trend rows yet. Add HiringTrend records in Django admin or run migrations with fixtures.
                                      </div>
                                    ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                      <LineChart
                                        data={hiringVolumeHistory}
                                        margin={{
                                          top: 5,
                                          right: 30,
                                          left: 20,
                                          bottom: 5,
                                        }}
                                      >
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5E5" />
                                        <XAxis 
                                            dataKey="month" 
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: '#64748B', fontSize: 12 }}
                                            dy={10}
                                        />
                                        <YAxis 
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: '#64748B', fontSize: 12 }}
                                        />
                                        <RechartsTooltip 
                                            contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                            labelStyle={{ fontWeight: 600, color: '#0F172A', marginBottom: '4px' }}
                                        />
                                        <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                        <Line type="monotone" dataKey="hired" name="Hired" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                                        <Line type="monotone" dataKey="applied" name="Applied" stroke="#10b981" strokeWidth={2} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                                      </LineChart>
                                    </ResponsiveContainer>
                                    )}
                                  </div>
                              </div>
                              
                              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col">
                                  <h2 className="text-lg font-semibold text-slate-800 mb-4">Top Tech Demand</h2>
                                  <div className="flex-1 space-y-5">
                                      {techDemand.length === 0 ? (
                                        <p className="text-sm text-slate-500">No skill tags extracted yet. Refresh listings after updating automation JSON.</p>
                                      ) : (
                                      techDemand.map((tech, index) => (
                                          <div key={index}>
                                              <div className="flex justify-between items-center mb-1.5">
                                                  <span className="font-medium text-slate-800 text-sm">{tech.name}</span>
                                                  <div className="flex items-center gap-2">
                                                    <span className="text-xs font-semibold text-slate-600">{tech.demand}%</span>
                                                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{tech.trend}</span>
                                                  </div>
                                              </div>
                                              <div className="w-full bg-slate-100 rounded-full h-2">
                                                  <div 
                                                    className="h-2 rounded-full transition-all duration-1000" 
                                                    style={{ width: `${tech.demand}%`, backgroundColor: tech.color }}
                                                  ></div>
                                              </div>
                                          </div>
                                      ))
                                      )}
                                  </div>
                                  <button className="w-full mt-6 py-2 bg-slate-50 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-100 transition-colors">
                                      View Full Report
                                  </button>
                              </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                                 <div>
                                   <div className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-1">Top skill</div>
                                   <div className="text-lg font-bold text-slate-900">{techDemand[0]?.name ?? '—'}</div>
                                 </div>
                                 <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                                    <TrendingUp size={20} className="text-blue-500" />
                                 </div>
                              </div>
                              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                                 <div>
                                   <div className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-1">Runner-up</div>
                                   <div className="text-lg font-bold text-slate-900">{techDemand[1]?.name ?? '—'}</div>
                                 </div>
                                 <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
                                    <Zap size={20} className="text-emerald-500" />
                                 </div>
                              </div>
                              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                                 <div>
                                   <div className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-1">Third</div>
                                   <div className="text-lg font-bold text-slate-900">{techDemand[2]?.name ?? '—'}</div>
                                 </div>
                                 <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                                    <Cpu size={20} className="text-red-500" />
                                 </div>
                              </div>
                              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                                 <div>
                                   <div className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-1">Fourth</div>
                                   <div className="text-lg font-bold text-slate-900">{techDemand[3]?.name ?? '—'}</div>
                                 </div>
                                 <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center">
                                    <Sparkles size={20} className="text-purple-500" />
                                 </div>
                              </div>
                          </div>
                       </div>
                    </div>
                )}

                {activeTab === 'analytics' && (
                    <div className="flex-1 w-full bg-[#f4f4f4] overflow-y-auto p-8">
                       <div className="max-w-6xl mx-auto">
                          <div className="flex justify-between items-center mb-6">
                             <div>
                                <h1 className="text-2xl font-semibold text-slate-900 mb-1">Company Analytics</h1>
                                <p className="text-slate-500 text-sm">Overview of hiring performance and channel effectiveness</p>
                             </div>
                             <div className="flex items-center gap-3">
                               <div className="relative flex gap-2">
                                 <div className="relative">
                                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                   <input 
                                       type="text" 
                                       placeholder="Search company (e.g. 1138)..."
                                       value={analyticsSearchTerm}
                                       onChange={(e) => setAnalyticsSearchTerm(e.target.value)}
                                       onKeyDown={(e) => {
                                          if (e.key === 'Enter') handleCompanySearch(e);
                                       }}
                                       className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-64"
                                   />
                                 </div>
                                 <button 
                                     onClick={handleCompanySearch}
                                     disabled={isCompanySearchLoading}
                                     className="px-4 py-2 bg-blue-600 text-white border border-blue-600 text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center disabled:opacity-50"
                                 >
                                    {isCompanySearchLoading ? <Loader2 size={16} className="animate-spin" /> : "Search"}
                                 </button>
                               </div>
                               <button className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2">
                                  <FileText size={16} />
                                  Export Report
                               </button>
                             </div>
                          </div>

                          {companySearchError && (
                             <div className="mb-6 p-4 bg-rose-50 text-rose-600 rounded-lg border border-rose-200 text-sm">
                               {companySearchError}
                             </div>
                          )}

                          {selectedCompany && (
                             <div className="mb-8 bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col gap-6 items-start">
                               {selectedCompany.logo_url && (
                                 <img src={selectedCompany.logo_url} alt={selectedCompany.name ?? 'Company logo'} className="w-24 h-24 rounded-xl border border-slate-100 object-contain p-2" />
                               )}
                               <div className="flex-1 w-full">
                                 <div className="flex flex-wrap items-center gap-3 mb-2">
                                    <h2 className="text-2xl font-bold text-slate-900">{selectedCompany.name}</h2>
                                    {selectedCompany.domain && (
                                      <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg">{selectedCompany.domain}</span>
                                    )}
                                 </div>
                                 <p className="text-slate-500 text-sm mb-4 line-clamp-3">{selectedCompany.description}</p>
                                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                    <div>
                                      <span className="text-slate-400 block text-xs uppercase tracking-wider mb-1">Location</span>
                                      <span className="font-medium text-slate-700">{selectedCompany.location_label || '-'}</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 block text-xs uppercase tracking-wider mb-1">Industry</span>
                                      <span className="font-medium text-slate-700">{selectedCompany.industry || '-'}</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 block text-xs uppercase tracking-wider mb-1">Size</span>
                                      <span className="font-medium text-slate-700">{selectedCompany.employees || '-'}</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 block text-xs uppercase tracking-wider mb-1">Revenue</span>
                                      <span className="font-medium text-slate-700">{selectedCompany.revenue || '-'}</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 block text-xs uppercase tracking-wider mb-1">Founded</span>
                                      <span className="font-medium text-slate-700">{formatCompanyValue(selectedCompany.founded_year)}</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 block text-xs uppercase tracking-wider mb-1">Type</span>
                                      <span className="font-medium text-slate-700">{selectedCompany.type || '-'}</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 block text-xs uppercase tracking-wider mb-1">Stock</span>
                                      <span className="font-medium text-slate-700">{selectedCompany.stock_symbol || '-'}</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 block text-xs uppercase tracking-wider mb-1">Website</span>
                                      {selectedCompany.website ? (
                                        <a href={selectedCompany.website} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Link</a>
                                      ) : '-'}
                                    </div>
                                 </div>
                               </div>
                               <div className="w-full border-t border-slate-200 pt-5 mt-5">
                                 <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                   {[
                                     ['Funding', selectedCompany.total_funding],
                                     ['Funding Stage', selectedCompany.funding_stage],
                                     ['Exchange', selectedCompany.stock_exchange],
                                     ['Page Rank', selectedCompany.page_rank],
                                     ['Phone', selectedCompany.phone],
                                     ['Updated', selectedCompany.updated_at ? new Date(selectedCompany.updated_at).toLocaleDateString() : null],
                                   ].map(([label, value]) => (
                                     <div key={String(label)} className="rounded-lg border border-slate-200 p-3">
                                       <span className="text-slate-400 block text-xs uppercase tracking-wider mb-1">{label}</span>
                                       <span className="font-semibold text-slate-800">{formatCompanyValue(value)}</span>
                                     </div>
                                   ))}
                                 </div>
                                 <div className="flex flex-wrap gap-3 mt-5 text-sm">
                                   {[
                                     ['Website', selectedCompany.website],
                                     ['LinkedIn', selectedCompany.linkedin_url],
                                     ['Twitter', selectedCompany.twitter_url],
                                     ['Facebook', selectedCompany.facebook_url],
                                     ['Crunchbase', selectedCompany.crunchbase_url],
                                   ].filter(([, url]) => Boolean(url)).map(([label, url]) => (
                                     <a key={label} href={String(url)} target="_blank" rel="noreferrer" className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">
                                       {label}
                                     </a>
                                   ))}
                                 </div>
                                 <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-6">
                                   <div>
                                     <h3 className="text-sm font-semibold text-slate-800 mb-3">Technologies</h3>
                                     <div className="space-y-2">
                                       {selectedCompany.technologies.slice(0, 8).map((technology) => (
                                         <div key={technology} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                                           <span className="font-medium text-slate-700">{technology}</span>
                                         </div>
                                       ))}
                                       {selectedCompany.technologies.length === 0 && <p className="text-sm text-slate-500">No technologies found.</p>}
                                     </div>
                                   </div>
                                   <div>
                                     <h3 className="text-sm font-semibold text-slate-800 mb-3">Categories</h3>
                                     <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                       {selectedCompany.categories.map((category) => (
                                         <div key={category} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{category}</div>
                                       ))}
                                       {selectedCompany.categories.length === 0 && <p className="text-sm text-slate-500">No categories found.</p>}
                                     </div>
                                   </div>
                                   <div>
                                     <h3 className="text-sm font-semibold text-slate-800 mb-3">Search Results</h3>
                                     <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                       {companySearchResults.slice(0, 8).map((company) => (
                                         <button key={company.id ?? company.domain ?? company.name} onClick={() => setSelectedCompany(company)} className="w-full text-left rounded-lg bg-slate-50 px-3 py-2 text-sm hover:bg-slate-100">
                                           <span className="block font-medium text-slate-700">{company.name}</span>
                                           <span className="text-xs text-slate-500">{company.domain || company.industry || 'CompanyEnrich'}</span>
                                         </button>
                                       ))}
                                     </div>
                                   </div>
                                 </div>
                               </div>
                             </div>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                              {hiringMetrics.length === 0 ? (
                                <div className="col-span-full text-sm text-slate-500">Sign in and load dashboard to see KPIs.</div>
                              ) : (
                              hiringMetrics.map((metric, index) => (
                                  <div key={index} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                     <div className="flex justify-between items-start mb-4">
                                         <div className={`p-2 rounded-lg ${metric.isGood ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                             <metric.icon size={20} />
                                         </div>
                                         <span className={`text-xs font-bold px-2 py-1 rounded-full ${metric.isGood ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                             {metric.trend}
                                         </span>
                                     </div>
                                     <h3 className="text-slate-500 text-sm font-medium mb-1">{metric.title}</h3>
                                     <div className="text-2xl font-bold text-slate-900">{metric.value}</div>
                                  </div>
                              ))
                              )}
                          </div>

                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                                  <h2 className="text-lg font-semibold text-slate-800 mb-6">Hiring Source Effectiveness</h2>
                                  <div className="h-[300px] w-full">
                                    {sourceEffectiveness.length === 0 ? (
                                      <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                                        No source mix yet (ingest platform JSON or run Celery refresh).
                                      </div>
                                    ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                      <BarChart
                                        layout="vertical"
                                        data={sourceEffectiveness}
                                        margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                                      >
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E5E5" />
                                        <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
                                        <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 13, fontWeight: 500 }} />
                                        <RechartsTooltip 
                                            cursor={{ fill: '#F8FAFC' }}
                                            contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        />
                                        <Bar dataKey="value" fill="#3B82F6" radius={[0, 4, 4, 0]} barSize={32}>
                                           {sourceEffectiveness.map((entry, index) => (
                                              <Cell key={`cell-${index}`} fill={index === 0 ? '#2563EB' : index === 1 ? '#3B82F6' : index === 2 ? '#60A5FA' : '#93C5FD'} />
                                           ))}
                                        </Bar>
                                      </BarChart>
                                    </ResponsiveContainer>
                                    )}
                                  </div>
                              </div>
                              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col justify-center items-center text-center">
                                  <div className="w-16 h-16 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center mb-4">
                                      <Award size={32} />
                                  </div>
                                  <h2 className="text-xl font-bold text-slate-800 mb-2">Quality of Hire</h2>
                                  <div className="text-5xl font-black text-indigo-600 mb-4">{dashboardData?.quality_of_hire_percent ?? '—'}</div>
                                  <p className="text-slate-500 max-w-sm mb-6">Average conversion rate across companies with analytics rows in the database.</p>
                                  <button className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors">
                                      View Detailed breakdown
                                  </button>
                              </div>
                          </div>
                       </div>
                    </div>
                )}

                {activeTab === 'reports' && (
                    <div className="flex-1 w-full bg-[#f4f4f4] overflow-y-auto p-8">
                       <div className="max-w-6xl mx-auto">
                          <div className="flex justify-between items-center mb-6">
                             <div>
                                <h1 className="text-2xl font-semibold text-slate-900 mb-1">Advanced Reporting & Analytics</h1>
                                <p className="text-slate-500 text-sm">Deep insights into your organization's recruitment performance</p>
                             </div>
                             <div className="flex gap-2">
                                <button 
                                    onClick={() => {
                                        setIsGeneratingReport(true);
                                        setTimeout(() => {
                                            const d = dashboardData;
                                            const trends =
                                              d?.hiring_volume_history?.length
                                                ? d.hiring_volume_history
                                                : d?.trends ?? [];
                                            const hiring = trends.map((row) => ({
                                              label: row.month,
                                              value: Math.round(row.hired + (row.applied ?? 0) * 0.1),
                                            }));
                                            const tech = (d?.tech_demand ?? []).map((t) => ({
                                              name: t.name,
                                              volume: t.demand,
                                              growth: t.trend,
                                            }));
                                            const byLoc: Record<string, number> = {};
                                            (d?.openings ?? []).forEach((j) => {
                                              const city =
                                                (j.location || '').split(/[,|]/)[0]?.trim() || 'Unknown';
                                              byLoc[city] = (byLoc[city] ?? 0) + 1;
                                            });
                                            const location = Object.entries(byLoc)
                                              .sort((a, b) => b[1] - a[1])
                                              .slice(0, 10)
                                              .map(([city, hires]) => ({ city, hires }));
                                            const companyPie = (d?.company_trends ?? []).slice(0, 8).map((c) => ({
                                              skill: c.name,
                                              demand: c.openings,
                                            }));
                                            let data: Record<string, string | number>[];
                                            if (reportType === 'hiring')
                                              data = hiring.length ? hiring : [{ label: 'none', value: 0 }];
                                            else if (reportType === 'tech')
                                              data = tech.length ? tech : [{ name: 'none', volume: 0, growth: '—' }];
                                            else if (reportType === 'location')
                                              data = location.length ? location : [{ city: 'none', hires: 0 }];
                                            else if (reportType === 'company')
                                              data = companyPie.length
                                                ? companyPie
                                                : [{ skill: 'none', demand: 0 }];
                                            else
                                              data = tech.length
                                                ? tech.map((t) => ({ skill: t.name, demand: t.volume }))
                                                : [{ skill: 'none', demand: 0 }];
                                            setGeneratedReport({
                                              timestamp: new Date().toLocaleString(),
                                              company: 'Live dashboard aggregate',
                                              data,
                                            });
                                            setIsGeneratingReport(false);
                                        }, 120);
                                    }}
                                    disabled={isGeneratingReport}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isGeneratingReport ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} 
                                    {isGeneratingReport ? 'Processing...' : 'Run Analysis'}
                                </button>
                             </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
                              {[
                                { id: 'hiring', label: 'Hiring Frequency', icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50', desc: 'Recruitment volume' },
                                { id: 'tech', label: 'Tech Demand', icon: Cpu, color: 'text-indigo-600', bg: 'bg-indigo-50', desc: 'Market tech trends' },
                                { id: 'company', label: 'Company Reports', icon: Briefcase, color: 'text-emerald-600', bg: 'bg-emerald-50', desc: 'Corporate health' },
                                { id: 'location', label: 'Location Analysis', icon: MapPin, color: 'text-rose-600', bg: 'bg-rose-50', desc: 'Regional stats' },
                                { id: 'skills', label: 'Skill Analytics', icon: Activity, color: 'text-amber-600', bg: 'bg-amber-50', desc: 'Candidate competency' }
                              ].map((type) => (
                                <button 
                                  key={type.id}
                                  onClick={() => { setReportType(type.id); setGeneratedReport(null); }}
                                  className={`p-4 rounded-xl border-2 transition-all text-left bg-white shadow-sm flex flex-col gap-2 ${reportType === type.id ? 'border-blue-500 ring-4 ring-blue-500/5' : 'border-slate-100 hover:border-slate-200'}`}
                                >
                                    <div className={`w-10 h-10 ${type.bg} ${type.color} rounded-lg flex items-center justify-center`}>
                                        <type.icon size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-900 text-sm">{type.label}</h3>
                                        <p className="text-[10px] text-slate-500">{type.desc}</p>
                                    </div>
                                </button>
                              ))}
                          </div>

                          {!generatedReport ? (
                              <div className="bg-white border border-slate-200 rounded-2xl p-16 shadow-sm text-center">
                                  <div className="w-20 h-20 bg-slate-50 text-slate-200 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-slate-100 border-dashed">
                                      {isGeneratingReport ? <Loader2 size={40} className="animate-spin text-blue-300" /> : <ClipboardList size={40} />}
                                  </div>
                                  <h2 className="text-xl font-bold text-slate-800 mb-2">
                                      {isGeneratingReport ? 'AI Report Engine Running...' : 'Ready to Analyze Data'}
                                  </h2>
                                  <p className="text-slate-500 max-w-sm mx-auto mb-8 leading-relaxed">
                                      {isGeneratingReport 
                                        ? "Gemini Intelligence is processing historical hiring data, company performance metrics, and technological demand trends..."
                                        : "Select a reporting module above to begin. Our engine uses Pandas and Matplotlib concepts to visualize your workforce dynamics."
                                      }
                                  </p>
                                  {!isGeneratingReport && (
                                    <div className="flex justify-center gap-3">
                                        <button 
                                            onClick={() => {
                                                const btn = document.querySelector('button[disabled]') as HTMLButtonElement | null;
                                                if (!btn) (document.querySelector('button.bg-blue-600') as HTMLButtonElement)?.click();
                                            }}
                                            className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-black transition-colors"
                                        >
                                            Generate Now
                                        </button>
                                    </div>
                                  )}
                              </div>
                          ) : (
                              <motion.div 
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-6"
                              >
                                  {/* Report Content */}
                                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                      <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
                                          <div>
                                              <div className="text-[10px] uppercase tracking-widest font-bold text-blue-600 mb-1">Generated Report</div>
                                              <h2 className="text-xl font-bold text-slate-900">
                                                  {reportType === 'hiring' ? 'Hiring Velocity & Frequency Analysis' : 
                                                   reportType === 'tech' ? 'Quarterly Tech Demand Index' :
                                                   reportType === 'company' ? 'Enterprise Performance Dashboard' :
                                                   reportType === 'location' ? 'Geographic Workforce Distribution' :
                                                   'Strategic Skill Gap Analysis'}
                                              </h2>
                                              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5"><Clock size={12} /> {generatedReport.timestamp}</p>
                                          </div>
                                          <div className="flex gap-2">
                                              <button 
                                                onClick={() => {
                                                    const doc = new jsPDF();
                                                    doc.text(`${reportType.toUpperCase()} REPORT`, 14, 15);
                                                    doc.text(`Generated: ${generatedReport.timestamp}`, 14, 25);
                                                    
                                                    const tableData = generatedReport.data.map((obj: any) => Object.values(obj));
                                                    const headers = [Object.keys(generatedReport.data[0])];
                                                    
                                                    (doc as any).autoTable({
                                                        head: headers,
                                                        body: tableData,
                                                        startY: 35,
                                                        theme: 'grid',
                                                        headStyles: { fillStyle: '#2563EB' }
                                                    });
                                                    doc.save(`hireai_report_${reportType}.pdf`);
                                                }}
                                                className="p-2.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-blue-600 hover:border-blue-100 transition-all flex items-center gap-2 text-xs font-bold"
                                                title="Export PDF"
                                              >
                                                  <Download size={16} /> PDF
                                              </button>
                                              <button 
                                                onClick={() => {
                                                    const ws = XLSX.utils.json_to_sheet(generatedReport.data);
                                                    const wb = XLSX.utils.book_new();
                                                    XLSX.utils.book_append_sheet(wb, ws, "Report");
                                                    XLSX.writeFile(wb, `hireai_report_${reportType}.xlsx`);
                                                }}
                                                className="p-2.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-emerald-600 hover:border-emerald-100 transition-all flex items-center gap-2 text-xs font-bold"
                                                title="Export Excel"
                                              >
                                                  <FileSpreadsheet size={16} /> Excel
                                              </button>
                                              <button 
                                                onClick={() => {
                                                    const headers = Object.keys(generatedReport.data[0]).join(',');
                                                    const rows = generatedReport.data.map((obj: any) => Object.values(obj).join(',')).join('\n');
                                                    const csv = `${headers}\n${rows}`;
                                                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                                                    const link = document.createElement("a");
                                                    link.href = URL.createObjectURL(blob);
                                                    link.setAttribute("download", `hireai_report_${reportType}.csv`);
                                                    document.body.appendChild(link);
                                                    link.click();
                                                    document.body.removeChild(link);
                                                }}
                                                className="p-2.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-indigo-600 hover:border-indigo-100 transition-all flex items-center gap-2 text-xs font-bold"
                                                title="Export CSV"
                                              >
                                                  <FileJson size={16} /> CSV
                                              </button>
                                          </div>
                                      </div>

                                      <div className="p-8">
                                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                                              <div className="h-[300px] w-full bg-slate-50/50 rounded-2xl border border-slate-100 p-4">
                                                  <h3 className="text-sm font-bold text-slate-700 mb-4 px-2 tracking-tight">Statistical Distribution</h3>
                                                  <ResponsiveContainer width="100%" height="100%">
                                                    {reportType === 'hiring' ? (
                                                        <AreaChart data={generatedReport.data}>
                                                            <defs>
                                                                <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                                                                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.1}/>
                                                                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                                                                </linearGradient>
                                                            </defs>
                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                                            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94A3B8' }} />
                                                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94A3B8' }} />
                                                            <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                                            <Area type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={3} fillOpacity={1} fill="url(#colorVal)" />
                                                        </AreaChart>
                                                    ) : reportType === 'tech' ? (
                                                        <BarChart data={generatedReport.data}>
                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94A3B8' }} />
                                                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94A3B8' }} />
                                                            <RechartsTooltip />
                                                            <Bar dataKey="volume" fill="#6366F1" radius={[6, 6, 0, 0]} barSize={30} />
                                                        </BarChart>
                                                    ) : (
                                                        <PieChart>
                                                            <Pie 
                                                                data={generatedReport.data} 
                                                                dataKey={reportType === 'location' ? 'hires' : 'demand'} 
                                                                nameKey={reportType === 'location' ? 'city' : 'skill'}
                                                                cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5}
                                                            >
                                                                {generatedReport.data.map((_: any, index: number) => (
                                                                    <Cell key={`cell-${index}`} fill={['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'][index % 5]} />
                                                                ))}
                                                            </Pie>
                                                            <RechartsTooltip />
                                                        </PieChart>
                                                    )}
                                                  </ResponsiveContainer>
                                              </div>
                                              <div>
                                                  <h3 className="text-sm font-bold text-slate-700 mb-4 tracking-tight">Raw Insights Analysis</h3>
                                                  <div className="bg-slate-50/50 rounded-2xl border border-slate-100 overflow-hidden text-xs">
                                                      <div className="grid grid-cols-2 p-3 bg-white border-b border-slate-100 uppercase tracking-widest font-black text-slate-400">
                                                          <div>Metric Category</div>
                                                          <div className="text-right">Statistical Value</div>
                                                      </div>
                                                      <div className="divide-y divide-slate-100 max-h-[220px] overflow-y-auto">
                                                          {generatedReport.data.map((item: any, i: number) => (
                                                              <div key={i} className="grid grid-cols-2 p-3 items-center hover:bg-white transition-colors">
                                                                  <div className="font-bold text-slate-700">{Object.values(item)[0] as string}</div>
                                                                  <div className="text-right font-black text-slate-900">{Object.values(item)[1] as any}</div>
                                                              </div>
                                                          ))}
                                                      </div>
                                                  </div>
                                                  <div className="mt-4 p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                                                      <div className="flex items-start gap-2">
                                                          <Zap size={14} className="text-emerald-500 mt-0.5" />
                                                          <div>
                                                              <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-1">AI Recommendation</p>
                                                              <p className="text-xs text-emerald-700 leading-relaxed font-medium">
                                                                  Based on these trends, your current hiring velocity is {reportType === 'hiring' ? 'improving (+8.4% month-over-month)' : 'showing high tech alignment'}. We suggest focusing on {reportType === 'skills' ? 'Cloud Architecture' : 'Regional hub optimization'}.
                                                              </p>
                                                          </div>
                                                      </div>
                                                  </div>
                                              </div>
                                          </div>
                                          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 flex items-center justify-between">
                                              <div className="flex items-center gap-4">
                                                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-blue-600 shadow-sm border border-blue-100">
                                                      <FileText size={24} />
                                                  </div>
                                                  <div>
                                                      <h4 className="font-bold text-blue-900">Need a more granular breakdown?</h4>
                                                      <p className="text-xs text-blue-700">Schedule periodic reports or set up automated email distribution to stakeholders.</p>
                                                  </div>
                                              </div>
                                              <button className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors">
                                                  Schedule Reports
                                              </button>
                                          </div>
                                      </div>
                                  </div>
                              </motion.div>
                          )}
                       </div>
                    </div>
                )}

                {activeTab === 'recruiters' && (
                    <div className="flex-1 w-full bg-[#f4f4f4] overflow-y-auto p-8">
                       <div className="max-w-6xl mx-auto">
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6">
                             <div>
                                <h1 className="text-2xl font-semibold text-slate-900 mb-1">People intelligence</h1>
                             </div>
                             <form
                               className="flex flex-wrap items-center gap-2"
                               onSubmit={(e) => {
                                 e.preventDefault();
                                 setRecruiterOrgKeyword(recruiterOrgKeywordInput.trim());
                               }}
                             >
                                <input
                                  type="text"
                                  value={recruiterOrgKeywordInput}
                                  onChange={(e) => setRecruiterOrgKeywordInput(e.target.value)}
                                  placeholder="Search people (e.g. recruiter microsoft)..."
                                  className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 w-56"
                                />
                                <button
                                  type="submit"
                                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 flex items-center gap-2"
                                >
                                  <Search size={16} /> Search
                                </button>
                             </form>
                          </div>

                          {peopleSearchError && (
                            <div className="mb-4 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-800 text-sm whitespace-pre-wrap">
                              {peopleSearchError}
                            </div>
                          )}

                          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                             <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-[#f9f9f9]">
                               <span className="text-xs text-slate-500">
                                 {peopleTotal != null ? `${peopleTotal} results` : ' '}
                                 {peopleSource ? ` - ${peopleSource}` : ''}
                               </span>
                               <div className="flex items-center gap-2">
                                 <button
                                   type="button"
                                   disabled={peopleSearchLoading || !peopleNextCursor || !accessToken}
                                   onClick={() => {
                                     if (!accessToken || !peopleNextCursor) return;
                                     setPeopleSearchLoading(true);
                                     fetchPeopleSearch(accessToken, {
                                       query: recruiterOrgKeyword || undefined,
                                       pageSize: 25,
                                       cursor: peopleNextCursor,
                                     })
                                       .then((r) => {
                                         setPeopleResults((prev) => [...prev, ...r.people]);
                                         setPeopleSource(r.from_cache ? 'cache' : r.source);
                                         setPeopleTotal(r.totalItems);
                                         setPeopleNextCursor(r.nextCursor);
                                       })
                                       .catch((err: Error) => setPeopleSearchError(err.message))
                                       .finally(() => setPeopleSearchLoading(false));
                                   }}
                                   className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-50"
                                 >
                                   Load more
                                 </button>
                               </div>
                             </div>
                             {peopleSearchLoading ? (
                               <div className="py-20 flex justify-center text-slate-500">
                                 <Loader2 className="animate-spin" size={32} />
                               </div>
                             ) : (
                             <table className="w-full text-left border-collapse">
                                <thead>
                                   <tr className="border-b border-slate-200 bg-[#f9f9f9]">
                                      <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Person</th>
                                      <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
                                      <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Company</th>
                                      <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Location</th>
                                      <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Source</th>
                                      <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Links</th>
                                   </tr>
                                </thead>
                                <tbody>
                                   {peopleResults.length === 0 ? (
                                     <tr>
                                       <td colSpan={6} className="px-6 py-12 text-center text-slate-500 text-sm">
                                         No people returned. Adjust search text or check CompanyEnrich/Apollo keys on the server.
                                       </td>
                                     </tr>
                                   ) : (
                                   peopleResults.map((person, personIdx) => (
                                      <tr key={person.id || (person.name + '-' + personIdx)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80">
                                         <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                               {person.image_url ? (
                                                 <img src={person.image_url} alt="" className="w-9 h-9 rounded-lg object-cover bg-white border border-slate-100" />
                                               ) : (
                                                 <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                                                   {(person.name || '?').slice(0, 2).toUpperCase()}
                                                 </div>
                                               )}
                                               <div>
                                                 <div className="font-medium text-slate-900">{person.name || '-'}</div>
                                                 <div className="text-[10px] text-slate-400 mt-0.5">{person.department || person.seniority || 'Person profile'}</div>
                                               </div>
                                            </div>
                                         </td>
                                         <td className="px-4 py-3 text-sm text-slate-700">{person.position || '-'}</td>
                                         <td className="px-4 py-3 text-sm text-slate-700">
                                           <div>{person.company || '-'}</div>
                                           {person.company_domain && <div className="text-xs text-slate-400">{person.company_domain}</div>}
                                         </td>
                                         <td className="px-4 py-3 text-sm text-slate-700">{person.location || '-'}</td>
                                         <td className="px-4 py-3 text-sm text-slate-600">{person.source}</td>
                                         <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                                            {person.linkedin_url && (
                                              <a href={person.linkedin_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-xs font-medium">LinkedIn</a>
                                            )}
                                         </td>
                                      </tr>
                                   ))
                                   )}
                                </tbody>
                             </table>
                             )}
                          </div>
                      </div>
                    </div>
                )}

                {activeTab === 'admin' && isAdmin && (
                    <div className="flex-1 w-full bg-[#f4f4f4] overflow-y-auto p-8">
                      <div className="max-w-7xl mx-auto space-y-6">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          <div>
                            <h1 className="text-2xl font-semibold text-slate-900 mb-1">Admin Dashboard</h1>
                            <p className="text-slate-500 text-sm">Manage users, monitor data, inspect scraping, review analytics, and control reports.</p>
                          </div>
                          <button
                            onClick={() => {
                              if (!accessToken) return;
                              setIsAdminLoading(true);
                              fetchAdminDashboard(accessToken)
                                .then(setAdminData)
                                .catch((err: Error) => setAdminError(err.message))
                                .finally(() => setIsAdminLoading(false));
                            }}
                            className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-2"
                          >
                            {isAdminLoading ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} />}
                            Refresh Admin Data
                          </button>
                        </div>

                        {adminError && (
                          <div className="p-3 bg-rose-50 text-rose-700 border border-rose-100 rounded-lg text-sm">
                            {adminError}
                          </div>
                        )}

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                          {[
                            ['users', 'User Management', Users],
                            ['data', 'Data Monitoring', FolderDot],
                            ['scraping', 'Scraping Status', Activity],
                            ['analytics', 'Analytics Dashboard', BarChart2],
                            ['reports', 'Reports Management', ClipboardList],
                          ].map(([id, label, Icon]) => (
                            <button
                              key={String(id)}
                              onClick={() => setAdminSection(String(id))}
                              className={`px-3 py-3 rounded-lg border text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                                adminSection === id
                                  ? 'bg-blue-600 border-blue-600 text-white'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <Icon size={16} />
                              <span className="hidden lg:inline">{String(label)}</span>
                            </button>
                          ))}
                        </div>

                        {!adminData ? (
                          <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center justify-center text-slate-500">
                            <Loader2 size={36} className="animate-spin text-blue-500 mb-3" />
                            <p className="font-medium text-slate-700">Loading admin dashboard</p>
                          </div>
                        ) : (
                          <>
                            {adminSection === 'users' && (
                              <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  {[
                                    ['Total Users', adminData.user_management.total_users],
                                    ['Active Users', adminData.user_management.active_users],
                                    ['Admins', adminData.user_management.admins],
                                  ].map(([label, value]) => (
                                    <div key={String(label)} className="bg-white border border-slate-200 rounded-xl p-5">
                                      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{String(label)}</p>
                                      <p className="text-3xl font-bold text-slate-900 mt-2">{String(value)}</p>
                                    </div>
                                  ))}
                                </div>
                                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                                  <table className="w-full text-left">
                                    <thead className="bg-slate-50 border-b border-slate-200">
                                      <tr>
                                        <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">User</th>
                                        <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Role</th>
                                        <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Status</th>
                                        <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Joined</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {adminData.user_management.users.map((user) => (
                                        <tr key={user.id}>
                                          <td className="px-4 py-3">
                                            <div className="font-medium text-slate-900">{user.username}</div>
                                            <div className="text-xs text-slate-500">{user.email || 'No email'}</div>
                                          </td>
                                          <td className="px-4 py-3">
                                            <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold capitalize">{user.role}</span>
                                          </td>
                                          <td className="px-4 py-3 text-sm text-slate-700">{user.is_active ? 'Active' : 'Inactive'}</td>
                                          <td className="px-4 py-3 text-sm text-slate-500">{user.date_joined ? new Date(user.date_joined).toLocaleDateString() : 'N/A'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {adminSection === 'data' && (
                              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                {Object.entries({
                                  'Internal Openings': adminData.data_monitoring.internal_openings,
                                  'Scraped Jobs': adminData.data_monitoring.scraped_jobs,
                                  Recruiters: adminData.data_monitoring.recruiters,
                                  Companies: adminData.data_monitoring.companies,
                                  'Trend Rows': adminData.data_monitoring.hiring_trend_rows,
                                  'Cached Platform Jobs': adminData.data_monitoring.platform_cache_jobs,
                                }).map(([label, value]) => (
                                  <div key={label} className="bg-white border border-slate-200 rounded-xl p-5">
                                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</p>
                                    <p className="text-3xl font-bold text-slate-900 mt-2">{value}</p>
                                  </div>
                                ))}
                                <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-5">
                                  <h3 className="font-bold text-slate-900 mb-4">Source Distribution</h3>
                                  <div className="space-y-3">
                                    {adminData.data_monitoring.source_counts.map((source) => (
                                      <div key={source.name} className="flex items-center gap-3">
                                        <div className="w-32 text-sm font-medium text-slate-700">{source.name}</div>
                                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                          <div className="h-full bg-blue-600" style={{ width: `${Math.min(100, source.count)}%` }} />
                                        </div>
                                        <div className="w-12 text-right text-sm text-slate-500">{source.count}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}

                            {adminSection === 'scraping' && (
                              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                <div className="bg-white border border-slate-200 rounded-xl p-5">
                                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Redis</p>
                                  <p className="text-lg font-bold text-slate-900 mt-2">{adminData.scraping_status.redis_configured ? 'Configured' : 'Missing'}</p>
                                </div>
                                <div className="bg-white border border-slate-200 rounded-xl p-5 lg:col-span-2">
                                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Celery Broker</p>
                                  <p className="text-sm font-mono text-slate-700 mt-2 truncate">{adminData.scraping_status.celery_broker}</p>
                                </div>
                                <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl overflow-hidden">
                                  <div className="p-4 border-b border-slate-100 bg-slate-50">
                                    <h3 className="font-bold text-slate-900">Recent Scraped Jobs</h3>
                                  </div>
                                  <div className="divide-y divide-slate-100">
                                    {adminData.scraping_status.recent_jobs.map((job) => (
                                      <div key={job.id} className="p-4 flex items-center justify-between gap-4">
                                        <div>
                                          <div className="font-medium text-slate-900">{job.title}</div>
                                          <div className="text-xs text-slate-500">{job.company} - {job.source} - {job.query}</div>
                                        </div>
                                        <div className="text-xs text-slate-400">{job.scraped_at ? new Date(job.scraped_at).toLocaleString() : 'N/A'}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}

                            {adminSection === 'analytics' && (
                              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                <div className="bg-white border border-slate-200 rounded-xl p-5 h-80">
                                  <h3 className="font-bold text-slate-900 mb-4">Hiring Volume</h3>
                                  <ResponsiveContainer width="100%" height="85%">
                                    <AreaChart data={adminData.analytics_dashboard.hiring_volume_history}>
                                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                      <XAxis dataKey="month" />
                                      <YAxis />
                                      <RechartsTooltip />
                                      <Area type="monotone" dataKey="applied" stroke="#3b82f6" fill="#dbeafe" />
                                      <Area type="monotone" dataKey="hired" stroke="#10b981" fill="#dcfce7" />
                                    </AreaChart>
                                  </ResponsiveContainer>
                                </div>
                                <div className="bg-white border border-slate-200 rounded-xl p-5">
                                  <h3 className="font-bold text-slate-900 mb-4">Hiring Signals</h3>
                                  <div className="space-y-3 max-h-72 overflow-y-auto">
                                    {adminData.analytics_dashboard.hiring_signals.map((signal) => (
                                      <div key={signal.company} className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0">
                                        <div>
                                          <div className="font-medium text-slate-900">{signal.company}</div>
                                          <div className="text-xs text-slate-500">{signal.trend}</div>
                                        </div>
                                        <div className="text-lg font-bold text-blue-600">{signal.score}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}

                            {adminSection === 'reports' && (
                              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {adminData.reports_management.available_reports.map((report) => (
                                  <div key={report.id} className="bg-white border border-slate-200 rounded-xl p-5">
                                    <FileText size={24} className="text-blue-600 mb-3" />
                                    <h3 className="font-bold text-slate-900">{report.name}</h3>
                                    <p className="text-sm text-slate-500 mt-2">Exports: {report.exports.join(', ')}</p>
                                    <button
                                      onClick={() => {
                                        setReportType(report.id);
                                        setGeneratedReport(null);
                                        setActiveTab('reports');
                                      }}
                                      className="mt-4 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                                    >
                                      Open Report Builder
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                )}

                {activeTab === 'skills' && (
                    <div className="flex-1 w-full bg-[#f4f4f4] overflow-y-auto p-8">
                       <div className="max-w-6xl mx-auto">
                          <div className="flex justify-between items-center mb-6">
                             <div>
                                <h1 className="text-2xl font-semibold text-slate-900 mb-1">AI Resume Matcher</h1>
                                <p className="text-slate-500 text-sm">Upload a resume to extract skills and find matching companies</p>
                             </div>
                             {parsedData && (
                                <button 
                                    onClick={() => { setParsedData(null); setResumeFile(null); }}
                                    className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2"
                                >
                                    <Plus size={16} /> New Upload
                                </button>
                             )}
                          </div>

                          {!parsedData ? (
                              <div 
                                  className={`bg-white border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center transition-all ${isParsingResume ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400'}`}
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={(e) => {
                                      e.preventDefault();
                                      const file = e.dataTransfer.files[0];
                                      if (file) {
                                          setResumeFile(file);
                                          parseResume(file);
                                      }
                                  }}
                              >
                                  {isParsingResume ? (
                                      <div className="flex flex-col items-center">
                                          <Loader2 className="animate-spin text-blue-500 mb-4" size={48} />
                                          <p className="text-lg font-medium text-slate-700">Analyzing Resume...</p>
                                          <p className="text-sm text-slate-500">Gemini AI is extracting skills and profile data</p>
                                      </div>
                                  ) : (
                                      <>
                                          <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-6">
                                              <FileText size={32} />
                                          </div>
                                          <h2 className="text-xl font-bold text-slate-900 mb-2">Upload Candidate Resume</h2>
                                          <p className="text-slate-500 text-center max-w-sm mb-8">
                                              Drag and drop a .txt, .pdf, or .docx file, or click to browse.AI will automatically extract the best matches.
                                          </p>
                                          <input 
                                              type="file" 
                                              ref={resumeInputRef}
                                              className="hidden"
                                              onChange={handleResumeFileChange}
                                          />
                                          <button 
                                              onClick={() => resumeInputRef.current?.click()}
                                              className="px-8 py-3 bg-black text-white rounded-xl font-semibold shadow-lg hover:bg-slate-800 transition-all flex items-center gap-2"
                                          >
                                              <Paperclip size={18} /> Browse Files
                                          </button>
                                      </>
                                  )}
                              </div>
                          ) : (
                              <div className="space-y-6">
                                  {/* Result Header */}
                                  <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex items-start justify-between">
                                      <div className="flex items-center gap-4">
                                          <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-2xl font-bold">
                                              {parsedData.name[0]}
                                          </div>
                                          <div>
                                              <h2 className="text-2xl font-bold text-slate-900">{parsedData.name}</h2>
                                              <div className="flex flex-wrap gap-2 mt-1">
                                                  {parsedData.roles.map((role, i) => (
                                                      <span key={i} className="text-sm font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                                                          {role}
                                                      </span>
                                                  ))}
                                              </div>
                                          </div>
                                      </div>
                                      <div className="flex gap-2">
                                          <button className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors">
                                              Edit Details
                                          </button>
                                          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-all">
                                              Save to Talent Pool
                                          </button>
                                      </div>
                                  </div>

                                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                      {/* Skills Section */}
                                      <div className="lg:col-span-1 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                                          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Extracted Skills</h3>
                                          <div className="flex flex-wrap gap-2">
                                              {parsedData.skills.map((skill, i) => (
                                                  <span key={i} className="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium border border-slate-200">
                                                      {skill}
                                                  </span>
                                              ))}
                                          </div>
                                      </div>

                                      {/* Recommended Companies Section */}
                                      <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                                          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                              <h3 className="text-sm font-bold text-slate-800">Dynamic Matching Opportunities</h3>
                                              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full uppercase tracking-wider">AI Powered</span>
                                          </div>
                                          <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
                                              {resumeMatchedCompanies.map((company) => (
                                                      <div key={company.name} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-all cursor-pointer">
                                                          <div className="flex items-center gap-4">
                                                              <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center font-bold text-slate-600">
                                                                  {company.name[0]}
                                                              </div>
                                                              <div>
                                                                  <div className="font-bold text-slate-900">{company.name}</div>
                                                                  <div className="text-xs text-slate-500">{company.openings} active openings • {company.growth} growth</div>
                                                              </div>
                                                          </div>
                                                          <div className="flex items-center gap-4">
                                                              <div className="text-right">
                                                                  <div className="text-sm font-bold text-emerald-600">{company.matchScore}% Match</div>
                                                                  <div className="text-[10px] text-slate-400 font-bold uppercase">Candidate Score</div>
                                                              </div>
                                                              <button className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
                                                                  <ArrowRight size={18} className="text-slate-400" />
                                                              </button>
                                                          </div>
                                                      </div>
                                              ))}
                                              {resumeMatchedCompanies.length === 0 && (
                                                <div className="p-6 text-center text-sm text-slate-500">
                                                  No saved companies match the extracted resume skills yet.
                                                </div>
                                              )}
                                          </div>
                                      </div>
                                  </div>

                                  {/* Related Openings based on Roles */}
                                  <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                                      <h3 className="text-lg font-bold text-slate-900 mb-4">Relevant Openings for {parsedData.roles[0] || 'Profile'}</h3>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                          {resumeMatchedOpenings.map(({ job, score }) => (
                                              <div key={job.job_id} className="p-4 border border-slate-100 rounded-xl hover:border-blue-200 hover:shadow-md transition-all flex justify-between items-center group">
                                                  <div>
                                                      <h4 className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{job.title}</h4>
                                                      <p className="text-xs text-slate-500 font-medium">{job.company} • {job.location}</p>
                                                      <div className="flex gap-4 mt-2">
                                                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{job.salary}</span>
                                                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{job.experience}</span>
                                                          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">{Math.min(98, 50 + score * 2)}% Match</span>
                                                      </div>
                                                  </div>
                                                  {job.url && job.url !== '#' ? (
                                                    <a href={job.url} target="_blank" rel="noreferrer" className="bg-black text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-blue-600 transition-all">
                                                        View Role
                                                    </a>
                                                  ) : (
                                                    <button className="bg-black text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-blue-600 transition-all">
                                                        View Role
                                                    </button>
                                                  )}
                                              </div>
                                          ))}
                                          {resumeMatchedOpenings.length === 0 && (
                                            <div className="md:col-span-2 p-6 rounded-xl border border-slate-100 text-center text-sm text-slate-500">
                                              No saved openings match this resume yet. Try refreshing listings or adding openings with matching skills.
                                            </div>
                                          )}
                                      </div>
                                  </div>
                              </div>
                          )}
                       </div>
                    </div>
                )}
            </main>

            {/* Bootstrap Admin Setup Modal */}
            <AnimatePresence>
                {dashboardData?.user?.is_bootstrap_admin && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[120] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 16 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 16 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
                        >
                            <div className="p-5 border-b border-slate-100 bg-slate-50">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center">
                                        <Settings size={20} />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-slate-900">Create your admin account</h2>
                                        <p className="text-xs text-slate-500">This temporary setup account will be deleted permanently.</p>
                                    </div>
                                </div>
                            </div>
                            <form onSubmit={handleBootstrapAdminSetup} className="p-5 space-y-4">
                                {setupAdminError && (
                                    <div className="p-3 rounded-lg bg-rose-50 text-rose-700 border border-rose-100 text-sm">
                                        {setupAdminError}
                                    </div>
                                )}
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Admin Gmail</label>
                                    <input
                                        type="email"
                                        required
                                        value={setupAdminEmail}
                                        onChange={(e) => setSetupAdminEmail(e.target.value)}
                                        placeholder="yourname@gmail.com"
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Password</label>
                                    <input
                                        type="password"
                                        required
                                        value={setupAdminPassword}
                                        onChange={(e) => setSetupAdminPassword(e.target.value)}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Confirm Password</label>
                                    <input
                                        type="password"
                                        required
                                        value={setupAdminConfirm}
                                        onChange={(e) => setSetupAdminConfirm(e.target.value)}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={isSetupAdminSaving}
                                    className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:bg-slate-300 transition-colors flex items-center justify-center gap-2"
                                >
                                    {isSetupAdminSaving && <Loader2 size={16} className="animate-spin" />}
                                    Create Admin & Delete Temporary Account
                                </button>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Account Modal */}
            <AnimatePresence>
                {isAccountModalOpen && (
                    <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
                    >
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col"
                        >
                            <div className="flex items-center justify-between p-4 border-b border-slate-100">
                                <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                                    <User size={20} className="text-blue-500" />
                                    Your Account
                                </h2>
                                <button 
                                    onClick={() => setIsAccountModalOpen(false)}
                                    className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                            
                            <form onSubmit={handleSavePassword} className="p-4 flex flex-col gap-3">
                                <div className="flex flex-col items-center justify-center py-2">
                                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 mb-2 border-4 border-blue-50">
                                        <User size={24} />
                                    </div>
                                    <h3 className="text-base font-bold text-slate-800">Hiring Manager</h3>
                                    <p className="text-xs text-slate-500">hiring@company.com</p>
                                </div>
                                
                                <div className="h-px w-full bg-slate-100"></div>
                                
                                <h3 className="font-medium text-slate-800 text-sm">Change Password</h3>
                                
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Current Password</label>
                                    <input 
                                        type="password" 
                                        required
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono" 
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">New Password</label>
                                    <input 
                                        type="password" 
                                        required
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono" 
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Confirm New Password</label>
                                    <input 
                                        type="password" 
                                        required
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono" 
                                    />
                                </div>
                                
                                <div className="mt-2 pt-3 border-t border-slate-100 flex justify-end gap-3">
                                    <button 
                                        type="button"
                                        onClick={() => setIsAccountModalOpen(false)}
                                        className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        type="submit"
                                        className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
                                    >
                                        Save Changes
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Settings Modal */}
            <AnimatePresence>
                {isSettingsModalOpen && (
                    <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
                    >
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col"
                        >
                            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
                                <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                                    <Settings size={20} className="text-blue-500" />
                                    Application Settings
                                </h2>
                                <button 
                                    onClick={() => setIsSettingsModalOpen(false)}
                                    className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                            
                            <form onSubmit={handleSaveSettings} className="p-6 flex flex-col gap-6">
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <Bot size={18} className="text-blue-500" />
                                        <h3 className="font-semibold text-slate-800">AI Integrations</h3>
                                    </div>
                                    <p className="text-sm text-slate-500 mb-4">
                                        Configure your external AI providers to enable advanced resume matching and automated interviews.
                                    </p>
                                    
                                    <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                        <div>
                                            <label className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1.5">
                                                <span>Gemini</span>
                                                <span className="text-[10px] font-medium bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded text-left">Server-side</span>
                                            </label>
                                            <p className="mt-1 text-[11px] text-slate-500 text-left">Configured securely on the server.</p>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="mt-2 pt-4 border-t border-slate-100 flex justify-end gap-3">
                                    <button 
                                        type="button"
                                        onClick={() => setIsSettingsModalOpen(false)}
                                        className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        type="submit"
                                        className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
                                    >
                                        Save Configuration
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

