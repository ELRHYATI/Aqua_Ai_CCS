import { clearAccessToken, getAccessToken } from '../lib/authStorage'

const API_BASE = '/api/v1'

export type EstranBase = 'primaire' | 'hc'

export interface EstranKpiBreakdown {
  parc?: string | null
  residence?: string | null
  year?: number | null
  month?: number | null
  origine?: string | null
}

export interface EstranKpiItem {
  kpiKey: string
  label: string
  base: 'Primaire' | 'HC'
  value: number | null
  unit: string
  comment: string
  formula: string
  division_by_zero: boolean
  breakdown: EstranKpiBreakdown
}

export interface EstranKpiSeriesPoint {
  kpiKey: string
  label: string
  base: 'Primaire' | 'HC'
  unit: string
  value: number | null
  year?: number | null
  month?: number | null
  parc?: string | null
  residence?: string | null
  origine?: string | null
}

export interface EstranFieldMapping {
  effectif_total: string
  effectif_seme: string
  total_recolte_kg: string
  hc_resseme_kg: string
  vendable_kg_200m: string
  nb_ligne_recolte_200m: string
  poids_moyen_prim_g: string
  poids_moyen_hc_g: string
  nb_ligne_semee_200m: string
  residence_estran: string
  origine_recolte_primaire: string
}

export interface EstranKpiResponse {
  items: EstranKpiItem[]
  chart_series: EstranKpiSeriesPoint[]
  field_mapping: EstranFieldMapping
  notes: string[]
}

export interface EstranFiltersResponse {
  parcs: string[]
  annees: number[]
  months: number[]
  residences: string[]
  origines: string[]
  n_parc_an?: string[]
  generations_semi?: string[]
}

export interface EstranKpiQueryParams {
  base?: EstranBase
  year?: number
  month?: number
  parc?: string
  parc_an?: string
  generation_semi?: string
  residence?: string
  origine?: string
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getAccessToken()
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

function onUnauthorized() {
  clearAccessToken()
  if (typeof window !== 'undefined') {
    window.location.assign('/login')
  }
}

async function fetchEstranApi<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() })
  if (res.status === 401) onUnauthorized()
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`)
  return res.json()
}

export async function getEstranKpis(params: EstranKpiQueryParams): Promise<EstranKpiResponse> {
  const sp = new URLSearchParams()
  if (params.base) sp.set('base', params.base)
  if (params.year != null) sp.set('year', String(params.year))
  if (params.month != null) sp.set('month', String(params.month))
  if (params.parc) sp.set('parc', params.parc)
  if (params.parc_an) sp.set('parc_an', params.parc_an)
  if (params.generation_semi) sp.set('generation_semi', params.generation_semi)
  if (params.residence) sp.set('residence', params.residence)
  if (params.origine) sp.set('origine', params.origine)
  return fetchEstranApi<EstranKpiResponse>(`/estran/kpi/production?${sp.toString()}`)
}

export async function getEstranFilters(): Promise<EstranFiltersResponse> {
  return fetchEstranApi<EstranFiltersResponse>('/estran/filters')
}
