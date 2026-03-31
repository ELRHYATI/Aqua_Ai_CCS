import { useState, useMemo, useCallback, useEffect, useRef, type ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { useQuery, useQueries, keepPreviousData } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, LabelList,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  AlertTriangle,
  X, Maximize2, Download, RotateCcw, BarChart3, BarChart2,
  Database, ChevronDown, ArrowUp, ArrowDown, Search, Columns3,
} from 'lucide-react'
import { api } from '../services/apiClient'
import type {
  EstranSheetInfo,
  KpiChartResponse, KpiChartPeriod, EstranChartParams,
  EstranDbRow,
  EstranProductionKpiItem,
} from '../services/apiClient'
import styles from './EstranPage.module.css'
import { cn } from '../lib/utils'

/* ───────────────────── constants ───────────────────── */

const SERIES_COLORS = [
  '#0D9488',
  '#1E3A5F',
  '#F59E0B',
  '#8B5CF6',
  '#EF4444',
  '#10B981',
  '#F97316',
  '#06B6D4',
] as const

type XAxis_ = 'annee' | 'mois' | 'annee_mois'
type GroupBy_ = 'parc' | 'residence_estran' | 'origine_recolte' | 'none'
type Periode_ = 'cette_annee' | '12_mois' | '2_ans' | 'tout' | 'custom'
type ChartType_ = 'line' | 'bar' | 'area' | 'composed'

const X_AXIS_OPTIONS: { value: XAxis_; label: string }[] = [
  { value: 'annee', label: 'Année' },
  { value: 'mois', label: 'Mois' },
  { value: 'annee_mois', label: 'Année + Mois' },
]

const GROUP_BY_OPTIONS: { value: GroupBy_; label: string }[] = [
  { value: 'parc', label: 'Parc' },
  { value: 'residence_estran', label: 'Résidence Estran' },
  { value: 'origine_recolte', label: 'Origine Récolte' },
  { value: 'none', label: 'Global' },
]

const PERIODE_OPTIONS: { value: Periode_; label: string }[] = [
  { value: 'cette_annee', label: 'Cette année' },
  { value: '12_mois', label: '12 derniers mois' },
  { value: '2_ans', label: '2 ans' },
  { value: 'tout', label: 'Tout' },
  { value: 'custom', label: 'Personnalisée' },
]

const XAXIS_LABELS: Record<XAxis_, string> = { annee: 'Année', mois: 'Mois', annee_mois: 'Année + Mois' }
const GROUPBY_LABELS: Record<GroupBy_, string> = { parc: 'Parc', residence_estran: 'Résidence', origine_recolte: 'Origine', none: 'Global' }
const PERIODE_LABELS: Record<Periode_, string> = { cette_annee: 'Cette année', '12_mois': '12 mois', '2_ans': '2 ans', tout: 'Tout', custom: 'Perso.' }

const PRIMAIRE_KPI_CALC_KEYS = [
  'recapture_prim',
  'vendable_ligne_prim',
  'poids_moyen_prim',
  'nb_ligne_prim',
] as const

const HC_KPI_CALC_KEYS = [
  'recapture_hc',
  'biomasse_recuperee_hc',
  'vendable_ligne_hc',
  'poids_moyen_hc',
  'nb_ligne_hc',
] as const

interface ChartDef {
  slug: string
  title: string
  formula: string
  unit: string
  defaultType: ChartType_
  primaryColor: string
  fullWidth: boolean
  supportsOrigine: boolean
  hasReferenceLine: boolean
}

interface RechartsRow extends Record<string, string | number | null> {
  period: string
}

interface OrigineFilterState {
  enabled: boolean
  value: string
}

const PRIMAIRE_CHARTS: ChartDef[] = [
  {
    slug: 'recapture-primaire',
    title: '% de Recapture Primaire',
    formula: 'SUM(Effectif total) / SUM(Effectif semé) × 100',
    unit: '%',
    defaultType: 'line',
    primaryColor: '#0D9488',
    fullWidth: false,
    supportsOrigine: false,
    hasReferenceLine: true,
  },
  {
    slug: 'vendable-ligne-primaire',
    title: 'Vendable / Ligne Primaire',
    formula: 'SUM(V(kg)×200/L(m)) / SUM(Nb lignes) · repli si besoin: kg/200m importé',
    unit: 'Kg/ligne',
    defaultType: 'area',
    primaryColor: '#0D9488',
    fullWidth: false,
    supportsOrigine: false,
    hasReferenceLine: false,
  },
  {
    slug: 'poids-moyen-primaire',
    title: 'Poids Moyen Primaire',
    formula: 'AVG(PM TOT g)',
    unit: 'g',
    defaultType: 'line',
    primaryColor: '#8B5CF6',
    fullWidth: false,
    supportsOrigine: false,
    hasReferenceLine: false,
  },
  {
    slug: 'stock-lignes-primaire',
    title: 'Nombre de Lignes Primaire',
    formula: 'SUM(Nb ligne semé 200m) WHERE date_recolte IS NULL',
    unit: 'lignes',
    defaultType: 'bar',
    primaryColor: '#F97316',
    fullWidth: false,
    supportsOrigine: false,
    hasReferenceLine: false,
  },
]

const HC_CHARTS: ChartDef[] = [
  {
    slug: 'recapture-hc',
    title: '% de Recapture HC',
    formula: 'SUM(Effectif total) / SUM(Effectif semé) × 100',
    unit: '%',
    defaultType: 'line',
    primaryColor: '#0D9488',
    fullWidth: false,
    supportsOrigine: true,
    hasReferenceLine: true,
  },
  {
    slug: 'biomasse-recuperee',
    title: '% de Biomasse Récupérée',
    formula: 'SUM(Total récolté kg) / SUM(HC Ressemé kg) × 100',
    unit: '%',
    defaultType: 'area',
    primaryColor: '#1E3A5F',
    fullWidth: false,
    supportsOrigine: false,
    hasReferenceLine: true,
  },
  {
    slug: 'vendable-ligne-hc',
    title: 'Vendable par Ligne HC',
    formula: 'SUM(V(kg)×200/L(m)) / SUM(Nb lignes) · repli si besoin: kg/200m importé',
    unit: 'Kg/ligne',
    defaultType: 'composed',
    primaryColor: '#8B5CF6',
    fullWidth: false,
    supportsOrigine: true,
    hasReferenceLine: false,
  },
  {
    slug: 'poids-moyen-hc',
    title: 'Poids Moyen HC',
    formula: 'AVG(PM Total)',
    unit: 'g',
    defaultType: 'line',
    primaryColor: '#10B981',
    fullWidth: false,
    supportsOrigine: true,
    hasReferenceLine: false,
  },
  {
    slug: 'stock-lignes-hc',
    title: 'Nombre de Lignes HC',
    formula: 'SUM(Nb ligne semé 200m) WHERE date_recolte IS NULL',
    unit: 'lignes',
    defaultType: 'bar',
    primaryColor: '#1E3A5F',
    fullWidth: true,
    supportsOrigine: true,
    hasReferenceLine: false,
  },
]

/* ───────────────────── helpers ───────────────────── */

function seriesColor(groupName: string, groupColorMap: Record<string, string>): string {
  return groupColorMap[groupName] ?? SERIES_COLORS[0]
}

