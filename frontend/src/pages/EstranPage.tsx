import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LineChart, Line, BarChart, Bar, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  Legend, ResponsiveContainer, ReferenceDot,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Minus, Clock, Layers,
  AlertTriangle, AlertCircle, Info, Waves,
  X, Maximize2, Download, RotateCcw,
} from 'lucide-react'
import { api } from '../services/apiClient'
import type {
  EstranAnomalyRecord, ChartDataPoint,
  KpiIndicator, EstranSheetInfo,
} from '../services/apiClient'
import styles from './EstranPage.module.css'
import { cn } from '../lib/utils'

/* ───────────────────── constants ───────────────────── */

const PARC_COLORS = ['#0D9488', '#1E3A5F', '#F59E0B', '#8B5CF6', '#EF4444', '#10B981']

const SEVERITY_CONFIG: Record<string, { label: string; color: string; desc: string; icon: typeof AlertTriangle }> = {
  critical: { label: 'Critique', color: '#ef4444', desc: 'Action immédiate requise', icon: AlertTriangle },
  high:     { label: 'Critique', color: '#ef4444', desc: 'Action immédiate requise', icon: AlertTriangle },
  major:    { label: 'Majeure',  color: '#f97316', desc: 'À traiter sous 48h',       icon: AlertCircle },
  medium:   { label: 'Majeure',  color: '#f97316', desc: 'À traiter sous 48h',       icon: AlertCircle },
  minor:    { label: 'Mineure',  color: '#eab308', desc: 'Surveillance recommandée', icon: Info },
  low:      { label: 'Mineure',  color: '#eab308', desc: 'Surveillance recommandée', icon: Info },
}

interface KpiCardDef {
  key: string
  field: 'rendement_primaire' | 'rendement_hc' | 'age_recolte_primaire' | 'age_recolte_hc' | 'stock_lignes_primaire' | 'stock_lignes_hc'
  label: string
  base: 'Primaire' | 'HC'
  icon: typeof TrendingUp
}

const KPI_CARDS: KpiCardDef[] = [
  { key: 'rp',  field: 'rendement_primaire',     label: 'Rendement Primaire',     base: 'Primaire', icon: TrendingUp },
  { key: 'rh',  field: 'rendement_hc',           label: 'Rendement HC',           base: 'HC',       icon: TrendingUp },
  { key: 'ap',  field: 'age_recolte_primaire',   label: 'Âge Récolte Primaire',   base: 'Primaire', icon: Clock },
  { key: 'ah',  field: 'age_recolte_hc',         label: 'Âge Récolte HC',         base: 'HC',       icon: Clock },
  { key: 'sp',  field: 'stock_lignes_primaire',   label: 'Stock Lignes Primaire',  base: 'Primaire', icon: Layers },
  { key: 'sh',  field: 'stock_lignes_hc',         label: 'Stock Lignes HC',        base: 'HC',       icon: Layers },
]

/* ───────────────────── hooks ───────────────────── */

