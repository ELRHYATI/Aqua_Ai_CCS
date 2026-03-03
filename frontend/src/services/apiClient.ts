const API_BASE = '/api/v1'

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`)
  return res.json()
}

export const api = {
  getEstranRecords: (params?: { limit?: number; offset?: number; year?: number }) => {
    const sp = new URLSearchParams()
    if (params?.limit) sp.set('limit', String(params.limit))
    if (params?.offset) sp.set('skip', String(params.offset))
    if (params?.year) sp.set('year', String(params.year))
    return fetchApi<EstranRecord[]>(`/estran/records?${sp}`)
  },
  getEstranAnomalies: (params?: { limit?: number; year?: number; method?: string }) => {
    const sp = new URLSearchParams()
    if (params?.limit) sp.set('limit', String(params.limit))
    if (params?.year) sp.set('year', String(params.year))
    if (params?.method) sp.set('method', params.method)
    return fetchApi<EstranAnomalyRecord[]>(`/estran/anomalies?${sp}`)
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
  getMLAnalysis: () => fetchApi<MLAnalysisResponse>(`/ml/analysis`),
  getFinanceLines: (params?: { limit?: number; offset?: number; year?: number; month?: number }) => {
    const sp = new URLSearchParams()
    if (params?.limit) sp.set('limit', String(params.limit))
    if (params?.offset) sp.set('skip', String(params.offset))
    if (params?.year) sp.set('year', String(params.year))
    if (params?.month) sp.set('month', String(params.month))
    return fetchApi<FinanceLine[]>(`/finance/lines?${sp}`)
  },
  postFinanceCommentary: (data: VarianceInput) =>
    fetchApi<Commentary>(`/finance/commentary`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getPurchaseDA: () => fetchApi<PurchaseDA[]>(`/achat/da`),
  getPurchaseBC: () => fetchApi<PurchaseBC[]>(`/achat/bc`),
  getAchatPriorities: () => fetchApi<PurchasePriority[]>(`/achat/priorities`),
  postChat: (message: string) =>
    fetchApi<{ response: string; citations?: string[] }>(`/chat`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  getDashboardStats: () => fetchApi<DashboardStats>(`/dashboard/stats`),
  syncOneDrive: () =>
    fetchApi<{ estran: number; finance: number; purchases: number }>(`/sync/onedrive`, {
      method: 'POST',
    }),

  uploadExcel: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${API_BASE}/sync/upload`, {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(typeof err.detail === 'string' ? err.detail : JSON.stringify(err))
    }
    return res.json() as Promise<{ estran: number; finance: number; purchases: number }>
  },
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
}

export interface EstranAnomalyRecord extends EstranRecord {
  anomaly_score: number
  severity: string
  is_anomaly: boolean
  explanation?: string
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
}
