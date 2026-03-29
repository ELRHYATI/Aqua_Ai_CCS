import { clearAccessToken, getAccessToken } from '../lib/authStorage'

const API_BASE = '/api/v1'
const TASK_POLL_INTERVAL_MS = 800
const TASK_MAX_WAIT_MS = 120_000

function authHeaders(includeJsonContentType = true): Record<string, string> {
  const h: Record<string, string> = {}
  if (includeJsonContentType) h['Content-Type'] = 'application/json'
  const t = getAccessToken()
  if (t) h['Authorization'] = `Bearer ${t}`
  return h
}

function onUnauthorized(path: string) {
  if (path.startsWith('/auth/login') || path.startsWith('/auth/setup')) return
  clearAccessToken()
  if (typeof window === 'undefined') return
  const p = window.location.pathname
  if (p.startsWith('/login') || p.startsWith('/setup')) return
  window.location.assign('/login')
}

export interface TaskStatusResponse {
  status: 'pending' | 'running' | 'done' | 'error'
  result?: { estran: number; finance: number; purchases: number } | MLAnalysisResponse
  error_message?: string
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const isFormData = options?.body instanceof FormData
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...authHeaders(!isFormData),
      ...(options?.headers as Record<string, string>),
    },
  })
  if (res.status === 401) onUnauthorized(path)
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`)
  return res.json()
}

async function pollTaskUntilDone<T>(taskId: string): Promise<T> {
  const start = Date.now()
  while (Date.now() - start < TASK_MAX_WAIT_MS) {
    const status = await fetchApi<TaskStatusResponse>(`/tasks/${taskId}/status`)
    if (status.status === 'done' && status.result != null) {
      return status.result as T
    }
    if (status.status === 'error') {
      throw new Error(status.error_message ?? 'Task failed')
    }
    await new Promise((r) => setTimeout(r, TASK_POLL_INTERVAL_MS))
  }
  throw new Error('Task timeout')
}

export const api = {
  getEstranSheets: () => fetchApi<EstranSheetInfo[]>(`/estran/sheets`),
  getEstranStats: (params?: { sheet?: string }) => {
    const sp = new URLSearchParams()
    if (params?.sheet) sp.set('sheet', params.sheet)
    return fetchApi<EstranStatsResponse>(`/estran/stats?${sp}`)
  },
  getEstranRecords: (params?: { limit?: number; offset?: number; year?: number; sheet?: string }) => {
    const sp = new URLSearchParams()
    if (params?.limit) sp.set('limit', String(params.limit))
    if (params?.offset) sp.set('skip', String(params.offset))
    if (params?.year) sp.set('year', String(params.year))
    if (params?.sheet) sp.set('sheet', params.sheet)
    return fetchApi<EstranRecord[]>(`/estran/records?${sp}`)
  },
  getEstranAnomalies: (params?: { limit?: number; year?: number; sheet?: string; method?: string }) => {
    const sp = new URLSearchParams()
    if (params?.limit) sp.set('limit', String(params.limit))
    if (params?.year) sp.set('year', String(params.year))
    if (params?.sheet) sp.set('sheet', params.sheet)
    if (params?.method) sp.set('method', params.method)
    return fetchApi<EstranAnomalyRecord[]>(`/estran/anomalies?${sp}`)
  },
  getEstranKpis: (params?: { parc?: string; annee?: number; base?: string }) => {
    const sp = new URLSearchParams()
    if (params?.parc) sp.set('parc', params.parc)
    if (params?.annee) sp.set('annee', String(params.annee))
    if (params?.base) sp.set('base', params.base)
    return fetchApi<EstranKpiResponse>(`/estran/kpi?${sp}`)
  },
  getEstranFilters: () => fetchApi<EstranFiltersResponse>(`/estran/filters`),
  getEstranChartRendement: (params?: { parc?: string; annee?: number; base?: string }) => {
    const sp = new URLSearchParams()
    if (params?.parc) sp.set('parc', params.parc)
    if (params?.annee) sp.set('annee', String(params.annee))
    if (params?.base) sp.set('base', params.base)
    return fetchApi<ChartDataPoint[]>(`/estran/charts/rendement?${sp}`)
  },
  getEstranChartAge: (params?: { parc?: string; annee?: number; base?: string }) => {
    const sp = new URLSearchParams()
    if (params?.parc) sp.set('parc', params.parc)
    if (params?.annee) sp.set('annee', String(params.annee))
    if (params?.base) sp.set('base', params.base)
    return fetchApi<ChartDataPoint[]>(`/estran/charts/age-recolte?${sp}`)
  },
  getEstranChartStockLignes: (params?: { parc?: string; annee?: number; base?: string }) => {
    const sp = new URLSearchParams()
    if (params?.parc) sp.set('parc', params.parc)
    if (params?.annee) sp.set('annee', String(params.annee))
    if (params?.base) sp.set('base', params.base)
    return fetchApi<ChartDataPoint[]>(`/estran/charts/stock-lignes?${sp}`)
  },
  getEstranChartStockAge: (params?: { parc?: string; base?: string }) => {
    const sp = new URLSearchParams()
    if (params?.parc) sp.set('parc', params.parc)
    if (params?.base) sp.set('base', params.base)
    return fetchApi<StockAgeDataPoint[]>(`/estran/charts/stock-age-sejour?${sp}`)
  },
  getFinanceAnomalies: (params?: { limit?: number; year?: number; method?: string }) => {
    const sp = new URLSearchParams()
    if (params?.limit) sp.set('limit', String(params.limit))
    if (params?.year) sp.set('year', String(params.year))
    if (params?.method) sp.set('method', params.method)
    return fetchApi<FinanceAnomalyRecord[]>(`/finance/anomalies?${sp}`)
  },
  getAchatAnomalies: (params?: { limit?: number; method?: string }) => {
    const sp = new URLSearchParams()
    if (params?.limit) sp.set('limit', String(params.limit))
    if (params?.method) sp.set('method', params.method)
    return fetchApi<AchatAnomalyRecord[]>(`/achat/anomalies?${sp}`)
  },
  login: async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(typeof data.detail === 'string' ? data.detail : 'Échec de la connexion')
    }
    return data as LoginResponse
  },
  setupFirstAdmin: async (body: { full_name: string; email: string; password: string }) => {
    const res = await fetch(`${API_BASE}/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(typeof data.detail === 'string' ? data.detail : "Impossible de créer l'administrateur")
    }
    return data as LoginResponse
  },
  getMLAnalysis: async () => {
    const res = await fetch(`${API_BASE}/ml/analysis`, { headers: authHeaders(false) })
    if (res.status === 401) onUnauthorized('/ml/analysis')
    if (res.status === 202) {
      const { task_id } = await res.json()
      return pollTaskUntilDone<MLAnalysisResponse>(task_id)
    }
    if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`)
    return res.json()
  },
  getFinanceLines: (params?: { limit?: number; offset?: number; year?: number; month?: number }) => {
    const sp = new URLSearchParams()
    if (params?.limit) sp.set('limit', String(params.limit))
    if (params?.offset) sp.set('skip', String(params.offset))
    if (params?.year) sp.set('year', String(params.year))
    if (params?.month) sp.set('month', String(params.month))
    return fetchApi<FinanceLine[]>(`/finance/lines?${sp}`)
  },
  getFinanceGlEntries: (params: { account: string; year?: number }) => {
    const sp = new URLSearchParams()
    sp.set('account', params.account)
    if (params.year != null) sp.set('year', String(params.year))
    return fetchApi<{ account: string; entries: GlEntry[] }>(`/finance/gl-entries?${sp}`)
  },
  getFinanceKpi: (params?: { year?: number; source?: string; monthTo?: number }) => {
    const sp = new URLSearchParams()
    if (params?.year) sp.set('year', String(params.year))
    if (params?.source) sp.set('source', params.source)
    if (params?.monthTo != null) sp.set('month_to', String(params.monthTo))
    return fetchApi<FinanceKpiResponse>(`/finance/kpi?${sp}`)
  },
  postFinanceCommentary: (data: VarianceInput) =>
    fetchApi<Commentary>(`/finance/commentary`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  postFinanceGlCommentary: (params: { account: string; year?: number; label?: string }) => {
    const sp = new URLSearchParams()
    sp.set('account', params.account)
    if (params.year != null) sp.set('year', String(params.year))
    if (params.label) sp.set('label', params.label)
    return fetchApi<{ account: string; commentary: string }>(`/finance/gl-commentary?${sp}`, {
      method: 'POST',
      body: '{}',
    })
  },
  getPurchaseDA: () => fetchApi<PurchaseDA[]>(`/achat/da`),
  getPurchaseBC: () => fetchApi<PurchaseBC[]>(`/achat/bc`),
  getAchatPriorities: () => fetchApi<PurchasePriority[]>(`/achat/priorities`),
  getAchatSuivi: () => fetchApi<AchatSuiviResponse>(`/achat/suivi`),
  getChatConfig: () => fetchApi<{ preferBackend: boolean }>(`/chat/config`),
  postChat: (message: string) =>
    fetchApi<{ response: string; citations?: string[]; data_used?: string[] }>(`/chat`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  postChatAnalyze: (body: { message: string; include_data?: boolean }) =>
    fetchApi<{ response: string; data_used?: string[]; model: string; timestamp: string }>(`/chat/analyze`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  postChatReport: async (body: { message: string; title?: string }) => {
    const res = await fetch(`${API_BASE}/chat/report`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    })
    if (res.status === 401) onUnauthorized('/chat/report')
    if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`)
    return res.blob()
  },
  getChatReports: async () => {
    const res = await fetchApi<{ reports: { filename: string; created_at: string; size_kb: number }[] }>(`/chat/reports`)
    return res.reports ?? []
  },
  getChatReportDownload: async (filename: string) => {
    const res = await fetch(`${API_BASE}/chat/reports/${encodeURIComponent(filename)}`, {
      headers: authHeaders(false),
    })
    if (res.status === 401) onUnauthorized('/chat/reports')
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.blob()
  },
  getDashboardStats: () => fetchApi<DashboardStats>(`/dashboard/stats`),
  getActivityRecent: (limit = 10) => fetchApi<ActivityLogEntry[]>(`/dashboard/activity/recent?limit=${limit}`),
  getChatStatus: () => fetchApi<ChatStatusResponse>(`/chat/status`),
  syncOneDrive: () =>
    fetchApi<{ estran: number; finance: number; purchases: number }>(`/sync/onedrive`, {
      method: 'POST',
    }),

  // Admin
  getAdminUsers: () => fetchApi<UserResponse[]>(`/admin/users`),
  postAdminUser: (data: UserCreate) =>
    fetchApi<UserResponse>(`/admin/users`, { method: 'POST', body: JSON.stringify(data) }),
  patchAdminUser: (id: string, data: UserUpdate) =>
    fetchApi<UserResponse>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  postAdminUserPrivileges: (id: string, data: UserPrivileges) =>
    fetchApi<UserResponse>(`/admin/users/${id}/privileges`, { method: 'POST', body: JSON.stringify(data) }),
  getAdminAudit: (params?: AuditQueryParams) => {
    const sp = new URLSearchParams()
    if (params?.user_id) sp.set('user_id', params.user_id)
    if (params?.module) sp.set('module', params.module)
    if (params?.action) sp.set('action', params.action)
    if (params?.status) sp.set('status', params.status)
    if (params?.date_from) sp.set('date_from', params.date_from)
    if (params?.date_to) sp.set('date_to', params.date_to)
    if (params?.search) sp.set('search', params.search)
    if (params?.page) sp.set('page', String(params.page))
    if (params?.page_size) sp.set('page_size', String(params.page_size))
    return fetchApi<AuditResponse>(`/admin/audit?${sp}`)
  },
  getAdminStats: () => fetchApi<AdminStats>(`/admin/stats`),
  getAdminAuditSummary: () => fetchApi<AuditSummary>(`/admin/audit/summary`),
  getAdminAuditUser: (userId: string) => fetchApi<UserTimeline>(`/admin/audit/user/${userId}`),

  uploadExcel: async (file: File | File[]) => {
    const formData = new FormData()
    const files = Array.isArray(file) ? file : [file]
    files.forEach((f) => formData.append('file', f))
    const res = await fetch(`${API_BASE}/sync/upload`, {
      method: 'POST',
      headers: authHeaders(false),
      body: formData,
    })
    if (res.status === 401) onUnauthorized('/sync/upload')
    if (res.status === 202) {
      const { task_id } = await res.json()
      return pollTaskUntilDone<{ estran: number; finance: number; purchases: number }>(task_id)
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(typeof err.detail === 'string' ? err.detail : JSON.stringify(err))
    }
    return res.json() as Promise<{ estran: number; finance: number; purchases: number }>
  },
}