function useCountUp(target: number, duration = 800): number {
  const [value, setValue] = useState(0)
  const prev = useRef(0)
  useEffect(() => {
    const start = prev.current
    const diff = target - start
    if (Math.abs(diff) < 0.01) { setValue(target); prev.current = target; return }
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(start + diff * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else prev.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

/* ───────────────────── helpers ───────────────────── */

type ChartRow = Record<string, number | string>

function transformLineData(data: ChartDataPoint[] | undefined) {
  if (!data || data.length === 0) return { rows: [] as ChartRow[], parcs: [] as string[] }
  const byYear = new Map<number, ChartRow>()
  const parcs = new Set<string>()
  for (const d of data) {
    parcs.add(d.parc)
    if (!byYear.has(d.annee)) byYear.set(d.annee, { annee: d.annee })
    byYear.get(d.annee)![d.parc] = d.valeur
  }
  return {
    rows: Array.from(byYear.values()).sort((a, b) => (a.annee as number) - (b.annee as number)),
    parcs: Array.from(parcs),
  }
}

function parcColor(parc: string, allParcs: string[]): string {
  const idx = allParcs.indexOf(parc)
  return PARC_COLORS[idx >= 0 ? idx % PARC_COLORS.length : 0] ?? '#0D9488'
}

function fmtAxis(v: number, unit: string): string {
  if (unit === 'lignes' || unit === 'ligne') return v.toLocaleString('fr-FR')
  if (unit === 'mois') return `${v.toLocaleString('fr-FR')} mois`
  return `${v.toLocaleString('fr-FR')} Kg`
}

function exportToCsv(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return
  const first = data[0]
  if (!first) return
  const headers = Object.keys(first)
  const csv = [
    headers.join(','),
    ...data.map(row => headers.map(h => String(row[h] ?? '')).join(',')),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return "à l'instant"
  const mins = Math.floor(diff / 60)
  if (mins < 60) return `il y a ${mins} min`
  return `il y a ${Math.floor(mins / 60)}h`
}

/* ───────────────────── sub-components ───────────────────── */

const containerVariants = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }
const cardVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: 'easeOut' as const } },
}

function KpiCard({ kpi, def, isFetching }: { kpi: KpiIndicator | undefined; def: KpiCardDef; isFetching: boolean }) {
  const Icon = def.icon
  const animated = useCountUp(kpi?.value ?? 0, 900)
  const isPrimaire = def.base === 'Primaire'

  return (
    <motion.div
      variants={cardVariants}
      whileHover={{ scale: 1.02, boxShadow: '0 12px 40px rgba(0,180,216,0.15)' }}
      className={cn(styles.statCard, 'relative overflow-hidden')}
    >
      {isFetching && <div className={cn(styles.skeleton, 'absolute inset-0 z-10 opacity-30')} />}
      <div className="flex items-center justify-between mb-3">
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', isPrimaire ? 'bg-teal-500/10 text-teal-400' : 'bg-blue-500/10 text-blue-400')}>
          <Icon size={18} />
        </div>
        <span className={cn(styles.baseBadge, isPrimaire ? styles.basePrimaire : styles.baseHC)}>
          {def.base}
        </span>
      </div>
      <p className="text-xs text-slate-400 mb-1">{def.label}</p>
      <div className="flex items-baseline gap-1">
        <span className={styles.statValue}>
          {kpi ? animated.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : '—'}
        </span>
        <span className="text-sm text-slate-400">{kpi?.unit}</span>
      </div>
      <div className="flex items-center mt-2">
        <TrendBadge trend={kpi?.trend ?? 0} direction={(kpi?.trend_direction ?? 'stable') as 'up' | 'down' | 'stable'} />
        <span className="text-[0.65rem] text-slate-500 ml-1">vs année précédente</span>
      </div>
    </motion.div>
  )
}

function TrendBadge({ trend, direction }: { trend: number; direction: 'up' | 'down' | 'stable' }) {
  if (direction === 'up')
    return <span className="text-emerald-400 flex items-center text-xs font-medium"><TrendingUp size={13} className="mr-0.5" />+{trend.toFixed(1)}%</span>
  if (direction === 'down')
    return <span className="text-rose-400 flex items-center text-xs font-medium"><TrendingDown size={13} className="mr-0.5" />{trend.toFixed(1)}%</span>
  return <span className="text-slate-500 flex items-center text-xs"><Minus size={13} className="mr-0.5" />Stable</span>
}

interface ChartTooltipProps {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
  unit?: string
}

function ChartTooltip({ active, payload, label, unit = '' }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-900/95 border border-slate-700 rounded-xl p-3 shadow-2xl text-xs">
      <p className="text-slate-300 font-medium mb-1">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-400">{p.name}:</span>
          <span className="text-white font-medium">{p.value?.toLocaleString('fr-FR')} {unit}</span>
        </div>
      ))}
    </div>
  )
}