function toChartNumber(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number' && !Number.isNaN(v)) return v
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function transformForRecharts(data: KpiChartPeriod[], groups: string[]): RechartsRow[] {
  return data.map(p => {
    const row: RechartsRow = { period: p.period }
    for (const g of groups) {
      const found = p.groups.find(x => x.name === g)
      row[g] = toChartNumber(found?.value)
    }
    return row
  })
}

function exportChartCsv(def: ChartDef, rows: RechartsRow[], groups: string[]): void {
  if (!rows.length) return
  const headers = ['Période', ...groups]
  const lines = rows.map(r => [r.period, ...groups.map(g => r[g] ?? '')].join(','))
  const csv = [headers.join(','), ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `estran_${def.slug}_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function addMovingAverage(rows: RechartsRow[], groups: string[]): RechartsRow[] {
  return rows.map((row, i) => {
    const maRow: RechartsRow = { ...row }
    for (const g of groups) {
      const prev = rows[i - 1]?.[g]
      const next = rows[i + 1]?.[g]
      const curr = row[g]
      const p = typeof prev === 'number' ? prev : typeof curr === 'number' ? curr : 0
      const c = typeof curr === 'number' ? curr : 0
      const n = typeof next === 'number' ? next : typeof curr === 'number' ? curr : 0
      maRow[`${g}_ma`] = (p + c + n) / 3
    }
    return maRow
  })
}

function findChartDefBySlug(slug: string): ChartDef | undefined {
  return [...PRIMAIRE_CHARTS, ...HC_CHARTS].find(d => d.slug === slug)
}

function nextChartType(t: ChartType_, slug: string): ChartType_ {
  if (slug === 'vendable-ligne-hc') {
    if (t === 'line') return 'bar'
    if (t === 'bar') return 'area'
    if (t === 'area') return 'composed'
    return 'line'
  }
  const u: ChartType_ = t === 'composed' ? 'line' : t
  if (u === 'line') return 'bar'
  if (u === 'bar') return 'area'
  return 'line'
}

function buildHcChartParams(
  base: EstranChartParams,
  slug: string,
  origineFilters: Record<string, OrigineFilterState>,
): EstranChartParams {
  const st = origineFilters[slug] ?? { enabled: false, value: '' }
  if (st.enabled && st.value) return { ...base, filtre2: st.value }
  return { ...base }
}

function formatProductionKpiValue(item: EstranProductionKpiItem): string {
  if (item.division_by_zero || item.value == null) return '—'
  const v = item.value
  if (item.unit === '%') return `${v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`
  if (item.unit === 'g') return `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} g`
  if (item.unit === 'kg/ligne') return `${v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kg/ligne`
  if (item.unit === 'ligne') return v.toLocaleString('fr-FR', { maximumFractionDigits: 0 })
  return `${v.toLocaleString('fr-FR')} ${item.unit}`
}

function KpiCalcCard({ item }: { item: EstranProductionKpiItem }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-700/80 bg-slate-900/50 p-4 flex flex-col min-h-[120px]',
        'shadow-sm',
      )}
    >
      <p className="text-xs font-medium text-slate-400 leading-snug">{item.label}</p>
      <p className={cn('text-2xl font-bold tabular-nums mt-2', 'text-slate-100')}>
        {formatProductionKpiValue(item)}
      </p>
      {item.division_by_zero && (
        <p className="text-[10px] text-amber-400/90 mt-1">Division par zéro</p>
      )}
      <p
        className="text-[11px] text-slate-500 mt-auto pt-3 leading-relaxed line-clamp-3"
        title={item.formula}
      >
        ƒ {item.formula}
      </p>
    </div>
  )
}

/* ───────────────────── sub-components ───────────────────── */

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

interface ChartFullscreenModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

function ChartFullscreenModal({ open, onClose, title, children }: ChartFullscreenModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/50 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="fixed inset-0 z-[51] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              className={cn(
                'pointer-events-auto w-[90vw] max-w-5xl bg-white rounded-2xl p-6 shadow-2xl',
                'text-gray-900',
              )}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.25 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                  aria-label="Fermer"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="h-[500px]">{children}</div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

function periodGroupSum(resp: KpiChartResponse | undefined, period: string): number {
  if (!resp) return 0
  const p = resp.data.find(x => x.period === period)
  if (!p) return 0
  return p.groups.reduce((s, g) => {
    const v = g.value
    return s + (typeof v === 'number' && !Number.isNaN(v) ? v : 0)
  }, 0)
}

function mergePrimaireHcStockRows(
  primaire: KpiChartResponse | undefined,
  hc: KpiChartResponse | undefined,
): RechartsRow[] {
  const order: string[] = []
  const seen = new Set<string>()
  for (const src of [primaire, hc]) {
    for (const d of src?.data ?? []) {
      if (!seen.has(d.period)) {
        seen.add(d.period)
        order.push(d.period)
      }
    }
  }
  return order.map(period => ({
    period,
    Primaire: periodGroupSum(primaire, period),
    HC: periodGroupSum(hc, period),
  }))
}

interface EstranTooltipProps {
  active?: boolean
  payload?: Array<{ name?: string; value?: number | string; color?: string }>
  label?: string
  unit?: string
}

function EstranTooltip({ active, payload, label, unit = '' }: EstranTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div
      className={cn(
        'bg-white border border-gray-200 rounded-xl',
        'shadow-lg p-3 text-sm min-w-[160px]',
      )}
    >
      <p className="font-semibold text-gray-700 border-b border-gray-200 pb-1 mb-2">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: entry.color ?? '#ccc' }} />
          <span className="text-gray-600 flex-1">{entry.name}</span>
          <span className="font-medium text-gray-900">
            {entry.value != null && entry.value !== '' && !Number.isNaN(Number(entry.value))
              ? Number(entry.value).toFixed(1)
              : '—'}{' '}
            {unit}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ───────────────────── ChartCard ───────────────────── */

function barTopLabel(v: unknown): string {
  if (typeof v === 'number' && !Number.isNaN(v)) return Math.round(v).toString()
  return ''
}

interface LegendPayloadEntry {
  value?: string
  color?: string
  id?: string
}

/** Recharts default legend grows without bound with many series and hides the plot; cap height + scroll. */
function ScrollableChartLegend({ payload }: { payload?: ReadonlyArray<LegendPayloadEntry> }) {
  if (!payload?.length) return null
  return (
    <div
      className={cn(
        'w-full flex flex-wrap gap-x-3 gap-y-1 justify-center',
        'max-h-[88px] overflow-y-auto overscroll-contain px-1',
        'text-[10px] text-slate-400',
      )}
    >
      {payload.map((e, i) => (
        <span
          key={e.id ?? `${String(e.value)}-${i}`}
          className="inline-flex items-center gap-1 shrink-0 max-w-[220px] truncate"
          title={e.value}
        >
          <span className="size-2 rounded-full shrink-0" style={{ background: e.color ?? '#94a3b8' }} />
          {e.value}
        </span>
      ))}
    </div>
  )
}

interface ChartCardProps {
  def: ChartDef
  base: 'Primaire' | 'HC'
  chartType: ChartType_
  onToggleType: () => void
  groupColorMap: Record<string, string>
  query: UseQueryResult<KpiChartResponse, Error>
  stockPrimaireQuery?: UseQueryResult<KpiChartResponse, Error>
  origines: string[]
  origineFilter: OrigineFilterState
  onOrigineFilterChange: (patch: Partial<OrigineFilterState>) => void
  layoutMotionIndex: number
  chartHeight: number
  fullscreenSlug: string | null
  onFullscreen: (slug: string) => void
  omitFullscreen?: boolean
  disableLayoutAnimation?: boolean
}

function ChartCard({
  def,
  base,
  chartType,
  onToggleType,
  groupColorMap,
  query,
  stockPrimaireQuery,
  origines,
  origineFilter,
  onOrigineFilterChange,
  layoutMotionIndex,
  chartHeight,
  fullscreenSlug,
  onFullscreen,
  omitFullscreen = false,
  disableLayoutAnimation = false,
}: ChartCardProps) {
  const isStockHc = def.slug === 'stock-lignes-hc'
  const resp = query.data
  const groups = resp?.groups_available ?? []
  const rows = useMemo(() => (resp ? transformForRecharts(resp.data, groups) : []), [resp, groups])
  const stackedRows = useMemo(
    () => mergePrimaireHcStockRows(stockPrimaireQuery?.data, resp),
    [stockPrimaireQuery?.data, resp],
  )
  const rowsWithMa = useMemo(
    () => (def.slug === 'vendable-ligne-hc' ? addMovingAverage(rows, groups) : rows),
    [def.slug, rows, groups],
  )

  const isEmpty = isStockHc
    ? !resp?.data?.length && !stockPrimaireQuery?.data?.data?.length
    : !resp || resp.data.length === 0

  const showSkeleton =
    (query.isFetching && !query.data) ||
    (isStockHc && stockPrimaireQuery?.isFetching && !stockPrimaireQuery?.data)

  const unit = def.unit
  const gradId = `grad_${def.slug}`

  const renderChart = useCallback(
    (height: number) => {
      const gridEl = <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
      const tooltipEl = <Tooltip content={<EstranTooltip unit={unit} />} />
      const manySeries = groups.length > 6
      const useScrollLegend = def.slug === 'vendable-ligne-hc' && manySeries
      const legendEl = useScrollLegend ? (
        <Legend
          content={(props: { payload?: ReadonlyArray<LegendPayloadEntry> }) => (
            <ScrollableChartLegend payload={props.payload} />
          )}
          wrapperStyle={{ position: 'relative', width: '100%', paddingTop: 4 }}
        />
      ) : (
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
      )
      const bottomPad = useScrollLegend ? 96 : 8
      const barMaxForGroups = Math.max(4, Math.min(22, Math.floor(48 / Math.max(1, Math.sqrt(groups.length)))))
      const xAxisEl = (
        <XAxis
          dataKey="period"
          tick={{ fontSize: 12, fill: '#6B7280' }}
          axisLine={false}
          tickLine={false}
        />
      )
      const yAxisEl = (
        <YAxis
          tick={{ fontSize: 12, fill: '#6B7280' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `${v} ${unit}`}
          domain={def.slug === 'vendable-ligne-hc' ? [0, 'auto'] : undefined}
        />
      )

      const ref100 =
        def.hasReferenceLine ? (
          <ReferenceLine
            y={100}
            stroke="#9CA3AF"
            strokeDasharray="4 4"
            label={{ value: '100%', position: 'insideTopRight', fontSize: 11, fill: '#9CA3AF' }}
          />
        ) : null

      const denseHcVendable = def.slug === 'vendable-ligne-hc' && groups.length > 10
      const anim = denseHcVendable
        ? { isAnimationActive: false as const }
        : { isAnimationActive: true, animationDuration: 800, animationEasing: 'ease-out' as const }

      if (isStockHc && chartType === 'bar') {
        return (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={stackedRows} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
              {gridEl}
              {xAxisEl}
              {yAxisEl}
              {tooltipEl}
              {legendEl}
              <Bar dataKey="Primaire" stackId="stock" fill="#0D9488" radius={[4, 4, 0, 0]} maxBarSize={32} {...anim}>
                <LabelList dataKey="Primaire" position="top" formatter={barTopLabel} />
              </Bar>
              <Bar dataKey="HC" stackId="stock" fill="#1E3A5F" radius={[4, 4, 0, 0]} maxBarSize={32} {...anim}>
                <LabelList dataKey="HC" position="top" formatter={barTopLabel} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )
      }

      if (def.slug === 'vendable-ligne-hc' && chartType === 'composed') {
        return (
          <ResponsiveContainer width="100%" height={height}>
            <ComposedChart
              data={rowsWithMa}
              margin={{ top: 8, right: 4, left: 0, bottom: bottomPad }}
              barCategoryGap="12%"
            >
              {gridEl}
              {xAxisEl}
              {yAxisEl}
              {tooltipEl}
              {legendEl}
              {groups.map(g => (
                <Bar
                  key={g}
                  dataKey={g}
                  fill={seriesColor(g, groupColorMap)}
                  radius={[2, 2, 0, 0]}
                  maxBarSize={barMaxForGroups}
                  {...anim}
                />
              ))}
              {groups.map(g => (
                <Line
                  key={`ma-${g}`}
                  type="monotone"
                  dataKey={`${g}_ma`}
                  name={`${g} (moy. mobile)`}
                  stroke={seriesColor(g, groupColorMap)}
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  dot={false}
                  legendType="none"
                  {...anim}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        )
      }

      const data = rows
      const commonMargin = { top: 8, right: 8, left: 0, bottom: def.slug === 'vendable-ligne-hc' && useScrollLegend ? bottomPad : 8 }
      const commonProps = { data, margin: commonMargin }

      if (chartType === 'bar') {
        return (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart {...commonProps}>
              {gridEl}
              {xAxisEl}
              {yAxisEl}
              {tooltipEl}
              {legendEl}
              {def.hasReferenceLine ? ref100 : null}
              {groups.map(g => (
                <Bar
                  key={g}
                  dataKey={g}
                  fill={seriesColor(g, groupColorMap)}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={def.slug === 'vendable-ligne-hc' ? barMaxForGroups : 32}
                  {...anim}
                >
                  <LabelList dataKey={g} position="top" formatter={barTopLabel} />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        )
      }

      if (chartType === 'area') {
        const useGrad = def.slug === 'vendable-ligne-primaire' || def.slug === 'biomasse-recuperee'
        const gradColor = def.primaryColor
        return (
          <ResponsiveContainer width="100%" height={height}>
            <AreaChart {...commonProps}>
              {useGrad && (
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={gradColor} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={gradColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
              )}
              {gridEl}
              {xAxisEl}
              {yAxisEl}
              {tooltipEl}
              {legendEl}
              {def.hasReferenceLine ? ref100 : null}
              {groups.map(g => (
                <Area
                  key={g}
                  dataKey={g}
                  type="monotone"
                  stroke={seriesColor(g, groupColorMap)}
                  strokeWidth={2}
                  fill={useGrad ? `url(#${gradId})` : seriesColor(g, groupColorMap)}
                  fillOpacity={useGrad ? 1 : 0.15}
                  dot={false}
                  {...anim}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )
      }

      const isPoids = def.slug === 'poids-moyen-primaire' || def.slug === 'poids-moyen-hc'

      return (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart {...commonProps}>
            {gridEl}
            {xAxisEl}
            {yAxisEl}
            {tooltipEl}
            {legendEl}
            {def.hasReferenceLine ? ref100 : null}
            {groups.map(g => (
              <Line
                key={g}
                dataKey={g}
                type={isPoids ? 'linear' : 'monotone'}
                stroke={seriesColor(g, groupColorMap)}
                strokeWidth={def.slug === 'vendable-ligne-hc' ? 2.5 : 2}
                dot={{ r: isPoids ? 4 : 3 }}
                activeDot={{ r: isPoids ? 7 : 6 }}
                connectNulls={def.slug === 'vendable-ligne-hc'}
                {...anim}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )
    },
    [
      unit,
      def.slug,
      def.hasReferenceLine,
      def.primaryColor,
      chartType,
      groups,
      rows,
      rowsWithMa,
      stackedRows,
      isStockHc,
      groupColorMap,
      gradId,
    ],
  )

  const cardInner = (
    <div
      className={cn(
        'rounded-xl border border-slate-700/80 bg-slate-900/60 p-4 flex flex-col gap-3',
        def.fullWidth && 'col-span-1 lg:col-span-2',
      )}
    >
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-slate-100 text-sm leading-tight">{def.title}</h3>
          <p
            className="text-xs text-slate-500 mt-1 truncate"
            title={def.formula}
          >
            ƒ {def.formula}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span
            className={cn(
              'text-xs font-semibold px-2 py-0.5 rounded-md',
              base === 'Primaire' ? 'bg-teal-600/25 text-teal-300' : 'bg-slate-700 text-slate-200',
            )}
          >
            {def.unit}
          </span>
          <div className="flex items-center gap-1">
            <button type="button" className={styles.iconBtn} onClick={onToggleType} title="Type de graphique">
              <BarChart3 size={13} />
            </button>
            {!omitFullscreen && (
              <button type="button" className={styles.iconBtn} onClick={() => onFullscreen(def.slug)} title="Plein écran">
                <Maximize2 size={13} />
              </button>
            )}
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => {
                if (isStockHc) {
                  exportChartCsv(def, stackedRows, ['Primaire', 'HC'])
                } else {
                  exportChartCsv(def, rows, groups)
                }
              }}
              title="Exporter CSV"
              disabled={isStockHc ? stackedRows.length === 0 : !rows.length}
            >
              <Download size={13} />
            </button>
          </div>
        </div>
      </div>

      {def.supportsOrigine && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            role="switch"
            aria-checked={origineFilter.enabled}
            onClick={() => onOrigineFilterChange({ enabled: !origineFilter.enabled })}
            className={cn(
              'relative w-9 h-5 rounded-full transition-colors shrink-0',
              origineFilter.enabled ? 'bg-teal-600' : 'bg-slate-600',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                origineFilter.enabled && 'translate-x-4',
              )}
            />
          </button>
          <span className="text-slate-300">Filtrer par origine récolte</span>
          {origineFilter.enabled && (
            <select
              className={cn(
                'bg-slate-800 border border-slate-600 rounded-md px-2 py-1 text-slate-200',
                'max-w-[200px]',
              )}
              value={origineFilter.value}
              onChange={e => onOrigineFilterChange({ value: e.target.value })}
            >
              <option value="">Toutes les origines</option>
              {origines.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {query.isError && (
        <div className={styles.chartError}>
          <AlertTriangle size={14} />
          <span>Erreur de chargement</span>
          <button type="button" className="ml-auto text-xs underline" onClick={() => query.refetch()}>Réessayer</button>
        </div>
      )}

      <div className="relative w-full min-h-[200px]">
        {isEmpty ? (
          <div
            className={cn(
              'flex flex-col items-center justify-center',
              'h-[200px] text-gray-400',
            )}
          >
            <BarChart2 className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">Aucune donnée pour cette configuration</p>
            <p className="text-xs mt-1">Essayez &quot;Tout&quot; dans les filtres période</p>
          </div>
        ) : (
          <>
            {showSkeleton && (
              <div className={cn(styles.skeleton, 'absolute inset-0 z-10 rounded-md')} />
            )}
            {renderChart(chartHeight)}
          </>
        )}
      </div>
    </div>
  )

  if (disableLayoutAnimation) {
    return (
      <>
        {cardInner}
        <ChartFullscreenModal
          open={fullscreenSlug === def.slug}
          onClose={() => onFullscreen('')}
          title={def.title}
        >
          {resp && !isEmpty ? renderChart(500) : <p className="text-slate-500 text-center mt-20">Aucune donnée</p>}
        </ChartFullscreenModal>
      </>
    )
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-50px' }}
        transition={{ duration: 0.4, delay: layoutMotionIndex * 0.1 }}
      >
        {cardInner}
      </motion.div>

      <ChartFullscreenModal
        open={fullscreenSlug === def.slug}
        onClose={() => onFullscreen('')}
        title={def.title}
      >
        {resp && !isEmpty ? renderChart(500) : <p className="text-slate-500 text-center mt-20">Aucune donnée</p>}
      </ChartFullscreenModal>
    </>
  )
}

/* ───────────────────── DB viewer column config ───────────────────── */

interface ColDef { key: keyof EstranDbRow; label: string; defaultVisible: boolean }

const PRIMAIRE_COLS: ColDef[] = [
  { key: 'generation_semi', label: 'Génération de semi', defaultVisible: false },
  { key: 'ligne_num', label: 'N° Ligne', defaultVisible: true },
  { key: 'longueur_ligne', label: 'Longueur ligne', defaultVisible: true },
  { key: 'orientation', label: 'Orientation W→E', defaultVisible: false },
  { key: 'effectif_seme', label: 'Effectif semé (éq. 200m)', defaultVisible: true },
  { key: 'taille_seme', label: 'Taille semé', defaultVisible: true },
  { key: 'objectif_recolte', label: 'Objectif récolte', defaultVisible: false },
  { key: 'date_recolte', label: 'Date récolte', defaultVisible: true },
  { key: 'age_td_mois', label: 'Age TD (mois)', defaultVisible: true },
  { key: 'residence_estran', label: 'Résidence estran (mois)', defaultVisible: true },
  { key: 'v_kg', label: 'V (kg)', defaultVisible: false },
  { key: 'biomasse_vendable_kg', label: 'V (Kg) /200m', defaultVisible: true },
  { key: 'quantite_brute_recoltee_kg', label: 'TOT (Kg)', defaultVisible: false },
  { key: 'kg_recolte_m2', label: 'Kg récolté/m²', defaultVisible: false },
  { key: 'biomasse_gr', label: 'PM TOT (g)', defaultVisible: true },
  { key: 'poids_mortalite_kg', label: 'Poids mortalité (kg)', defaultVisible: false },
  { key: 'taux_recapture', label: 'Taux de recapture %', defaultVisible: true },
]

const HC_COLS: ColDef[] = [
  { key: 'parc_semi', label: 'Parc de ressemis', defaultVisible: false },
  { key: 'ligne_num', label: 'N° Ligne', defaultVisible: true },
  { key: 'origine', label: 'Origine récolte prim.', defaultVisible: true },
  { key: 'orientation_lignes', label: 'Orientation O→E', defaultVisible: false },
  { key: 'longueur_ligne', label: 'Lng de ln semé (m)', defaultVisible: true },
  { key: 'taille_semi_hc', label: 'Taille de semi HC', defaultVisible: true },
  { key: 'quantite_semee_kg', label: 'HC Ressemé (kg)', defaultVisible: true },
  { key: 'hc_resseme_kg_m2', label: 'HC ressemé: kg/m²', defaultVisible: false },
  { key: 'objectif_recolte', label: 'Objectif de récolte', defaultVisible: false },
  { key: 'date_recolte', label: 'Date de récolte', defaultVisible: true },
  { key: 'pct_biomasse_recuperee', label: '% Biomasse récupérée', defaultVisible: true },
  { key: 'biomasse_gr', label: 'PM Total', defaultVisible: true },
  { key: 'mortalite_kg', label: 'Mortalité (kg)', defaultVisible: false },
  { key: 'taux_recapture', label: '% de recapture', defaultVisible: true },
]

const PCT_KEYS = new Set<string>(['taux_recapture', 'pct_biomasse_recuperee'])
const DATE_KEYS = new Set<string>(['date_recolte', 'date_semis'])
const MOIS_KEYS = new Set<string>(['age_td_mois', 'residence_estran'])
const DEC2_KG_KEYS = new Set<string>([
  'biomasse_vendable_kg', 'quantite_brute_recoltee_kg', 'v_kg',
  'quantite_semee_kg', 'hc_resseme_kg_m2', 'mortalite_kg', 'poids_mortalite_kg',
])

function loadSavedCols(base: 'primaire' | 'hc', cols: ColDef[]): Set<string> {
  const lsKey = base === 'primaire' ? 'estran_primaire_columns' : 'estran_hc_columns'
  try {
    const raw = localStorage.getItem(lsKey)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch { /* ignore */ }
  return new Set(cols.filter(c => c.defaultVisible).map(c => c.key))
}

function saveCols(base: 'primaire' | 'hc', visible: Set<string>) {
  const lsKey = base === 'primaire' ? 'estran_primaire_columns' : 'estran_hc_columns'
  localStorage.setItem(lsKey, JSON.stringify([...visible]))
}

function fmtNum(v: number, decimals: number): string {
  return v.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

interface CellRender { text: string; className?: string }

function renderCell(key: string, val: unknown): CellRender {
  if (val == null || val === '') return { text: '—', className: 'text-slate-500 italic' }

  if (DATE_KEYS.has(key)) {
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
      const d = new Date(val)
      return { text: d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
    }
    return { text: '—', className: 'text-slate-500 italic' }
  }

  if (PCT_KEYS.has(key)) {
    const n = typeof val === 'number' ? val : parseFloat(String(val))
    if (isNaN(n)) return { text: '—', className: 'text-slate-500 italic' }
    const pct = n > 1 && n <= 100 ? n : n <= 1 ? n * 100 : n
    const color = pct >= 80 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400'
    return { text: `${fmtNum(pct, 1)} %`, className: `font-medium ${color}` }
  }

  if (MOIS_KEYS.has(key)) {
    const n = typeof val === 'number' ? val : parseFloat(String(val))
    if (isNaN(n)) return { text: '—', className: 'text-slate-500 italic' }
    return { text: `${fmtNum(n, 1)} mois` }
  }

  if (key === 'biomasse_gr' || key === 'pm_tot_g') {
    const n = typeof val === 'number' ? val : parseFloat(String(val))
    if (isNaN(n)) return { text: '—', className: 'text-slate-500 italic' }
    return { text: `${fmtNum(n, 1)} g` }
  }

  if (key === 'longueur_ligne') {
    const n = typeof val === 'number' ? val : parseFloat(String(val))
    if (isNaN(n)) return { text: '—', className: 'text-slate-500 italic' }
    return { text: `${fmtNum(n, 0)} m` }
  }

  if (key === 'kg_recolte_m2') {
    const n = typeof val === 'number' ? val : parseFloat(String(val))
    if (isNaN(n)) return { text: '—', className: 'text-slate-500 italic' }
    return { text: `${fmtNum(n, 2)} kg/m²` }
  }

  if (DEC2_KG_KEYS.has(key)) {
    const n = typeof val === 'number' ? val : parseFloat(String(val))
    if (isNaN(n)) return { text: '—', className: 'text-slate-500 italic' }
    return { text: fmtNum(n, 2) }
  }

  if (key === 'effectif_seme') {
    const n = typeof val === 'number' ? val : parseFloat(String(val))
    if (isNaN(n)) return { text: '—', className: 'text-slate-500 italic' }
    return { text: Math.round(n).toLocaleString('fr-FR') }
  }

  if (typeof val === 'number') return { text: val.toLocaleString('fr-FR') }
  return { text: String(val) }
}

/* ───────────────────── main page ───────────────────── */

export default function EstranPage() {
  const [xAxis, setXAxis] = useState<XAxis_>('annee_mois')
  const [groupBy, setGroupBy] = useState<GroupBy_>('parc')
  const [periode, setPeriode] = useState<Periode_>('tout')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [fullscreenSlug, setFullscreenSlug] = useState<string | null>(null)
  const [chartTypes, setChartTypes] = useState<Record<string, ChartType_>>({})
  const [origineFilters, setOrigineFilters] = useState<Record<string, OrigineFilterState>>({})

  /* ── DB viewer state ── */
  const [dbOpen, setDbOpen] = useState(false)
  const [dbBase, setDbBase] = useState<'primaire' | 'hc'>('primaire')
  const [dbPage, setDbPage] = useState(1)
  const [dbPageSize, setDbPageSize] = useState(25)
  const [dbSearch, setDbSearch] = useState('')
  const [dbSearchInput, setDbSearchInput] = useState('')
  const [dbSortBy, setDbSortBy] = useState('date_recolte')
  const [dbSortOrder, setDbSortOrder] = useState<'asc' | 'desc'>('desc')
  const [dbColsOpen, setDbColsOpen] = useState(false)
  const dbViewerRef = useRef<HTMLDivElement>(null)

  const dbCols = dbBase === 'primaire' ? PRIMAIRE_COLS : HC_COLS
  const [visibleCols, setVisibleCols] = useState<Set<string>>(() => loadSavedCols('primaire', PRIMAIRE_COLS))

  useEffect(() => {
    setVisibleCols(loadSavedCols(dbBase, dbCols))
    setDbPage(1)
  }, [dbBase])

  useEffect(() => {
    const t = setTimeout(() => { setDbSearch(dbSearchInput); setDbPage(1) }, 400)
    return () => clearTimeout(t)
  }, [dbSearchInput])

  const toggleCol = (key: string) => {
    setVisibleCols(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      saveCols(dbBase, next)
      return next
    })
  }

  const dbCountsQ = useQuery({
    queryKey: ['estran', 'db-counts'],
    queryFn: () => api.getEstranDbCounts(),
    enabled: true,
  })

  const dbPageQ = useQuery({
    queryKey: ['estran', 'db-page', dbBase, dbPage, dbPageSize, dbSearch, dbSortBy, dbSortOrder],
    queryFn: () => api.getEstranDbPage({ base: dbBase, page: dbPage, page_size: dbPageSize, search: dbSearch || undefined, sort_by: dbSortBy, sort_order: dbSortOrder }),
    placeholderData: keepPreviousData,
    enabled: dbOpen,
  })

  const handleSort = (col: string) => {
    if (dbSortBy === col) { setDbSortOrder(o => o === 'asc' ? 'desc' : 'asc') }
    else { setDbSortBy(col); setDbSortOrder('desc') }
    setDbPage(1)
  }

  const handlePageChange = (p: number) => {
    setDbPage(p)
    dbViewerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const dbData = dbPageQ.data
  const dbTotal = dbData?.total ?? 0
  const dbPages = dbData?.pages ?? 1
  const dbFrom = dbTotal > 0 ? (dbPage - 1) * dbPageSize + 1 : 0
  const dbTo = Math.min(dbPage * dbPageSize, dbTotal)

  const isDefault = xAxis === 'annee_mois' && groupBy === 'parc' && periode === 'tout'
  const resetAll = () => { setXAxis('annee_mois'); setGroupBy('parc'); setPeriode('tout'); setDateFrom(''); setDateTo('') }

  const chartParams = useMemo((): EstranChartParams => ({
    x_axis: xAxis,
    group_by: groupBy,
    periode,
    date_from: periode === 'custom' && dateFrom ? dateFrom : undefined,
    date_to: periode === 'custom' && dateTo ? dateTo : undefined,
  }), [xAxis, groupBy, periode, dateFrom, dateTo])

  const paramsPrimaire = useMemo((): EstranChartParams => ({
    ...chartParams,
    group_by: groupBy === 'origine_recolte' ? 'parc' : groupBy,
  }), [chartParams, groupBy])

  const paramsHcBase = useMemo((): EstranChartParams => ({
    ...chartParams,
    group_by: groupBy,
  }), [chartParams, groupBy])

  const stockPrimaireParams = useMemo((): EstranChartParams => ({
    ...paramsPrimaire,
    group_by: paramsPrimaire.group_by === 'residence_estran' ? 'parc' : paramsPrimaire.group_by,
  }), [paramsPrimaire])

  const toggleChartType = (slug: string) => {
    setChartTypes(prev => {
      const d = findChartDefBySlug(slug)
      const cur = prev[slug] ?? d?.defaultType ?? 'line'
      return { ...prev, [slug]: nextChartType(cur, slug) }
    })
  }

  const getChartType = (def: ChartDef): ChartType_ => chartTypes[def.slug] ?? def.defaultType

  const patchOrigineFilter = useCallback((slug: string, patch: Partial<OrigineFilterState>) => {
    setOrigineFilters(prev => ({
      ...prev,
      [slug]: { ...(prev[slug] ?? { enabled: false, value: '' }), ...patch },
    }))
  }, [])

  /* ── preserved queries ── */
  const sheetsQ = useQuery({ queryKey: ['estran', 'sheets'], queryFn: () => api.getEstranSheets() })
  const kpiFiltersQ = useQuery({
    queryKey: ['estran', 'kpi-filters'],
    queryFn: () => api.getKpiFilters(),
  })

  const productionKpiQ = useQuery({
    queryKey: ['estran', 'kpi-production'],
    queryFn: () => api.getEstranProductionKpis(),
  })

  const kpiItemsByKey = useMemo(() => {
    const m = new Map<string, EstranProductionKpiItem>()
    for (const it of productionKpiQ.data?.items ?? []) {
      m.set(it.kpiKey, it)
    }
    return m
  }, [productionKpiQ.data?.items])

  const totalRecords = sheetsQ.data?.reduce((s: number, sh: EstranSheetInfo) => s + sh.count, 0) ?? 0
  const isCompletelyEmpty = !sheetsQ.isLoading && totalRecords === 0

  const primaireQueries = useQueries({
    queries: PRIMAIRE_CHARTS.map(def => ({
      queryKey: [
        'kpi-chart',
        def.slug,
        paramsPrimaire.x_axis,
        paramsPrimaire.group_by,
        paramsPrimaire.periode,
        paramsPrimaire.date_from ?? '',
        paramsPrimaire.date_to ?? '',
      ],
      queryFn: () => api.getKpiChart(def.slug, paramsPrimaire),
      placeholderData: keepPreviousData,
    })),
  })

  const hcQueries = useQueries({
    queries: HC_CHARTS.map(def => {
      const p = buildHcChartParams(paramsHcBase, def.slug, origineFilters)
      return {
        queryKey: [
          'kpi-chart',
          def.slug,
          p.x_axis,
          p.group_by,
          p.periode,
          p.date_from ?? '',
          p.date_to ?? '',
          p.filtre2 ?? '',
        ],
        queryFn: () => api.getKpiChart(def.slug, p),
        placeholderData: keepPreviousData,
      }
    }),
  })

  const qStockPrimaire = useQuery({
    queryKey: [
      'kpi-chart',
      'stock-lignes-primaire',
      stockPrimaireParams.x_axis,
      stockPrimaireParams.group_by,
      stockPrimaireParams.periode,
      stockPrimaireParams.date_from ?? '',
      stockPrimaireParams.date_to ?? '',
    ],
    queryFn: () => api.getKpiChart('stock-lignes-primaire', stockPrimaireParams),
    placeholderData: keepPreviousData,
  })

  const groupColorMapDeps = useMemo(
    () => JSON.stringify({
      p: primaireQueries.map(q => q.data?.groups_available ?? []),
      h: hcQueries.map(q => q.data?.groups_available ?? []),
    }),
    [primaireQueries, hcQueries],
  )

  const groupColorMap = useMemo((): Record<string, string> => {
    const names = new Set<string>()
    for (const q of primaireQueries) {
      for (const g of q.data?.groups_available ?? []) names.add(g)
    }
    for (const q of hcQueries) {
      for (const g of q.data?.groups_available ?? []) names.add(g)
    }
    const sorted = [...names].sort()
    return Object.fromEntries(
      sorted.map((g, i) => [g, SERIES_COLORS[i % SERIES_COLORS.length] as string]),
    ) as Record<string, string>
  }, [groupColorMapDeps])

  const originesListe = kpiFiltersQ.data?.origines_recolte ?? []

  const noopOriginePatch = useCallback((_patch: Partial<OrigineFilterState>) => {}, [])

  const exportAll = useCallback(() => {
    for (let i = 0; i < PRIMAIRE_CHARTS.length; i++) {
      const def = PRIMAIRE_CHARTS[i]
      const q = primaireQueries[i]
      if (!def || !q) continue
      const groups = q.data?.groups_available ?? []
      const rows = q.data ? transformForRecharts(q.data.data, groups) : []
      if (rows.length) exportChartCsv(def, rows, groups)
    }
    for (let i = 0; i < HC_CHARTS.length; i++) {
      const def = HC_CHARTS[i]
      const q = hcQueries[i]
      if (!def || !q) continue
      if (def.slug === 'stock-lignes-hc') {
        const stacked = mergePrimaireHcStockRows(qStockPrimaire.data, q.data)
        if (stacked.length) exportChartCsv(def, stacked, ['Primaire', 'HC'])
        continue
      }
      const groups = q.data?.groups_available ?? []
      const rows = q.data ? transformForRecharts(q.data.data, groups) : []
      if (rows.length) exportChartCsv(def, rows, groups)
    }
  }, [primaireQueries, hcQueries, qStockPrimaire.data])

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
          <h1>Production Estran</h1>
          <p className={styles.subtitle}>Recapture · Rendement · Poids · Stock</p>
        </div>
        <button type="button" className={styles.btn} onClick={exportAll}>
          <Download size={14} className="inline mr-1.5 -mt-0.5" />
          Exporter tout
        </button>
      </motion.header>

      {/* ══════ SECTION 2 — VARIABLE CONTROL PANEL ══════ */}
      <div className={styles.controlPanel}>
        {/* Row 1: Axe X */}
        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>Axe X</span>
          <div className={styles.pillGroup}>
            {X_AXIS_OPTIONS.map(o => (
              <button key={o.value} type="button"
                className={cn(styles.pillBtn, xAxis === o.value && styles.pillBtnActive)}
                onClick={() => setXAxis(o.value)}
              >{o.label}</button>
            ))}
          </div>

          <span className={cn(styles.controlLabel, 'ml-4')}>Grouper par</span>
          <div className={styles.pillGroup}>
            {GROUP_BY_OPTIONS.map(o => (
              <button key={o.value} type="button"
                className={cn(
                  styles.pillBtn,
                  groupBy === o.value && styles.pillBtnActive,
                )}
                onClick={() => setGroupBy(o.value)}
              >{o.label}</button>
            ))}
          </div>
        </div>

        {/* Row 2: Période */}
        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>Période</span>
          <div className={styles.pillGroup}>
            {PERIODE_OPTIONS.map(o => (
              <button key={o.value} type="button"
                className={cn(styles.pillBtn, periode === o.value && styles.pillBtnActive)}
                onClick={() => setPeriode(o.value)}
              >{o.label}</button>
            ))}
          </div>

          {periode === 'custom' && (
            <div className={styles.datePickerRow}>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              <span className="text-slate-500 text-xs">→</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
          )}

          {!isDefault && (
            <motion.button
              type="button" className={styles.resetBtn} onClick={resetAll}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <RotateCcw size={12} /> Réinitialiser
            </motion.button>
          )}
        </div>

        {/* Summary line */}
        <p className={styles.summaryLine}>
          Affichage : <strong>{XAXIS_LABELS[xAxis]}</strong> · Groupé par <strong>{GROUPBY_LABELS[groupBy]}</strong>
          {periode === 'tout' ? (
            <> · <strong>Tout l&apos;historique</strong></>
          ) : (
            <> · <strong>{PERIODE_LABELS[periode]}</strong></>
          )}
        </p>
      </div>

      {/* ══════ INDICATEURS CALCULÉS (agrégés) ══════ */}
      <div className="mb-10 space-y-8">
        <p className="text-xs text-slate-500">
          Calculs sur l&apos;ensemble des données importées (indépendamment des filtres des graphiques ci-dessous).
        </p>

        {productionKpiQ.isError && (
          <div className={cn(styles.chartError, 'max-w-xl')}>
            <AlertTriangle size={14} />
            <span>Impossible de charger les indicateurs calculés.</span>
            <button type="button" className="ml-auto text-xs underline" onClick={() => productionKpiQ.refetch()}>
              Réessayer
            </button>
          </div>
        )}

        <div>
          <h2 className="text-sm font-semibold text-teal-300/90 mb-3 tracking-wide uppercase">
            Base Primaire
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {productionKpiQ.isLoading && !productionKpiQ.data
              ? PRIMAIRE_KPI_CALC_KEYS.map(k => (
                <div key={k} className={cn(styles.skeleton, 'h-[120px] rounded-xl')} />
              ))
              : PRIMAIRE_KPI_CALC_KEYS.map(k => {
                const item = kpiItemsByKey.get(k)
                return item ? <KpiCalcCard key={k} item={item} /> : null
              })}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-300 mb-3 tracking-wide uppercase">
            Hors calibre
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {productionKpiQ.isLoading && !productionKpiQ.data
              ? HC_KPI_CALC_KEYS.map(k => (
                <div key={k} className={cn(styles.skeleton, 'h-[120px] rounded-xl')} />
              ))
              : HC_KPI_CALC_KEYS.map(k => {
                const item = kpiItemsByKey.get(k)
                return item ? <KpiCalcCard key={k} item={item} /> : null
              })}
          </div>
        </div>
      </div>

      {/* ══════ SECTION 3 — BASE PRIMAIRE CHARTS ══════ */}
      <motion.div
        className="mb-4 flex flex-wrap items-center gap-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <h2 className="text-lg font-semibold text-slate-100">Base Primaire</h2>
        <span className={cn(styles.baseBadge, styles.basePrimaire)}>
          {(dbCountsQ.data?.primaire_total ?? 0).toLocaleString('fr-FR')} lignes
        </span>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {PRIMAIRE_CHARTS.map((def, i) => {
          const pq = primaireQueries[i]
          if (!pq) return null
          return (
            <ChartCard
              key={def.slug}
              def={def}
              base="Primaire"
              chartType={getChartType(def)}
              onToggleType={() => toggleChartType(def.slug)}
              groupColorMap={groupColorMap}
              query={pq}
              origines={originesListe}
              origineFilter={{ enabled: false, value: '' }}
              onOrigineFilterChange={noopOriginePatch}
              layoutMotionIndex={i}
              chartHeight={300}
              fullscreenSlug={fullscreenSlug}
              onFullscreen={s => setFullscreenSlug(s || null)}
            />
          )
        })}
      </div>

      <div
        className={cn(
          'flex items-center justify-center my-10',
          'text-slate-500 text-sm tracking-widest',
        )}
      >
        ── Base Hors Calibre ──
      </div>

      {/* ══════ SECTION 4 — BASE HC CHARTS ══════ */}
      <motion.div
        className="mb-4 flex flex-wrap items-center gap-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
      >
        <h2 className="text-lg font-semibold text-slate-100">Base Hors Calibre</h2>
        <span className={cn(styles.baseBadge, styles.baseHC)}>
          {(dbCountsQ.data?.hc_total ?? 0).toLocaleString('fr-FR')} lignes
        </span>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        {HC_CHARTS.map((def, i) => {
          const hq = hcQueries[i]
          if (!hq) return null
          return (
            <ChartCard
              key={def.slug}
              def={def}
              base="HC"
              chartType={getChartType(def)}
              onToggleType={() => toggleChartType(def.slug)}
              groupColorMap={groupColorMap}
              query={hq}
              stockPrimaireQuery={def.slug === 'stock-lignes-hc' ? qStockPrimaire : undefined}
              origines={originesListe}
              origineFilter={origineFilters[def.slug] ?? { enabled: false, value: '' }}
              onOrigineFilterChange={patch => patchOrigineFilter(def.slug, patch)}
              layoutMotionIndex={i}
              chartHeight={def.slug === 'stock-lignes-hc' ? 320 : 300}
              fullscreenSlug={fullscreenSlug}
              onFullscreen={s => setFullscreenSlug(s || null)}
            />
          )
        })}
      </div>

      {/* ══════ DATABASE VIEWER ══════ */}
      <div ref={dbViewerRef} className="mb-8">
        <button
          type="button"
          className={cn(styles.glassCard, 'w-full flex items-center justify-between cursor-pointer hover:border-teal-500/30 transition-colors')}
          onClick={() => setDbOpen(o => !o)}
        >
          <div className="flex items-center gap-3">
            <Database size={18} className="text-teal-400" />
            <span className="font-semibold text-sm">Base de données Estran</span>
            <span className={cn(styles.baseBadge, styles.basePrimaire)}>
              Primaire · {(dbCountsQ.data?.primaire_total ?? 0).toLocaleString('fr-FR')} lignes
            </span>
            <span className={cn(styles.baseBadge, styles.baseHC)}>
              HC · {(dbCountsQ.data?.hc_total ?? 0).toLocaleString('fr-FR')} lignes
            </span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span className="text-xs">{dbOpen ? 'Masquer' : 'Afficher'}</span>
            <motion.div animate={{ rotate: dbOpen ? 180 : 0 }} transition={{ duration: 0.25 }}>
              <ChevronDown size={16} />
            </motion.div>
          </div>
        </button>

        <AnimatePresence>
          {dbOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className={cn(styles.glassCard, 'mt-2')}>
                {/* Controls bar */}
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <div className={styles.pillGroup}>
                    {(['primaire', 'hc'] as const).map(b => (
                      <button key={b} type="button"
                        className={cn(styles.pillBtn, dbBase === b && styles.pillBtnActive)}
                        onClick={() => { setDbBase(b); setDbPage(1) }}
                      >{b === 'primaire' ? 'Primaire' : 'HC'}</button>
                    ))}
                  </div>

                  <select
                    className={styles.sheetSelect}
                    value={dbPageSize}
                    onChange={e => { setDbPageSize(Number(e.target.value)); setDbPage(1) }}
                  >
                    {[10, 25, 50, 100].map(n => (
                      <option key={n} value={n}>{n} lignes</option>
                    ))}
                  </select>

                  <div className="relative flex-1 min-w-[200px] max-w-[320px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Rechercher dans la base..."
                      value={dbSearchInput}
                      onChange={e => setDbSearchInput(e.target.value)}
                      className="w-full pl-8 pr-8 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:border-teal-500/50 outline-none"
                    />
                    {dbSearchInput && (
                      <button type="button" onClick={() => { setDbSearchInput(''); setDbSearch('') }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  <div className="ml-auto flex gap-2 items-center relative">
                    <button type="button" className={styles.iconBtn} onClick={() => setDbColsOpen(o => !o)} title="Colonnes">
                      <Columns3 size={14} />
                    </button>
                    {dbColsOpen && (
                      <div className="absolute right-10 top-0 z-30 w-56 max-h-72 overflow-y-auto bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-2xl">
                        <div className="flex justify-between mb-2">
                          <button type="button" className="text-xs text-teal-400 hover:underline"
                            onClick={() => { const all = new Set(dbCols.map(c => c.key)); setVisibleCols(all); saveCols(dbBase, all) }}>
                            Tout afficher
                          </button>
                          <button type="button" className="text-xs text-slate-400 hover:underline"
                            onClick={() => { setVisibleCols(new Set()); saveCols(dbBase, new Set()) }}>
                            Tout masquer
                          </button>
                        </div>
                        {dbCols.map(c => (
                          <label key={c.key} className="flex items-center gap-2 py-0.5 text-xs text-slate-300 cursor-pointer hover:text-white">
                            <input type="checkbox" checked={visibleCols.has(c.key)}
                              onChange={() => toggleCol(c.key)}
                              className="accent-teal-500 rounded" />
                            {c.label}
                          </label>
                        ))}
                      </div>
                    )}

                    <div className="relative group">
                      <button type="button" className={styles.btn} style={{ padding: '0.4rem 0.85rem', fontSize: '0.78rem' }}>
                        <Download size={13} className="inline mr-1 -mt-0.5" /> Exporter
                      </button>
                      <div className="hidden group-hover:block absolute right-0 top-full mt-1 z-30 w-52 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
                        <a href={api.getEstranDbExportUrl({ base: dbBase, search: dbSearch || undefined, full: false, page: dbPage, page_size: dbPageSize })}
                          className="block px-4 py-2.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white">
                          CSV — données visibles
                        </a>
                        <a href={api.getEstranDbExportUrl({ base: dbBase, search: dbSearch || undefined, full: true })}
                          className="block px-4 py-2.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white border-t border-slate-700/50">
                          CSV — toutes les données
                        </a>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Table */}
                <div className={styles.tableWrap} style={{ maxHeight: '520px', overflowY: 'auto' }}>
                  {dbPageQ.isFetching && !dbPageQ.data ? (
                    <div className="space-y-2 p-4">
                      {Array.from({ length: dbPageSize > 10 ? 10 : dbPageSize }).map((_, i) => (
                        <div key={i} className={cn(styles.skeleton, 'h-8 rounded')} />
                      ))}
                    </div>
                  ) : dbTotal === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                      <Search size={32} className="opacity-40 mb-2" />
                      <p className="text-sm">Aucun résultat{dbSearch ? ` pour "${dbSearch}"` : ''}</p>
                      {dbSearch && (
                        <button type="button" className="mt-2 text-xs text-teal-400 hover:underline"
                          onClick={() => { setDbSearchInput(''); setDbSearch('') }}>
                          Effacer la recherche
                        </button>
                      )}
                    </div>
                  ) : (
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          {dbCols.filter(c => visibleCols.has(c.key)).map(c => (
                            <th key={c.key}
                              className="cursor-pointer select-none whitespace-nowrap"
                              onClick={() => handleSort(c.key)}
                            >
                              <span className="inline-flex items-center gap-1">
                                {c.label}
                                {dbSortBy === c.key && (dbSortOrder === 'asc'
                                  ? <ArrowUp size={11} className="text-teal-400" />
                                  : <ArrowDown size={11} className="text-teal-400" />
                                )}
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(dbData?.items ?? []).map((row, ri) => (
                          <tr key={row.id} className={ri % 2 === 0 ? '' : 'bg-slate-800/20'}>
                            {dbCols.filter(c => visibleCols.has(c.key)).map(c => {
                              const cell = renderCell(c.key, row[c.key])
                              return (
                                <td key={c.key} className={cn('whitespace-nowrap text-sm', cell.className)}>
                                  {cell.text}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Pagination */}
                {dbTotal > 0 && (
                  <div className="flex items-center justify-between mt-4 text-xs text-slate-400 flex-wrap gap-2">
                    <span>Affichage de {dbFrom} à {dbTo} sur {dbTotal.toLocaleString('fr-FR')} lignes</span>
                    <div className="flex items-center gap-1">
                      <button type="button" disabled={dbPage <= 1}
                        className={cn(styles.iconBtn, 'text-xs px-2 w-auto')}
                        onClick={() => handlePageChange(dbPage - 1)}>
                        ←
                      </button>
                      {Array.from({ length: Math.min(5, dbPages) }, (_, i) => {
                        let p: number
                        if (dbPages <= 5) p = i + 1
                        else if (dbPage <= 3) p = i + 1
                        else if (dbPage >= dbPages - 2) p = dbPages - 4 + i
                        else p = dbPage - 2 + i
                        return (
                          <button key={p} type="button"
                            className={cn(
                              'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                              p === dbPage ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'
                            )}
                            onClick={() => handlePageChange(p)}>
                            {p}
                          </button>
                        )
                      })}
                      <button type="button" disabled={dbPage >= dbPages}
                        className={cn(styles.iconBtn, 'text-xs px-2 w-auto')}
                        onClick={() => handlePageChange(dbPage + 1)}>
                        →
                      </button>
                    </div>
                    <span>Page {dbPage} sur {dbPages}</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