export interface EstranSheetInfo {
  name: string
  count: number
}

export interface EstranStatsResponse {
  moyenne_taux_recapture_echantillonnage?: number | null
  moyenne_taux_recapture_transfert?: number | null
  objectifs_recolte: string[]
}

export interface KpiIndicator {
  value: number
  unit: string
  trend: number
  trend_direction: 'up' | 'down' | 'stable'
}

export interface EstranKpiResponse {
  rendement_primaire: KpiIndicator
  rendement_hc: KpiIndicator
  age_recolte_primaire: KpiIndicator
  age_recolte_hc: KpiIndicator
  stock_lignes_primaire: KpiIndicator
  stock_lignes_hc: KpiIndicator
}

export interface ChartDataPoint {
  annee: number
  parc: string
  valeur: number
}

export interface StockAgeDataPoint {
  tranche: string
  lignes: number
  parc?: string
}

export interface EstranFiltersResponse {
  parcs: string[]
  annees: number[]
}

export interface EstranRecord {
  id: number
  parc_semi?: string
  parc_an?: string
  ligne_num?: number
  phase?: string
  date_semis?: string
  date_recolte?: string
  quantite_brute_recoltee_kg?: number
  biomasse_gr?: number
  biomasse_vendable_kg?: number
  statut?: string
  year?: number
  month?: number
  sheet_name?: string
  type_recolte?: string
  taux_recapture?: number
  objectif_recolte?: string
}