function ChartCardWrap({
  title, subtitle, children, onExport, onFullscreen, isFetching, isEmpty,
}: {
  title: string; subtitle: string; children: React.ReactNode
  onExport: () => void; onFullscreen: () => void
  isFetching: boolean; isEmpty: boolean
}) {
  return (
    <motion.div
      className={styles.glassCard}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2>{title}</h2>
          <p className={styles.glassCardSubtitle}>{subtitle}</p>
        </div>
        <div className="flex gap-1.5">
          <button type="button" className={styles.iconBtn} onClick={onExport} title="Exporter CSV"><Download size={14} /></button>
          <button type="button" className={styles.iconBtn} onClick={onFullscreen} title="Plein écran"><Maximize2 size={14} /></button>
        </div>
      </div>
      {isFetching && <div className={cn(styles.skeleton, 'h-[320px] mb-2')} />}
      {!isFetching && isEmpty && (
        <div className="h-[320px] flex flex-col items-center justify-center text-slate-500">
          <Waves size={36} className="mb-2 opacity-40" />
          <p className="text-sm">Aucune donnée pour les filtres sélectionnés</p>
        </div>
      )}
      {!isFetching && !isEmpty && children}
    </motion.div>
  )
}

function FullscreenModal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 bg-black/60 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="fixed inset-6 z-50 bg-slate-900 border border-slate-700 rounded-2xl p-6 overflow-auto"
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.25 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{title}</h2>
              <button type="button" onClick={onClose} className={styles.iconBtn}><X size={16} /></button>
            </div>
            <div className="h-[500px]">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function SeverityCard({ severity, count }: { severity: 'critical' | 'major' | 'minor'; count: number }) {
  const config = SEVERITY_CONFIG[severity]
  const Icon = config?.icon ?? Info
  return (
    <div className={cn(styles.severityCard, styles[`severity${severity}`])}>
      <div className={styles.severityIcon}><Icon size={24} strokeWidth={2} /></div>
      <div className={styles.severityContent}>
        <p className={styles.severityCount}>{count}</p>
        <h3>{config?.label ?? severity}</h3>
        <p className={styles.severityDesc}>{config?.desc ?? ''}</p>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className={styles.emptyStateWrap}>
      <svg width="120" height="80" viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 55 Q30 35 50 55 Q70 75 90 55 Q110 35 120 50" stroke="#0D9488" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.6" />
        <path d="M0 60 Q20 45 40 60 Q60 75 80 60 Q100 45 120 55" stroke="#2dd4bf" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.35" />
        <path d="M5 65 Q25 52 45 65 Q65 78 85 65 Q105 52 115 62" stroke="#14b8a6" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.2" />
      </svg>
      <h2>Aucune donnée Estran disponible</h2>
      <p>Importez un fichier Excel pour commencer à visualiser les données de production.</p>
      <button
        type="button"
        className={cn(styles.btn, 'mt-6')}
        onClick={() => { document.querySelector<HTMLButtonElement>('[data-import-trigger]')?.click() }}
      >
        Importer des données
      </button>
    </div>
  )
}

/* ───────────────────── main page ───────────────────── */

