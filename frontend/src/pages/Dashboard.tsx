import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Minus, Clock, Layers, Sparkles,
  Waves, ShoppingCart, BarChart2, AlertTriangle, RotateCw,
  ChevronRight, Download, CheckCircle, CloudUpload,
  FileSpreadsheet, Bot, Activity,
} from 'lucide-react'
import { api } from '../services/apiClient'
import type { ActivityLogEntry } from '../services/apiClient'
import { invalidateDashboardDataQueries } from '../utils/invalidateAppQueries'
import styles from './Dashboard.module.css'
import { cn } from '../lib/utils'

/* ───────── constants ───────── */

const UPLOAD_ACCEPT_EXT = ['.xlsx', '.xlsm']
const UPLOAD_MAX_MB = 20
const MODULE_COLORS: Record<string, string> = { estran: '#0d9488', finance: '#3b82f6', achat: '#f97316', chat: '#8b5cf6', auth: '#64748b' }

/* ───────── hooks ───────── */

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
      setValue(start + diff * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
      else prev.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

function useUserInfo(): { fullName: string; role: string } {
  const [info] = useState(() => {
    try {
      return {
        fullName: localStorage.getItem('azura_user_name') || 'Utilisateur',
        role: localStorage.getItem('azura_user_role') || 'viewer',
      }
    } catch { return { fullName: 'Utilisateur', role: 'viewer' } }
  })
  return info
}

/* ───────── helpers ───────── */

function fmtCompact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return "à l'instant"
  const mins = Math.floor(diff / 60)
  if (mins < 60) return `il y a ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `il y a ${hrs}h`
  return `il y a ${Math.floor(hrs / 24)}j`
}

function moduleStyle(mod: string): string {
  const m = (mod || '').toLowerCase()
  if (m.includes('estran')) return styles.modEstran
  if (m.includes('finance')) return styles.modFinance
  if (m.includes('achat')) return styles.modAchat
  if (m.includes('chat')) return styles.modChat
  return styles.modAuth
}

function initials(name: string | null): string {
  if (!name) return '?'
  return name.split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2)
}

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }
const fadeUp = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: 'easeOut' as const } },
}
const itemSlide = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.25 } },
}

/* ───────── KPI card component ───────── */

interface KpiDef {
  key: string; label: string; value: number; unit: string
  trend?: number; trendDir?: 'up' | 'down' | 'stable'
  color: 'teal' | 'blue' | 'orange'; icon: typeof TrendingUp
  href: string; alertColor?: string
}

function KpiCard({ def }: { def: KpiDef }) {
  const Icon = def.icon
  const animated = useCountUp(def.value, 900)
  const navigate = useNavigate()
  const colorMap = { teal: '#0d9488', blue: '#3b82f6', orange: '#f97316' }
  const borderColor = colorMap[def.color]

  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ scale: 1.03, boxShadow: `0 12px 40px ${borderColor}22` }}
      whileTap={{ scale: 0.98 }}
      className={cn(styles.kpiCard, styles.kpiCardClickable)}
      style={{ borderLeft: `3px solid ${borderColor}` }}
      onClick={() => navigate(def.href)}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${borderColor}18`, color: borderColor }}>
          <Icon size={16} />
        </span>
        {def.alertColor && <span className="w-2 h-2 rounded-full" style={{ background: def.alertColor }} />}
      </div>
      <h3>{def.label}</h3>
      <p className={styles.kpiValue}>
        {animated.toLocaleString('fr-FR', { maximumFractionDigits: def.unit === '%' ? 1 : 0 })}
        <span className="text-sm text-slate-400 ml-1 font-normal">{def.unit}</span>
      </p>
      {def.trend != null && (
        <div className="flex items-center mt-1">
          {def.trendDir === 'up' && <TrendingUp size={12} className="text-emerald-400 mr-1" />}
          {def.trendDir === 'down' && <TrendingDown size={12} className="text-rose-400 mr-1" />}
          {def.trendDir === 'stable' && <Minus size={12} className="text-slate-500 mr-1" />}
          <span className={cn('text-xs', def.trendDir === 'up' ? 'text-emerald-400' : def.trendDir === 'down' ? 'text-rose-400' : 'text-slate-500')}>
            {def.trend > 0 ? '+' : ''}{def.trend.toFixed(1)}%
          </span>
        </div>
      )}
    </motion.div>
  )
}