export interface EstranAnomalyRecord extends EstranRecord {
  anomaly_score: number
  severity: string
  is_anomaly: boolean
  explanation?: string
  reason?: string  // Human-readable reason (e.g. "Value is 3.2x above median")
}

export interface FinanceLine {
  id: number
  code: string
  ordre?: number
  gr?: string
  label?: string
  ytd?: number
  n1?: number
  budget?: number
  real?: number
  var_b_r?: number
  var_pct?: number
  var_r_n1?: number
  year?: number
  month?: number
}

export interface FinanceKpiRow {
  account: string
  label: string
  ytd: number
  budget_ytd: number
  last_year_ytd: number
  var_budget: number | null
  var_last_year: number | null
  var_budget_div_zero: boolean
  var_last_year_div_zero: boolean
}

export interface GlEntry {
  date_str: string
  label: string
  amount: number
  year: number | null
  month: number | null
}

export interface FinanceKpiResponse {
  total_ytd: number
  total_budget_ytd: number
  total_last_year_ytd: number
  var_budget_pct: number | null
  var_last_year_pct: number | null
  rows: FinanceKpiRow[]
  year: number | null
}

export interface VarianceInput {
  ytd?: number
  budget?: number
  n1?: number
  real?: number
  var_b_r?: number
  var_pct?: number
  top_drivers?: string[]
  period_label?: string
}