export default function EstranPage() {
  // Filter state
  const [baseFilter, setBaseFilter] = useState<string>('Les deux')
  const [parcFilter, setParcFilter] = useState<string>('')
  const [anneeFilter, setAnneeFilter] = useState<string>('')
  const [anomalyMethod, setAnomalyMethod] = useState('isolation_forest')
  const [fullscreen, setFullscreen] = useState<string | null>(null)

  const closeFullscreen = useCallback(() => setFullscreen(null), [])

  const hasActiveFilter = baseFilter !== 'Les deux' || parcFilter !== '' || anneeFilter !== ''
  const resetFilters = () => { setBaseFilter('Les deux'); setParcFilter(''); setAnneeFilter('') }

  // API param conversion
  const apiParc = parcFilter || undefined
  const apiAnnee = anneeFilter ? parseInt(anneeFilter, 10) : undefined
  const toApiBase = (b: string) => (b === 'Les deux' ? undefined : b === 'HC' ? 'HC' : 'Primaire')
  const apiBase = toApiBase(baseFilter)

  /* ── queries ── */

  const sheetsQ = useQuery({ queryKey: ['estran', 'sheets'], queryFn: () => api.getEstranSheets() })
  const filtersQ = useQuery({ queryKey: ['estran', 'filters'], queryFn: () => api.getEstranFilters() })

  const kpiQ = useQuery({
    queryKey: ['estran', 'kpi', apiParc, apiAnnee, apiBase],
    queryFn: () => api.getEstranKpis({ parc: apiParc, annee: apiAnnee, base: apiBase }),
    placeholderData: keepPreviousData,
  })

  const rendQ = useQuery({
    queryKey: ['estran', 'c-rend', apiParc, apiAnnee, apiBase],
    queryFn: () => api.getEstranChartRendement({ parc: apiParc, annee: apiAnnee, base: apiBase }),
    placeholderData: keepPreviousData,
  })

  const ageQ = useQuery({
    queryKey: ['estran', 'c-age', apiParc, apiAnnee, apiBase],
    queryFn: () => api.getEstranChartAge({ parc: apiParc, annee: apiAnnee, base: apiBase }),
    placeholderData: keepPreviousData,
  })

  const stockQ = useQuery({
    queryKey: ['estran', 'c-stock', apiParc, apiAnnee, apiBase],
    queryFn: () => api.getEstranChartStockLignes({ parc: apiParc, annee: apiAnnee, base: apiBase }),
    placeholderData: keepPreviousData,
  })

  const ageSejourQ = useQuery({
    queryKey: ['estran', 'c-age-sejour', apiParc, apiBase],
    queryFn: () => api.getEstranChartStockAge({ parc: apiParc, base: apiBase }),
    placeholderData: keepPreviousData,
  })

  // Bonus chart: Primaire vs HC rendement
  const rendPrimQ = useQuery({
    queryKey: ['estran', 'c-rend-prim', apiParc, apiAnnee],
    queryFn: () => api.getEstranChartRendement({ parc: apiParc, annee: apiAnnee, base: 'Primaire' }),
    placeholderData: keepPreviousData,
  })
  const rendHcQ = useQuery({
    queryKey: ['estran', 'c-rend-hc', apiParc, apiAnnee],
    queryFn: () => api.getEstranChartRendement({ parc: apiParc, annee: apiAnnee, base: 'HC' }),
    placeholderData: keepPreviousData,
  })

  const anomQ = useQuery({
    queryKey: ['estran', 'anomalies', anomalyMethod, apiBase],
    queryFn: () => api.getEstranAnomalies({ limit: 500, method: anomalyMethod, sheet: apiBase }),
    placeholderData: keepPreviousData,
  })

  /* ── data transforms ── */

  const rendChart = useMemo(() => transformLineData(rendQ.data), [rendQ.data])
  const ageChart  = useMemo(() => transformLineData(ageQ.data), [ageQ.data])
  const stockChart = useMemo(() => transformLineData(stockQ.data), [stockQ.data])

  const allParcs = useMemo(() => {
    const s = new Set<string>()
    rendChart.parcs.forEach(p => s.add(p))
    ageChart.parcs.forEach(p => s.add(p))
    stockChart.parcs.forEach(p => s.add(p))
    return Array.from(s)
  }, [rendChart.parcs, ageChart.parcs, stockChart.parcs])

  // Bonus composed chart: merge Prim/HC rendement by year
  const bonusChart = useMemo(() => {
    const prim = rendPrimQ.data ?? []
    const hc = rendHcQ.data ?? []
    const byYear = new Map<number, { annee: number; Primaire: number; HC: number; ratio: number | null }>()
    for (const d of prim) {
      if (!byYear.has(d.annee)) byYear.set(d.annee, { annee: d.annee, Primaire: 0, HC: 0, ratio: null })
      byYear.get(d.annee)!.Primaire += d.valeur
    }
    for (const d of hc) {
      if (!byYear.has(d.annee)) byYear.set(d.annee, { annee: d.annee, Primaire: 0, HC: 0, ratio: null })
      byYear.get(d.annee)!.HC += d.valeur
    }
    const rows = Array.from(byYear.values()).sort((a, b) => a.annee - b.annee)
    rows.forEach(r => { r.ratio = r.Primaire > 0 ? Math.round((r.HC / r.Primaire) * 100) : null })
    return rows
  }, [rendPrimQ.data, rendHcQ.data])

  // Anomaly set for chart dots
  const anomalyKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const a of (anomQ.data ?? [])) {
      if (a.parc_semi && a.year) keys.add(`${a.parc_semi}-${a.year}`)
    }
    return keys
  }, [anomQ.data])

  function getAnomalyDots(chartData: ChartDataPoint[] | undefined): { x: number; y: number }[] {
    if (!chartData) return []
    return chartData
      .filter(d => anomalyKeys.has(`${d.parc}-${d.annee}`))
      .map(d => ({ x: d.annee, y: d.valeur }))
  }

  const rendAnomalyDots = useMemo(() => getAnomalyDots(rendQ.data), [rendQ.data, anomalyKeys])

  // Quick stats
  const totalStock = (kpiQ.data?.stock_lignes_primaire?.value ?? 0) + (kpiQ.data?.stock_lignes_hc?.value ?? 0)
  const rendGlobal = kpiQ.data ? Math.round(((kpiQ.data.rendement_primaire?.value ?? 0) + (kpiQ.data.rendement_hc?.value ?? 0)) / 2) : 0

  // Anomaly counts
  const anomalyList = anomQ.data ?? []
  const criticalCount = anomalyList.filter(a => a.severity === 'critical' || a.severity === 'high').length
  const majorCount = anomalyList.filter(a => a.severity === 'major' || a.severity === 'medium').length
  const minorCount = anomalyList.filter(a => a.severity === 'minor' || a.severity === 'low').length

  // Empty state check
  const totalRecords = sheetsQ.data?.reduce((s: number, sh: EstranSheetInfo) => s + sh.count, 0) ?? 0
  const isCompletelyEmpty = !sheetsQ.isLoading && totalRecords === 0

  const isAnyError = kpiQ.isError || rendQ.isError || ageQ.isError || stockQ.isError

  /* ── render helper: chart with anomaly dots ── */
  function renderRendementChart(height: number) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rendChart.rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
          <XAxis dataKey="annee" stroke="#64748b" tick={{ fontSize: 11 }} />
          <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={v => fmtAxis(v, 'kg')} />
          <RTooltip content={<ChartTooltip unit="Kg" />} />
          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
          {rendChart.parcs.map((p) => (
            <Line key={p} dataKey={p} type="monotone" stroke={parcColor(p, allParcs)} strokeWidth={2}
              dot={{ r: 3 }} isAnimationActive animationDuration={800} animationEasing="ease-out" />
          ))}
          {rendAnomalyDots.map((dot, i) => (
            <ReferenceDot key={`a${i}`} x={dot.x} y={dot.y} r={6} fill="#ef4444" stroke="#fff" strokeWidth={2} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    )
  }

  function renderAgeChart(height: number) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={ageChart.rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
          <XAxis dataKey="annee" stroke="#64748b" tick={{ fontSize: 11 }} />
          <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={v => fmtAxis(v, 'mois')} />
          <RTooltip content={<ChartTooltip unit="mois" />} />
          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
          {ageChart.parcs.map((p) => (
            <Line key={p} dataKey={p} type="monotone" stroke={parcColor(p, allParcs)} strokeWidth={2}
              strokeDasharray="5 5" dot={{ r: 3 }} isAnimationActive animationDuration={800} animationEasing="ease-out" />
          ))}
        </LineChart>
      </ResponsiveContainer>
    )
  }

  function renderStockChart(height: number) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={stockChart.rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
          <XAxis dataKey="annee" stroke="#64748b" tick={{ fontSize: 11 }} />
          <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
          <RTooltip content={<ChartTooltip unit="lignes" />} />
          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
          {stockChart.parcs.map((p) => (
            <Bar key={p} dataKey={p} fill={parcColor(p, allParcs)} radius={[4, 4, 0, 0]}
              isAnimationActive animationDuration={800} animationEasing="ease-out" />
          ))}
        </BarChart>
      </ResponsiveContainer>
    )
  }

  function renderAgeSejourChart(height: number) {
    const data = ageSejourQ.data ?? []
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
          <XAxis dataKey="tranche" stroke="#64748b" tick={{ fontSize: 11 }} />
          <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
          <RTooltip content={<ChartTooltip unit="lignes" />} />
          <Bar dataKey="lignes" name="Lignes" isAnimationActive animationDuration={800} animationEasing="ease-out"
            radius={[4, 4, 0, 0]} fill="#0D9488" label={{ position: 'top', fontSize: 10, fill: '#94a3b8' }} />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  function renderBonusChart(height: number) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={bonusChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
          <XAxis dataKey="annee" stroke="#64748b" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="left" stroke="#64748b" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="right" orientation="right" stroke="#64748b" tick={{ fontSize: 11 }} unit="%" />
          <RTooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
          <Bar yAxisId="left" dataKey="Primaire" name="Primaire" fill="#0D9488" radius={[4, 4, 0, 0]}
            isAnimationActive animationDuration={800} />
          <Bar yAxisId="left" dataKey="HC" name="Hors Calibre" fill="#1E3A5F" radius={[4, 4, 0, 0]}
            isAnimationActive animationDuration={800} />
          <Line yAxisId="right" dataKey="ratio" name="Ratio HC/Prim %" type="monotone"
            stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} isAnimationActive animationDuration={800} />
        </ComposedChart>
      </ResponsiveContainer>
    )
  }

  /* ── empty state ── */
  if (isCompletelyEmpty) return <div className={styles.page}><EmptyState /></div>

  return (
    <div className={styles.page}>
      {/* ══════ SECTION 1 — HEADER ══════ */}
      <motion.header
        className={cn(styles.header, 'items-center')}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div>
          <h1>Tableau de bord Estran</h1>
          <p className={styles.subtitle}>Production · Rendement · Stock</p>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <p className="text-[0.68rem] text-slate-500 uppercase tracking-wider">Lignes en stock</p>
            <p className="text-lg font-bold text-teal-400">{totalStock.toLocaleString('fr-FR')}</p>
          </div>
          <div className="w-px h-8 bg-slate-700" />
          <div className="text-right">
            <p className="text-[0.68rem] text-slate-500 uppercase tracking-wider">Rendement moy.</p>
            <p className="text-lg font-bold text-teal-400">{rendGlobal.toLocaleString('fr-FR')} Kg</p>
          </div>
          <div className="w-px h-8 bg-slate-700" />
          <div className="text-right">
            <p className="text-[0.68rem] text-slate-500 uppercase tracking-wider">Mise à jour</p>
            <p className="text-xs text-slate-400">{kpiQ.dataUpdatedAt ? timeAgo(kpiQ.dataUpdatedAt) : '—'}</p>
          </div>
        </div>
      </motion.header>

      {/* ══════ SECTION 2 — STICKY FILTER BAR ══════ */}
      <div className={styles.filterBar}>
        {/* Base toggle pills */}
        <div className={styles.pillGroup}>
          {(['Primaire', 'HC', 'Les deux'] as const).map(b => (
            <button
              key={b}
              type="button"
              className={cn(styles.pillBtn, baseFilter === b && styles.pillBtnActive)}
              onClick={() => setBaseFilter(b)}
            >
              {b === 'Les deux' ? 'Les deux' : b}
            </button>
          ))}
        </div>

        {/* Parc selector */}
        <select
          className={styles.sheetSelect}
          value={parcFilter}
          onChange={e => setParcFilter(e.target.value)}
        >
          <option value="">Tous les parcs</option>
          {filtersQ.data?.parcs.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        {/* Année selector */}
        <select
          className={styles.sheetSelect}
          value={anneeFilter}
          onChange={e => setAnneeFilter(e.target.value)}
        >
          <option value="">Toutes les années</option>
          {filtersQ.data?.annees.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        {/* Reset */}
        {hasActiveFilter && (
          <motion.button
            type="button"
            className={styles.resetBtn}
            onClick={resetFilters}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          >
            <RotateCcw size={12} /> Réinitialiser
          </motion.button>
        )}
      </div>

      {/* Last sync */}
      <p className={styles.syncText}>
        Données au {new Date().toLocaleDateString('fr-FR')} · {kpiQ.dataUpdatedAt ? `Mis à jour ${timeAgo(kpiQ.dataUpdatedAt)}` : 'Chargement…'}
      </p>

      {/* Error banner */}
      {isAnyError && (
        <div className={styles.errorBanner}>
          <AlertTriangle size={18} />
          <span>Erreur de chargement des données</span>
          <button type="button" className={cn(styles.btn, 'ml-auto text-xs py-1 px-3')} onClick={() => { kpiQ.refetch(); rendQ.refetch(); ageQ.refetch(); stockQ.refetch() }}>
            Réessayer
          </button>
        </div>
      )}

      {/* ══════ SECTION 3 — KPI CARDS ══════ */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {KPI_CARDS.map(def => (
          <KpiCard
            key={def.key}
            def={def}
            kpi={kpiQ.data?.[def.field]}
            isFetching={kpiQ.isFetching && !kpiQ.data}
          />
        ))}
      </motion.div>

      {/* ══════ SECTION 4 — CHARTS ══════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Chart 1: Rendement */}
        <ChartCardWrap
          title="Évolution du Rendement"
          subtitle="Moyenne par parc · filtrable Primaire / HC"
          isFetching={rendQ.isLoading}
          isEmpty={rendChart.rows.length === 0}
          onExport={() => exportToCsv(rendQ.data?.map(d => ({ annee: d.annee, parc: d.parc, rendement: d.valeur })) ?? [], `estran_rendement_${apiBase ?? 'all'}_${apiAnnee ?? 'all'}.csv`)}
          onFullscreen={() => setFullscreen('rendement')}
        >
          {renderRendementChart(320)}
        </ChartCardWrap>

        {/* Chart 2: Âge Récolte */}
        <ChartCardWrap
          title="Âge Moyen à la Récolte"
          subtitle="En mois · par parc et par année"
          isFetching={ageQ.isLoading}
          isEmpty={ageChart.rows.length === 0}
          onExport={() => exportToCsv(ageQ.data?.map(d => ({ annee: d.annee, parc: d.parc, age_mois: d.valeur })) ?? [], `estran_age_recolte_${apiAnnee ?? 'all'}.csv`)}
          onFullscreen={() => setFullscreen('age')}
        >
          {renderAgeChart(320)}
        </ChartCardWrap>

        {/* Chart 3: Stock Lignes */}
        <ChartCardWrap
          title="Stock de Lignes Non Récoltées"
          subtitle="Nombre de lignes en attente · par parc"
          isFetching={stockQ.isLoading}
          isEmpty={stockChart.rows.length === 0}
          onExport={() => exportToCsv(stockQ.data?.map(d => ({ annee: d.annee, parc: d.parc, lignes: d.valeur })) ?? [], `estran_stock_lignes_${apiAnnee ?? 'all'}.csv`)}
          onFullscreen={() => setFullscreen('stock')}
        >
          {renderStockChart(320)}
        </ChartCardWrap>

        {/* Chart 4: Stock par Âge de Séjour */}
        <ChartCardWrap
          title="Lignes par Âge de Séjour dans l'Estran"
          subtitle="Répartition du stock selon l'ancienneté"
          isFetching={ageSejourQ.isLoading}
          isEmpty={(ageSejourQ.data ?? []).every(d => d.lignes === 0)}
          onExport={() => exportToCsv((ageSejourQ.data ?? []).map(d => ({ tranche: d.tranche, lignes: d.lignes })), 'estran_stock_age_sejour.csv')}
          onFullscreen={() => setFullscreen('age-sejour')}
        >
          {renderAgeSejourChart(320)}
        </ChartCardWrap>
      </div>

      {/* Chart 5: Bonus — Primaire vs HC */}
      <div className="mb-10">
        <ChartCardWrap
          title="Comparaison Primaire vs Hors Calibre"
          subtitle="Rendement et stock côte à côte"
          isFetching={rendPrimQ.isLoading || rendHcQ.isLoading}
          isEmpty={bonusChart.length === 0}
          onExport={() => exportToCsv(bonusChart.map(d => ({ annee: d.annee, primaire: d.Primaire, hc: d.HC, ratio_pct: d.ratio })), 'estran_primaire_vs_hc.csv')}
          onFullscreen={() => setFullscreen('bonus')}
        >
          {renderBonusChart(320)}
        </ChartCardWrap>
      </div>

      {/* ══════ ANOMALIES SECTION ══════ */}
      <div className="mt-12 pt-8 border-t border-slate-800">
        <h1 className="text-xl font-semibold text-slate-200 mb-6">Détection des anomalies</h1>

        <div className="flex justify-end gap-3 mb-6">
          <select className={styles.methodSelect} value={anomalyMethod} onChange={e => setAnomalyMethod(e.target.value)}>
            <option value="isolation_forest">Isolation Forest</option>
            <option value="lof">LOF</option>
            <option value="one_class_svm">One-Class SVM</option>
            <option value="zscore">Z-Score</option>
          </select>
          <button type="button" className={styles.btn} onClick={() => anomQ.refetch()} disabled={anomQ.isFetching}>
            {anomQ.isFetching ? 'Analyse…' : 'Actualiser'}
          </button>
        </div>

        <section className={styles.summaryRow}>
          <SeverityCard severity="critical" count={criticalCount} />
          <SeverityCard severity="major" count={majorCount} />
          <SeverityCard severity="minor" count={minorCount} />
        </section>

        {anomQ.isFetching ? (
          <div className={styles.loadingState}>
            <Waves className={styles.loadingIcon} />
            <p>Calcul des anomalies en cours…</p>
          </div>
        ) : (
          anomalyList.length > 0 && (
            <div className={cn(styles.tablePanel, 'mt-4')}>
              <h2>Liste des anomalies détectées</h2>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>ID</th><th>Type</th><th>Entité</th><th>Description</th><th>Biomasse (GR)</th><th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anomalyList.map((a: EstranAnomalyRecord) => {
                      const rowClass = ['critical', 'high'].includes(a.severity) ? styles.rowcritical
                        : ['major', 'medium'].includes(a.severity) ? styles.rowmajor : styles.rowminor
                      return (
                        <tr key={a.id} className={rowClass}>
                          <td className={styles.mono}>AN-{String(a.id).padStart(3, '0')}</td>
                          <td>
                            <span className={cn(styles.severityBadge, styles[`badge${a.severity}`] || '')}>
                              {SEVERITY_CONFIG[a.severity]?.label ?? a.severity}
                            </span>
                          </td>
                          <td>{a.parc_semi ?? a.parc_an ?? '-'}</td>
                          <td className={styles.descCell}>{a.reason ?? a.explanation ?? `Écart détecté sur parc ${a.parc_semi ?? '-'}`}</td>
                          <td className={styles.numCell}>{a.biomasse_gr != null ? a.biomasse_gr.toLocaleString('fr-FR') : '-'}</td>
                          <td>{a.date_recolte ? new Date(a.date_recolte).toLocaleDateString('fr-FR') : a.year && a.month ? `${String(a.month).padStart(2, '0')}/${a.year}` : '-'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}
      </div>

      {/* ══════ FULLSCREEN MODALS ══════ */}
      <FullscreenModal open={fullscreen === 'rendement'} onClose={closeFullscreen} title="Évolution du Rendement">
        {renderRendementChart(500)}
      </FullscreenModal>
      <FullscreenModal open={fullscreen === 'age'} onClose={closeFullscreen} title="Âge Moyen à la Récolte">
        {renderAgeChart(500)}
      </FullscreenModal>
      <FullscreenModal open={fullscreen === 'stock'} onClose={closeFullscreen} title="Stock de Lignes Non Récoltées">
        {renderStockChart(500)}
      </FullscreenModal>
      <FullscreenModal open={fullscreen === 'age-sejour'} onClose={closeFullscreen} title="Lignes par Âge de Séjour">
        {renderAgeSejourChart(500)}
      </FullscreenModal>
      <FullscreenModal open={fullscreen === 'bonus'} onClose={closeFullscreen} title="Comparaison Primaire vs HC">
        {renderBonusChart(500)}
      </FullscreenModal>
    </div>
  )
}