/* ───────── chart tooltip ───────── */

function ChartTip({ active, payload, label, unit }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className={styles.friendlyTooltip}>
      {label && <p className={styles.friendlyTooltipTitle}>{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className={styles.friendlyTooltipRow}>
          <span className={styles.friendlyTooltipDot} style={{ background: p.color }} />
          <span className={styles.friendlyTooltipName}>{p.name}</span>
          <strong className={styles.friendlyTooltipValue}>{p.value?.toLocaleString('fr-FR')} {unit}</strong>
        </div>
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════
   MAIN DASHBOARD
   ═══════════════════════════════════════════ */

export default function Dashboard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useUserInfo()
  const dashboardRootRef = useRef<HTMLDivElement>(null)

  /* ── file drop state (preserved from old dashboard) ── */
  const [fileDropOverlay, setFileDropOverlay] = useState(false)
  const [fileUploading, setFileUploading] = useState(false)
  const [fileUploadError, setFileUploadError] = useState<string | null>(null)
  const [fileUploadSuccess, setFileUploadSuccess] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  /* ── AI summary state ── */
  const [aiText, setAiText] = useState('')
  const [aiFullText, setAiFullText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const syncMutation = useMutation({
    mutationFn: () => api.syncOneDrive(),
    onSuccess: async () => { setSyncError(null); await invalidateDashboardDataQueries(queryClient) },
    onError: (err: Error) => setSyncError(err.message),
  })

  const handleDroppedFiles = useCallback(async (files: FileList | null) => {
    const list = files?.length ? Array.from(files) : []
    if (!list.length) return
    for (const f of list) {
      const ext = f.name.toLowerCase().slice(f.name.lastIndexOf('.'))
      if (!UPLOAD_ACCEPT_EXT.includes(ext)) { setFileUploadError('Formats acceptés : .xlsx, .xlsm'); return }
      if (f.size > UPLOAD_MAX_MB * 1024 * 1024) { setFileUploadError(`Taille max : ${UPLOAD_MAX_MB} Mo`); return }
    }
    setFileUploadError(null); setFileUploadSuccess(null); setFileUploading(true)
    try {
      const counts = await api.uploadExcel(list.length === 1 ? list[0]! : list)
      await invalidateDashboardDataQueries(queryClient)
      setFileUploadSuccess(`Import: ${counts.estran} Estran, ${counts.finance} Finance, ${counts.purchases} Achats`)
      setTimeout(() => setFileUploadSuccess(null), 6000)
    } catch (err) { setFileUploadError(err instanceof Error ? err.message : "Erreur d'import") }
    finally { setFileUploading(false) }
  }, [queryClient])

  /* ── queries ── */

  const statsQ = useQuery({ queryKey: ['dashboard', 'stats'], queryFn: () => api.getDashboardStats(), placeholderData: keepPreviousData })
  const chatStatusQ = useQuery({ queryKey: ['chat', 'status'], queryFn: () => api.getChatStatus(), refetchInterval: 60000 })
  const activityQ = useQuery({ queryKey: ['dashboard', 'activity'], queryFn: () => api.getActivityRecent(10), placeholderData: keepPreviousData })
  const estranKpiQ = useQuery({ queryKey: ['estran', 'kpis-dash'], queryFn: () => api.getEstranKpis(), placeholderData: keepPreviousData })
  const financeKpiQ = useQuery({ queryKey: ['finance', 'kpi-dash'], queryFn: () => api.getFinanceKpi(), placeholderData: keepPreviousData })
  const achatSuiviQ = useQuery({ queryKey: ['achat', 'suivi-dash'], queryFn: () => api.getAchatSuivi(), placeholderData: keepPreviousData })
  const estranAnomaliesQ = useQuery({ queryKey: ['estran', 'anomalies-dash'], queryFn: () => api.getEstranAnomalies({ limit: 100 }), placeholderData: keepPreviousData })
  const financeAnomaliesQ = useQuery({ queryKey: ['finance', 'anomalies-dash'], queryFn: () => api.getFinanceAnomalies({ limit: 100 }), placeholderData: keepPreviousData })
  const rendementQ = useQuery({ queryKey: ['estran', 'chart-rend-dash'], queryFn: () => api.getEstranChartRendement(), placeholderData: keepPreviousData })

  const s = statsQ.data
  const ek = estranKpiQ.data
  const fk = financeKpiQ.data
  const suivi = achatSuiviQ.data?.summary

  /* ── AI summary generation ── */

  const generateAiSummary = useCallback(async () => {
    setAiLoading(true); setAiText(''); setAiFullText('')
    if (typewriterRef.current) clearInterval(typewriterRef.current)
    try {
      const res = await api.postChatAnalyze({
        message: "Génère un résumé exécutif en 4-5 phrases du tableau de bord pour aujourd'hui. Couvre: l'état de la production Estran (biomasse, anomalies), la situation financière (YTD vs budget), les achats urgents (DA en attente), et une recommandation prioritaire. Sois concis et professionnel.",
        include_data: true,
      })
      setAiFullText(res.response)
    } catch {
      setAiFullText("Impossible de générer le résumé — vérifiez qu'Ollama est en ligne.")
    } finally { setAiLoading(false) }
  }, [])

  useEffect(() => { generateAiSummary() }, [generateAiSummary])

  useEffect(() => {
    if (!aiFullText) return
    let idx = 0
    setAiText('')
    typewriterRef.current = setInterval(() => {
      idx++
      setAiText(aiFullText.slice(0, idx))
      if (idx >= aiFullText.length && typewriterRef.current) clearInterval(typewriterRef.current)
    }, 20)
    return () => { if (typewriterRef.current) clearInterval(typewriterRef.current) }
  }, [aiFullText])

  const downloadPdf = async () => {
    if (!aiFullText) return
    try {
      const blob = await api.postChatReport({ message: aiFullText, title: 'Résumé IA du jour' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `resume_ia_${Date.now()}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch { /* silent */ }
  }

  /* ── derived data ── */

  const todayStr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const rendPrim = ek?.rendement_primaire?.value ?? 0
  const rendHc = ek?.rendement_hc?.value ?? 0
  const rendMoyen = Math.round((rendPrim + rendHc) / 2)
  const stockPrim = ek?.stock_lignes_primaire?.value ?? 0
  const stockHc = ek?.stock_lignes_hc?.value ?? 0
  const stockTotal = s?.estran_stock_total ?? (stockPrim + stockHc)
  const anomEstran = estranAnomaliesQ.data?.length ?? s?.anomalies_estran ?? 0
  const anomFinance = financeAnomaliesQ.data?.length ?? s?.anomalies_finance ?? 0

  const ytd = fk?.total_ytd ?? s?.finance?.budget_vs_real?.ytd ?? 0
  const budget = fk?.total_budget_ytd ?? s?.finance?.budget_vs_real?.budget ?? 0
  const varPct = s?.finance_variance_pct ?? (budget ? ((ytd - budget) / budget) * 100 : 0)

  const daPending = s?.achat_da_pending ?? suivi?.da_en_cours ?? 0
  const daUrgent = s?.achat_da_urgent ?? 0
  const bcEnCours = suivi?.bc_en_cours ?? 0

  /* ── KPI definitions ── */

  const kpiDefs: KpiDef[] = useMemo(() => [
    { key: 'rg', label: 'Rendement Moyen', value: rendMoyen, unit: 'Kg', trend: ek?.rendement_primaire?.trend, trendDir: (ek?.rendement_primaire?.trend_direction ?? 'stable') as 'up'|'down'|'stable', color: 'teal', icon: TrendingUp, href: '/app/estran' },
    { key: 'st', label: 'Stock Total Lignes', value: stockTotal, unit: 'lignes', trend: ek?.stock_lignes_primaire?.trend, trendDir: (ek?.stock_lignes_primaire?.trend_direction ?? 'stable') as 'up'|'down'|'stable', color: 'teal', icon: Layers, href: '/app/estran' },
    { key: 'ae', label: 'Anomalies Estran', value: anomEstran, unit: '', color: 'teal', icon: AlertTriangle, href: '/app/estran', alertColor: anomEstran === 0 ? '#22d3a8' : anomEstran <= 3 ? '#f97316' : '#ef4444' },
    { key: 'yt', label: 'YTD Réalisé', value: ytd, unit: 'MAD', color: 'blue', icon: BarChart2, href: '/app/finance', trend: varPct, trendDir: varPct > 0 ? 'up' : varPct < 0 ? 'down' : 'stable' },
    { key: 'vb', label: 'Variance Budget', value: Math.abs(varPct), unit: '%', color: 'blue', icon: TrendingUp, href: '/app/finance', alertColor: varPct >= 0 ? '#22d3a8' : '#ef4444' },
    { key: 'af', label: 'Anomalies Finance', value: anomFinance, unit: '', color: 'blue', icon: AlertTriangle, href: '/app/finance', alertColor: anomFinance === 0 ? '#22d3a8' : anomFinance <= 3 ? '#f97316' : '#ef4444' },
    { key: 'dp', label: 'DA En Attente', value: daPending, unit: '', color: 'orange', icon: Clock, href: '/app/achat', alertColor: daPending === 0 ? '#22d3a8' : daPending <= 5 ? '#f97316' : '#ef4444' },
    { key: 'du', label: 'DA Urgentes', value: daUrgent, unit: '', color: 'orange', icon: AlertTriangle, href: '/app/achat', alertColor: daUrgent > 0 ? '#ef4444' : '#22d3a8' },
    { key: 'bc', label: 'BC En Cours', value: bcEnCours, unit: '', color: 'orange', icon: ShoppingCart, href: '/app/achat' },
  ], [rendMoyen, stockTotal, anomEstran, ytd, varPct, anomFinance, daPending, daUrgent, bcEnCours, ek])

  /* ── mini chart data ── */

  const rendChartData = useMemo(() => {
    const raw = rendementQ.data ?? []
    const byYear = new Map<number, number[]>()
    raw.forEach(d => {
      if (!byYear.has(d.annee)) byYear.set(d.annee, [])
      byYear.get(d.annee)!.push(d.valeur)
    })
    return Array.from(byYear.entries())
      .sort((a, b) => a[0] - b[0])
      .slice(-6)
      .map(([year, vals]) => ({ period: String(year), rendement: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) }))
  }, [rendementQ.data])

  const financeTrendData = useMemo(() => {
    const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun']
    return MONTHS.map((m, i) => ({
      month: m,
      ytd: Math.round(ytd * ((i + 1) / 6) * 1.05),
      budget: Math.round(budget * ((i + 1) / 6)),
    }))
  }, [ytd, budget])

  const achatPieData = useMemo(() => {
    const statut = achatSuiviQ.data?.kpis?.statut_da
    if (statut && Object.keys(statut).length > 0) {
      return Object.entries(statut).filter(([, v]) => Number(v) > 0).map(([name, value]) => ({ name, value: Number(value) }))
    }
    return (s?.achats?.da_bc_summary ?? []).map(x => ({ name: x.type, value: x.count }))
  }, [achatSuiviQ.data, s])

  const achatPieTotal = achatPieData.reduce((a, d) => a + d.value, 0)
  const PIE_COLORS = ['#f97316', '#22d3a8', '#ef4444', '#3b82f6', '#eab308', '#8b5cf6']

  /* ── alerts ── */

  const alerts = useMemo(() => {
    const list: { text: string; color: string; href: string }[] = []
    for (const a of (estranAnomaliesQ.data ?? []).slice(0, 3)) {
      list.push({ text: `Estran: anomalie parc ${a.parc_semi ?? '—'} (${a.severity})`, color: 'Red', href: '/app/estran' })
    }
    for (const a of (financeAnomaliesQ.data ?? []).slice(0, 2)) {
      list.push({ text: `Finance: écart ${a.label ?? a.code} (${a.severity})`, color: 'Orange', href: '/app/finance' })
    }
    if (daUrgent > 0) {
      list.push({ text: `${daUrgent} DA urgente(s) en attente`, color: 'Yellow', href: '/app/achat' })
    }
    return list.slice(0, 5)
  }, [estranAnomaliesQ.data, financeAnomaliesQ.data, daUrgent])

  /* ── drag & drop handlers ── */

  const onDragEnter = useCallback((e: React.DragEvent) => { e.preventDefault(); if ([...e.dataTransfer.types].includes('Files')) setFileDropOverlay(true) }, [])
  const onDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); const r = e.relatedTarget as Node | null; if (r && dashboardRootRef.current?.contains(r)) return; setFileDropOverlay(false) }, [])
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }, [])
  const onDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setFileDropOverlay(false); void handleDroppedFiles(e.dataTransfer.files) }, [handleDroppedFiles])

  const roleClass = user.role === 'admin' ? styles.roleAdmin : user.role === 'manager' ? styles.roleManager : user.role === 'analyst' ? styles.roleAnalyst : styles.roleViewer

  return (
    <div ref={dashboardRootRef} className={styles.dashboard} onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop}>
      {/* Drop overlay */}
      {fileDropOverlay && (
        <div className={styles.dropOverlay} onDragOver={onDragOver} onDrop={onDrop} onDragLeave={(e) => { const r = e.relatedTarget as Node | null; if (r && e.currentTarget.contains(r)) return; setFileDropOverlay(false) }}>
          <div className={styles.dropOverlayInner}>
            <FileSpreadsheet size={48} strokeWidth={1.25} />
            <p className={styles.dropOverlayTitle}>Déposez vos fichiers Excel</p>
            <p className={styles.dropOverlayHint}>REFLEXION, MODELE GL, BAL MODELE, Suivi Global CCS…</p>
          </div>
        </div>
      )}
      {fileUploading && <div className={styles.uploadToast}><span className={styles.uploadToastSpinner} /> Import en cours…</div>}

      {/* ══════ SECTION 1 — WELCOME HEADER ══════ */}
      <motion.header className={cn(styles.hero, 'items-center')} initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className={styles.heroText}>
          <h1 className={styles.heroTitle}>Bonjour, {user.fullName}</h1>
          <p className={styles.heroDate}>{todayStr}</p>
          <span className={cn(styles.roleBadge, roleClass, 'mt-2 inline-block')}>{user.role}</span>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-xs text-slate-400"><span className={cn(styles.statusDot, styles.statusGreen)} />Système opérationnel</span>
          <span className="text-xs text-slate-400">
            <span className={cn(styles.statusDot, chatStatusQ.data?.ollama_online ? styles.statusBlue : styles.statusRed)} />
            {chatStatusQ.data?.ollama_online ? 'IA en ligne' : 'IA hors ligne'}
          </span>
          <span className="text-xs text-slate-400">
            <Clock size={11} className="inline mr-1" />
            Sync: {timeAgo(s?.last_sync_at)}
          </span>
          <button type="button" className={styles.syncBtn} onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
            <CloudUpload size={16} /> {syncMutation.isPending ? 'Sync…' : 'Synchroniser'}
          </button>
        </div>
      </motion.header>

      {syncError && <p className={styles.error}>{syncError}</p>}
      {fileUploadError && <p className={styles.error}>{fileUploadError}</p>}
      {fileUploadSuccess && <p className={styles.successBanner}>{fileUploadSuccess}</p>}

      {/* ══════ SECTION 2 — AI DAILY SUMMARY ══════ */}
      <motion.section className={styles.aiCard} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, delay: 0.2 }}>
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-400"><Sparkles size={20} /></span>
              <div>
                <h2 className="text-base font-bold text-slate-100">Résumé IA du jour</h2>
                <p className="text-xs text-slate-500">Généré par Mistral · {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>
            <div className={styles.aiCardText}>
              {aiLoading ? (
                <div className="space-y-3">{[80, 100, 60].map((w, i) => <div key={i} className={styles.skeletonLine} style={{ width: `${w}%` }} />)}</div>
              ) : (
                <p>{aiText}<span className="animate-pulse">|</span></p>
              )}
            </div>
            <div className={styles.aiCardActions}>
              <button type="button" className={styles.regenBtn} onClick={generateAiSummary} disabled={aiLoading}>
                <RotateCw size={14} className={aiLoading ? 'animate-spin' : ''} /> Régénérer
              </button>
              <button type="button" className={cn(styles.regenBtn, 'bg-slate-700/50 shadow-none')} onClick={downloadPdf} disabled={!aiFullText}>
                <Download size={14} /> PDF
              </button>
            </div>
          </div>
          <div className="hidden lg:flex flex-col gap-2 min-w-[180px]">
            <span className={cn(styles.aiPill, styles.aiPillGreen)}>
              <Layers size={12} /> Estran: {fmtCompact(stockTotal)} lignes
            </span>
            <span className={cn(styles.aiPill, varPct >= 0 ? styles.aiPillGreen : styles.aiPillYellow)}>
              <BarChart2 size={12} /> Variance: {varPct.toFixed(1)}%
            </span>
            <span className={cn(styles.aiPill, daPending > 5 ? styles.aiPillRed : styles.aiPillYellow)}>
              <ShoppingCart size={12} /> {daPending} DA en attente
            </span>
          </div>
        </div>
      </motion.section>

      {/* ══════ SECTION 3 — KPI CARDS ══════ */}
      <div className="mb-2">
        <p className={styles.sectionLabel}>Estran</p>
        <motion.div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6" variants={stagger} initial="hidden" animate="visible">
          {kpiDefs.slice(0, 3).map(d => <KpiCard key={d.key} def={d} />)}
        </motion.div>

        <p className={styles.sectionLabel}>Finance</p>
        <motion.div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6" variants={stagger} initial="hidden" animate="visible">
          {kpiDefs.slice(3, 6).map(d => <KpiCard key={d.key} def={d} />)}
        </motion.div>

        <p className={styles.sectionLabel}>Achats</p>
        <motion.div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8" variants={stagger} initial="hidden" animate="visible">
          {kpiDefs.slice(6, 9).map(d => <KpiCard key={d.key} def={d} />)}
        </motion.div>
      </div>

      {/* ══════ SECTION 4 — MINI CHARTS ══════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
        {/* Chart 1: Tendance Rendement */}
        <motion.div className={styles.chartPanel} initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-50px' }} transition={{ duration: 0.5 }}>
          <h3>Tendance Rendement Estran</h3>
          <div style={{ height: 220 }}>
            {rendChartData.length === 0 ? <p className={styles.muted}>Aucune donnée</p> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={rendChartData}>
                  <defs><linearGradient id="tealGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0d9488" stopOpacity={0.4} /><stop offset="100%" stopColor="#0d9488" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                  <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                  <RTooltip content={<ChartTip unit="Kg" />} />
                  <Area dataKey="rendement" name="Rendement" type="monotone" stroke="#0d9488" fill="url(#tealGrad)" strokeWidth={2} isAnimationActive animationDuration={800} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          <button type="button" className={styles.seeMore} onClick={() => navigate('/app/estran')}>voir plus <ChevronRight size={14} /></button>
        </motion.div>

        {/* Chart 2: YTD vs Budget */}
        <motion.div className={styles.chartPanel} initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-50px' }} transition={{ duration: 0.5, delay: 0.1 }}>
          <h3>YTD vs Budget Finance</h3>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={financeTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                <XAxis dataKey="month" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={v => fmtCompact(v)} />
                <RTooltip content={<ChartTip unit="MAD" />} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="ytd" name="Réalisé" fill="#0d9488" radius={[3, 3, 0, 0]} isAnimationActive animationDuration={800} />
                <Bar dataKey="budget" name="Budget" fill="#1e3a5f" radius={[3, 3, 0, 0]} isAnimationActive animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <button type="button" className={styles.seeMore} onClick={() => navigate('/app/finance')}>voir plus <ChevronRight size={14} /></button>
        </motion.div>

        {/* Chart 3: Statut DA/BC */}
        <motion.div className={styles.chartPanel} initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-50px' }} transition={{ duration: 0.5, delay: 0.2 }}>
          <h3>Statut DA / BC</h3>
          <div style={{ height: 220 }} className="flex items-center justify-center relative">
            {achatPieTotal === 0 ? <p className={styles.muted}>Aucune donnée</p> : (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={achatPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value" nameKey="name"
                      isAnimationActive animationDuration={800} label={({ name, value }) => `${name}: ${value}`}>
                      {achatPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <RTooltip />
                  </PieChart>
                </ResponsiveContainer>
                <span className="absolute text-xl font-bold text-slate-200">{achatPieTotal}</span>
              </>
            )}
          </div>
          <button type="button" className={styles.seeMore} onClick={() => navigate('/app/achat')}>voir plus <ChevronRight size={14} /></button>
        </motion.div>
      </div>

      {/* ══════ SECTION 5 — ACTIVITY + ALERTS ══════ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">
        {/* Activity feed (60%) */}
        <motion.div className={cn(styles.chartPanel, 'lg:col-span-3')} initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
          <h3><Activity size={14} className="inline mr-1" />Activité récente</h3>
          {activityQ.isLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className={styles.skeletonLine} style={{ width: '90%' }} />)}</div>
          ) : (
            <motion.div variants={stagger} initial="hidden" animate="visible">
              {(activityQ.data ?? []).slice(0, 8).map((item: ActivityLogEntry) => (
                <motion.div key={item.id} variants={itemSlide} className={styles.activityItem}>
                  <span className={styles.activityAvatar} style={{ background: MODULE_COLORS[item.module] || '#64748b' }}>
                    {initials(item.full_name)}
                  </span>
                  <span className={styles.activityText}>
                    {item.full_name || 'Système'} — {item.action}
                    <span className={cn(styles.moduleBadge, moduleStyle(item.module))}>{item.module}</span>
                  </span>
                  <span className={styles.activityTime}>{timeAgo(item.timestamp)}</span>
                </motion.div>
              ))}
              {!(activityQ.data ?? []).length && <p className={styles.muted}>Aucune activité récente</p>}
            </motion.div>
          )}
        </motion.div>

        {/* Alerts (40%) */}
        <motion.div className={cn(styles.chartPanel, 'lg:col-span-2')} initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.1 }}>
          <h3><AlertTriangle size={14} className="inline mr-1" />Alertes actives</h3>
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-slate-500">
              <CheckCircle size={32} className="text-emerald-400 mb-2" />
              <p className="text-sm">Aucune alerte active — tout est normal</p>
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map((a, i) => (
                <div key={i} className={cn(styles.alertItem, styles[`alert${a.color}`])}>
                  <span>{a.text}</span>
                  <button type="button" className={cn(styles.seeMore, 'ml-2')} onClick={() => navigate(a.href)}>Voir <ChevronRight size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* ══════ SECTION 6 — QUICK ACCESS ══════ */}
      <motion.div className="grid grid-cols-1 md:grid-cols-2 gap-5" variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }}>
        {[
          { title: 'Production Estran', desc: 'Rendement · Stock · Anomalies', meta: `${fmtCompact(stockTotal)} lignes en stock`, href: '/app/estran', icon: Waves, style: 'quickCardTeal' },
          { title: 'Pilotage Financier', desc: 'YTD · Budget · Variances', meta: `Variance: ${varPct.toFixed(1)}%`, href: '/app/finance', icon: BarChart2, style: 'quickCardBlue' },
          { title: 'Gestion des Achats', desc: 'DA · BC · Fournisseurs', meta: `${daPending} DA en attente`, href: '/app/achat', icon: ShoppingCart, style: 'quickCardOrange' },
          { title: 'Assistant Azura', desc: 'Posez vos questions · Rapports PDF', meta: 'Mistral 7B · Local', href: '/app/copilot', icon: Bot, style: 'quickCardPurple' },
        ].map(card => (
          <motion.div
            key={card.title}
            variants={fadeUp}
            whileHover={{ scale: 1.02, boxShadow: '0 12px 40px rgba(0,0,0,0.3)' }}
            whileTap={{ scale: 0.98 }}
            className={cn(styles.quickCard, styles[card.style])}
            onClick={() => navigate(card.href)}
            role="button"
            tabIndex={0}
          >
            <span className={styles.quickCardIcon}><card.icon size={22} /></span>
            <h3 className={styles.quickCardTitle}>{card.title}</h3>
            <p className={styles.quickCardDesc}>{card.desc}</p>
            <p className={styles.quickCardMeta}>{card.meta}</p>
            <ChevronRight size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}