export interface Commentary {
  summary: string
  key_drivers: string[]
  recommendations: string[]
}

export interface PurchaseDA {
  id: number
  reference?: string
  amount?: number
  delay_days: number
  status?: string
  critical_flag: boolean
}

export interface PurchaseBC {
  id: number
  reference?: string
  amount?: number
  delay_days: number
  status?: string
  critical_flag: boolean
  expected_delivery_date?: string
}

export interface PurchasePriority {
  id: number
  type: 'da' | 'bc'
  reference?: string
  amount?: number
  delay_days: number
  status?: string
  critical_flag: boolean
  risk_score: number
  expected_delivery_date?: string
}

export interface FinanceAnomalyRecord {
  id: number
  code: string
  gr?: string
  label?: string
  budget?: number
  real?: number
  n1?: number
  var_b_r?: number
  var_pct?: number
  year?: number
  month?: number
  anomaly_score: number
  severity: string
  is_anomaly: boolean
  explanation?: string
}

export interface AchatAnomalyRecord {
  id: number
  type: 'da' | 'bc'
  reference?: string
  amount?: number
  delay_days: number
  status?: string
  critical_flag: boolean
  expected_delivery_date?: string
  anomaly_score: number
  severity: string
  is_anomaly: boolean
  explanation?: string
}

export interface MLAnalysisResponse {
  clusters: { cluster_id: number; label: string; count: number; centroid_summary: Record<string, number>; top_members: { code?: string; label?: string; var_b_r?: number }[] }[]
  trends: { metric: string; direction: string; change_pct: number; recent_avg: number; prior_avg: number }[]
  insights: { type: string; title: string; description: string; severity: string; data?: Record<string, unknown> }[]
  anomaly_counts: { estran: number; finance: number; achats: number }
}

export interface AchatSuiviSummary {
  total_lignes: number
  total_da: number
  da_en_cours: number
  bc_en_cours: number
  bc_livrees: number
  valeur_totale: number
  fournisseurs: number
  categories: number
  /** Jours moyens entre création DA et création BC (lignes avec les deux dates). */
  delai_moyen_traitement_da_jours?: number | null
  delai_traitement_da_echantillon_n?: number
  /** On Time Delivery : réception ≤ date début livraison promise. */
  taux_otd_pct?: number | null
  bc_otd_echantillon_n?: number
  /** On Time In Full : à l’heure + qte réception ≥ qte BC. */
  taux_otif_pct?: number | null
  bc_otif_echantillon_n?: number
}

export interface AchatSuiviKpis {
  statut_da: Record<string, number>
  statut_cde: Record<string, number>
  capex_opex: Record<string, { count: number; valeur: number; statut_da: Record<string, number>; statut_cde: Record<string, number> }>
  by_demandeur: { name: string; count: number; statut_da: Record<string, number>; statut_cde: Record<string, number> }[]
  top_categories: { name: string; count: number; valeur: number }[]
  top_fournisseurs: { name: string; count: number; valeur: number }[]
  timeline: { month: string; da_created: number; bc_created: number; valeur: number }[]
}

export interface AchatSuiviRecord {
  type_process?: string
  capex_opex?: string
  id_da?: number
  date_creation_da?: string
  produit?: string
  categorie?: string
  demandeur?: string
  statut_da?: string
  id_cde?: number
  date_creation_bc?: string
  acheteur?: string
  statut_cde?: string
  valeur?: number
  fournisseur?: string
  date_debut_livraison?: string
  bl?: string
  date_reception?: string
  facture?: string
  commentaire?: string
}

export interface AchatSuiviResponse {
  summary: AchatSuiviSummary
  kpis: AchatSuiviKpis
  records: AchatSuiviRecord[]
}

export interface UserResponse {
  id: string
  full_name: string
  email: string
  role: string
  department: string | null
  is_active: boolean
  can_export_pdf: boolean
  can_upload_files: boolean
  can_use_chatbot: boolean
  can_view_finance: boolean
  can_view_estran: boolean
  can_view_achat: boolean
  can_run_ml: boolean
  can_manage_users: boolean
  notes: string | null
}

export interface LoginResponse {
  access_token: string
  token_type: string
  user_id: string
  email: string
  full_name: string
  role: string
}

export interface UserCreate {
  full_name: string
  email: string
  password?: string
  role: string
  department?: string
  can_export_pdf?: boolean
  can_upload_files?: boolean
  can_use_chatbot?: boolean
  can_view_finance?: boolean
  can_view_estran?: boolean
  can_view_achat?: boolean
  can_run_ml?: boolean
  can_manage_users?: boolean
  notes?: string
}

export interface UserUpdate {
  full_name?: string
  email?: string
  password?: string
  role?: string
  department?: string
  is_active?: boolean
  can_export_pdf?: boolean
  can_upload_files?: boolean
  can_use_chatbot?: boolean
  can_view_finance?: boolean
  can_view_estran?: boolean
  can_view_achat?: boolean
  can_run_ml?: boolean
  can_manage_users?: boolean
  notes?: string
}

export interface UserPrivileges {
  can_export_pdf?: boolean
  can_upload_files?: boolean
  can_use_chatbot?: boolean
  can_view_finance?: boolean
  can_view_estran?: boolean
  can_view_achat?: boolean
  can_run_ml?: boolean
  can_manage_users?: boolean
}

export interface AdminStats {
  active_users: number
  active_sessions: number
  actions_today: number
  alerts_active: number
}

export interface AuditLog {
  id: number
  timestamp: string
  user_id: string | null
  full_name: string | null
  email: string | null
  action: string
  module: string
  status: string
  ip_address: string | null
  file_name: string | null
  chat_message: string | null
  duration_ms: number | null
  details: Record<string, unknown> | null
}

export interface AuditResponse {
  items: AuditLog[]
  total: number
  page: number
  pages: number
}

export interface AuditQueryParams {
  user_id?: string
  module?: string
  action?: string
  status?: string
  date_from?: string
  date_to?: string
  search?: string
  page?: number
  page_size?: number
}

export interface AuditSummary {
  total_events: number
  failed_logins: number
  blocked_attempts: number
  files_uploaded: number
  chatbot_questions: number
  most_active_users: { user_id: string; count: number }[]
  events_per_day: { date: string; count: number }[]
  most_used_modules: { module: string; count: number }[]
  suspicious_ips: string[]
}

export interface UserTimeline {
  user: UserResponse
  stats: {
    total_logins: number
    last_login: string | null
    first_login: string | null
    files_uploaded: number
    chatbot_questions: number
    access_denied: number
  }
  timeline: { date: string; events: { id: number; timestamp: string; action: string; module: string; status: string; ip_address: string | null; details: Record<string, unknown> | null; file_name: string | null; file_size_kb: number | null; chat_message: string | null; duration_ms: number | null }[] }[]
}

export interface ChatStatusResponse {
  ollama_online: boolean
  model: string
  latency_ms: number
}

export interface ActivityLogEntry {
  id: number
  timestamp: string | null
  user_id: string | null
  full_name: string | null
  action: string
  module: string
  status: string
  details: Record<string, unknown> | null
}

export interface DashboardStats {
  estran: {
    by_parc: { parc: string; biomasse: number }[]
    by_year_month: { year: number; count: number }[]
    totals: { records: number; biomasse_gr: number }
  }
  finance: {
    budget_vs_real: { budget: number; real: number; n1: number; ytd: number }
    top_variances: { code: string; label: string; var_b_r: number; var_pct: number }[]
    totals: { lines: number }
  }
  achats: {
    da_bc_summary: { type: string; count: number; amount: number }[]
    by_risk: { level: string; count: number }[]
  }
  estran_stock_total?: number
  finance_variance_pct?: number
  achat_da_pending?: number
  achat_da_urgent?: number
  anomalies_estran?: number
  anomalies_finance?: number
  last_sync_at?: string | null
}
