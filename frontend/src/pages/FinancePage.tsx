import { useState, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import {
  api,
  Commentary,
  VarianceInput,
  FinanceAnomalyRecord,
  FinanceKpiRow,
  FinanceKpiResponse,
  GlEntry,
} from '../services/apiClient'
import { cn } from '../lib/utils'
import styles from './FinancePage.module.css'

/** Keywords pour matcher les lignes aux KPI (label ou account, insensible à la casse) */
const KPI_LABEL_MATCH: Record<string, string[]> = {
  CA: ["chiffre d'affaires", "ca", "production vendue", "revenus", "ventes"],
  MB: ['marge brute', 'mb', 'marge sur coûts'],
  EBITDA: ['ebitda', 'excédent brut'],
  RN: ['résultat net', 'rn', "résultat de l'exercice"],
}

function aggregateKpiRows(rows: FinanceKpiRow[]): Record<string, { r: number; b: number; n1: number }> {
  const result: Record<string, { r: number; b: number; n1: number }> = {}
  for (const kpi of ['CA', 'MB', 'EBITDA', 'RN']) {
    const keywords = KPI_LABEL_MATCH[kpi]
    const lower = (s: string) => (s ?? '').toLowerCase()
    const matching = rows.filter((r) => {
      const label = lower(r.label ?? '')
      const account = lower(r.account ?? '')
      return keywords.some((kw) => label.includes(kw) || account.includes(kw))
    })
    const r = matching.reduce((s, x) => s + (x.ytd ?? 0), 0)
    const b = matching.reduce((s, x) => s + (x.budget_ytd ?? 0), 0)
    const n1 = matching.reduce((s, x) => s + (x.last_year_ytd ?? 0), 0)
    result[kpi] = { r, b, n1 }
  }
  return result
}

/** Formate un pourcentage avec couleur selon le signe */
function PctCell({ value, divZero }: { value: number | null; divZero?: boolean }) {
  if (divZero) return <span className={styles.muted}>—</span>
  if (value == null) return <span className={styles.muted}>—</span>
  const pct = (value * 100).toFixed(2)
  const isPositive = value > 0
  const isNegative = value < 0
  return (
    <span
      className={
        isPositive
          ? styles.varPositive
          : isNegative
            ? styles.varNegative
            : ''
      }
    >
      {pct}%
    </span>
  )
}

/** Formate un montant */
function AmountCell({ value }: { value: number }) {
  if (value == null || Number.isNaN(value)) return <span className={styles.muted}>—</span>
  return (
    <span>{value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
  )
}

export default function FinancePage() {
  const [year, setYear] = useState<number | undefined>(2026)
  const [source, setSource] = useState<'rapport' | 'bal' | 'gl'>('rapport')
  const [filterCompte, setFilterCompte] = useState('')
  const [filterLibelle, setFilterLibelle] = useState('')
  const [commentary, setCommentary] = useState<Commentary | null>(null)
  const [glCommentary, setGlCommentary] = useState<{ account: string; commentary: string } | null>(null)
  const [showAnomalies, setShowAnomalies] = useState(false)
  const [anomalyMethod, setAnomalyMethod] = useState('isolation_forest')
  const [drillAccount, setDrillAccount] = useState<FinanceKpiRow | null>(null)

  const kpi = useQuery({
    queryKey: ['finance', 'kpi', year, source],
    queryFn: () => api.getFinanceKpi({ year, source }),
  })

  const glEntries = useQuery({
    queryKey: ['finance', 'gl-entries', drillAccount?.account, year],
    queryFn: () => api.getFinanceGlEntries({ account: drillAccount!.account, year }),
    enabled: !!drillAccount,
  })

  const lines = useQuery({
    queryKey: ['finance', 'lines'],
    queryFn: () => api.getFinanceLines({ limit: 100 }),
    enabled: showAnomalies,
  })

  const anomalies = useQuery({
    queryKey: ['finance', 'anomalies', anomalyMethod],
    queryFn: () => api.getFinanceAnomalies({ limit: 500, method: anomalyMethod }),
    enabled: showAnomalies,
  })

  const commentaryMutation = useMutation({
    mutationFn: (data: VarianceInput) => api.postFinanceCommentary(data),
    onSuccess: (data) => {
      setCommentary(data)
      setGlCommentary(null)
    },
  })

  const glCommentaryMutation = useMutation({
    mutationFn: (params: { account: string; year?: number; label?: string }) =>
      api.postFinanceGlCommentary(params),
    onSuccess: (data) => {
      setGlCommentary(data)
      setCommentary(null)
    },
  })

  const handleGenerateCommentary = () => {
    const data = kpi.data
    if (!data) return

    const filteredRows = (data?.rows ?? []).filter((r) => {
      const matchCompte = !filterCompte || (r.account ?? '') === filterCompte
      const matchLibelle = !filterLibelle || (r.label ?? '') === filterLibelle
      return matchCompte && matchLibelle
    })
    const account = filterCompte || (filterLibelle && filteredRows[0] ? filteredRows[0].account : null)

    if (account) {
      glCommentaryMutation.mutate({
        account: account.trim(),
        year,
        label: filterLibelle || undefined,
      })
    } else {
      commentaryMutation.mutate({
        ytd: data.total_ytd,
        budget: data.total_budget_ytd,
        n1: data.total_last_year_ytd,
        real: data.total_ytd,
        var_b_r: (data.total_budget_ytd ?? 0) - data.total_ytd,
        var_pct: data.var_budget_pct != null ? data.var_budget_pct * 100 : 0,
        top_drivers: data.rows
          .filter((r) => (r.var_budget ?? 0) !== 0)
          .sort((a, b) => Math.abs(b.var_budget ?? 0) - Math.abs(a.var_budget ?? 0))
          .slice(0, 3)
          .map((r) => r.label ?? r.account ?? ''),
        period_label: `YTD ${year ?? 'N/A'}`,
      })
    }
  }

  const data: FinanceKpiResponse | undefined = kpi.data
  const allRows: FinanceKpiRow[] = data?.rows ?? []
  const uniqueComptes = [...new Set(allRows.map((r) => r.account ?? '').filter(Boolean))].sort()
  const uniqueLibelles = [...new Set(allRows.map((r) => (r.label ?? '').trim()).filter(Boolean))].sort()
  const rows = allRows.filter((r) => {
    const matchCompte = !filterCompte || (r.account ?? '') === filterCompte
    const matchLibelle = !filterLibelle || (r.label ?? '') === filterLibelle
    return matchCompte && matchLibelle
  })

  const kpiAggregates = useMemo(() => aggregateKpiRows(allRows), [allRows])
  const kpiChartData = useMemo(
    () =>
      (['CA', 'MB', 'EBITDA', 'RN'] as const).map((name) => {
        const agg = kpiAggregates[name]
        return {
          name,
          R: agg?.r ?? 0,
          B: agg?.b ?? 0,
          'N-1': agg?.n1 ?? 0,
        }
      }),
    [kpiAggregates],
  )
  const hasChartData = kpiChartData.some((d) => d.R !== 0 || d.B !== 0 || d['N-1'] !== 0)

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Finance AZURA</h1>
        <div className={styles.headerActions}>
          <select
            className={styles.yearSelect}
            value={year ?? ''}
            onChange={(e) => setYear(e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">Toutes années</option>
            <option value="2026">2026</option>
            <option value="2025">2025</option>
          </select>
          <select
            className={styles.sourceSelect}
            value={source}
            onChange={(e) => setSource(e.target.value as 'rapport' | 'bal' | 'gl')}
            title="Source des données : RAPPORT (CPC), BAL (bilan), GL (Grand Livre)"
          >
            <option value="rapport">MODELE RAPPORT (CPC)</option>
            <option value="bal">BAL MODELE</option>
            <option value="gl">MODELE GL (Grand Livre)</option>
          </select>
          <select
            className={styles.sourceSelect}
            value={filterCompte}
            onChange={(e) => setFilterCompte(e.target.value)}
            title="Filtrer par Compte"
          >
            <option value="">Tous les comptes</option>
            {uniqueComptes.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            className={styles.sourceSelect}
            value={filterLibelle}
            onChange={(e) => setFilterLibelle(e.target.value)}
            title="Filtrer par Libellé"
          >
            <option value="">Tous les libellés</option>
            {uniqueLibelles.map((l) => (
              <option key={l} value={l}>{(l || '').length > 50 ? (l || '').slice(0, 50) + '…' : (l || '')}</option>
            ))}
          </select>
          {showAnomalies && (
            <select
              className={styles.methodSelect}
              value={anomalyMethod}
              onChange={(e) => setAnomalyMethod(e.target.value)}
            >
              <option value="isolation_forest">Isolation Forest</option>
              <option value="lof">LOF</option>
              <option value="one_class_svm">One-Class SVM</option>
              <option value="zscore">Z-Score</option>
            </select>
          )}
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => setShowAnomalies(!showAnomalies)}
          >
            {showAnomalies ? 'Masquer anomalies' : 'Anomalies ML'}
          </button>
          <button
            type="button"
            className={styles.btn}
            onClick={handleGenerateCommentary}
            disabled={
              kpi.isLoading ||
              (glCommentaryMutation.isPending || commentaryMutation.isPending) ||
              (!filterCompte && !filterLibelle && !data?.rows?.length) ||
              (filterLibelle && !filterCompte && rows.length === 0)
            }
          >
            {glCommentaryMutation.isPending || commentaryMutation.isPending
              ? 'Génération…'
              : 'Générer commentaire IA'}
          </button>
        </div>
      </div>

      {/* KPI cards globales - clickable */}
      {data && (
        <div className={styles.kpiCards}>
          {[
            { label: 'Total YTD (R)', value: data.total_ytd, type: 'amount' as const },
            { label: 'Budget YTD (B)', value: data.total_budget_ytd, type: 'amount' as const },
            { label: 'N-1 YTD', value: data.total_last_year_ytd, type: 'amount' as const },
            { label: 'Var vs Budget %', value: data.var_budget_pct, type: 'pct' as const },
            { label: 'Var vs N-1 %', value: data.var_last_year_pct, type: 'pct' as const },
          ].map((k, i) => (
            <button
              key={i}
              type="button"
              className={cn(styles.kpiCard, styles.kpiCardClickable)}
              onClick={() => {
                const tableEl = document.querySelector(`.${styles.tableWrap}`)
                tableEl?.scrollIntoView({ behavior: 'smooth' })
                const firstRow = rows[0]
                if (firstRow) setDrillAccount(firstRow)
              }}
            >
              <span className={styles.kpiLabel}>{k.label}</span>
              <span className={styles.kpiValue}>
                {k.type === 'pct' ? <PctCell value={k.value} /> : <AmountCell value={k.value ?? 0} />}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* KPI Charts: CA, MB, EBITDA, RN - R vs B vs N-1 */}
      {data && hasChartData && (
        <div className={styles.chartsSection}>
          <h3 className={styles.chartsTitle}>KPI Finance — CA, MB, EBITDA, RN</h3>
          <p className={styles.chartsSubtitle}>Réalisé (R), Budget (B), N-1 YTD</p>
          <div className={styles.chartInner}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={kpiChartData} margin={{ top: 12, right: 12, left: 0, bottom: 8 }} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 180, 216, 0.1)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} />
                <YAxis
                  tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                  tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : String(v))}
                />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(17, 25, 32, 0.95)',
                    border: '1px solid rgba(0, 180, 216, 0.2)',
                    borderRadius: '10px',
                  }}
                  formatter={(v: number) => [v.toLocaleString('fr-FR', { minimumFractionDigits: 2 }), '']}
                  labelFormatter={(label) => `KPI: ${label}`}
                />
                <Legend />
                <Bar dataKey="R" name="Réalisé (R)" fill="#00b4d8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="B" name="Budget (B)" fill="#90e0ef" radius={[4, 4, 0, 0]} />
                <Bar dataKey="N-1" name="N-1 YTD" fill="#0077b6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Drill-down panel (GL entries) */}
      <AnimatePresence>
        {drillAccount && (
          <>
            <motion.div
              className={styles.drillOverlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrillAccount(null)}
              aria-hidden
            />
            <motion.div
              className={styles.drillPanel}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.3 }}
            >
              <div className={styles.drillPanelHeader}>
                <h3>Détail GL — {drillAccount.account} {drillAccount.label.slice(0, 30)}</h3>
                <button type="button" className={styles.drillClose} onClick={() => setDrillAccount(null)}>×</button>
              </div>
              <div className={styles.drillPanelContent}>
                {source !== 'gl' && (
                  <p className={styles.muted}>Sélectionnez « MODELE GL » comme source pour voir les écritures.</p>
                )}
                {source === 'gl' && glEntries.isLoading && <p className={styles.muted}>Chargement…</p>}
                {source === 'gl' && glEntries.data && (
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Libellé</th>
                        <th>Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {glEntries.data.entries.length === 0 ? (
                        <tr><td colSpan={3}>Aucune écriture trouvée</td></tr>
                      ) : (
                        glEntries.data.entries.map((e: GlEntry, i: number) => (
                          <tr key={i}>
                            <td>{e.date_str}</td>
                            <td>{e.label.slice(0, 50)}</td>
                            <td>{e.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {showAnomalies && (
        <div className={styles.anomaliesSection}>
          <h3>Anomalies détectées par ML</h3>
          {anomalies.isFetching ? (
            <p className={styles.muted}>Calcul des anomalies…</p>
          ) : anomalies.data && anomalies.data.length > 0 ? (
            <div className={styles.anomalyTable}>
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Label</th>
                    <th>VAR B/R</th>
                    <th>%</th>
                    <th>Severité</th>
                  </tr>
                </thead>
                <tbody>
                  {anomalies.data.map((a: FinanceAnomalyRecord) => (
                    <tr key={a.id}>
                      <td>{a.code}</td>
                      <td>{(a.label ?? '').slice(0, 35)}</td>
                      <td>{a.var_b_r != null ? a.var_b_r.toLocaleString('fr-FR') : '-'}</td>
                      <td>{a.var_pct != null ? `${a.var_pct}%` : '-'}</td>
                      <td>
                        <span className={styles[`badge${a.severity}`]}>{a.severity}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.muted}>Aucune anomalie détectée</p>
          )}
        </div>
      )}

      {(commentary || glCommentary) && (
        <div className={styles.commentary}>
          <h2>Commentaire IA</h2>
          {glCommentary ? (
            <div className={styles.section}>
              <h3>Compte {glCommentary.account}</h3>
              <p className={styles.summary}>{glCommentary.commentary}</p>
            </div>
          ) : commentary ? (
            <>
              <p className={styles.summary}>{commentary.summary}</p>
              {commentary.key_drivers.length > 0 && (
                <div className={styles.section}>
                  <h3>Facteurs clés</h3>
                  <ul>
                    {commentary.key_drivers.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}
              {commentary.recommendations.length > 0 && (
                <div className={styles.section}>
                  <h3>Recommandations</h3>
                  <ul>
                    {commentary.recommendations.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* Tableau principal KPI YTD */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Compte</th>
              <th>Libellé</th>
              <th>YTD (R)</th>
              <th>Budget YTD (B)</th>
              <th>N-1 YTD</th>
              <th>Var vs Budget %</th>
              <th>Var vs N-1 %</th>
            </tr>
          </thead>
          <tbody>
            {kpi.isLoading && (
              <tr>
                <td colSpan={7}>Chargement…</td>
              </tr>
            )}
            {kpi.error && (
              <tr>
                <td colSpan={7} className={styles.error}>
                  {String(kpi.error)}
                </td>
              </tr>
            )}
            {!kpi.isLoading &&
              !kpi.error &&
              rows.map((r, idx) => (
                <tr
                  key={r.account + r.label + idx}
                  className={styles.rowClickable}
                  onClick={() => setDrillAccount(r)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setDrillAccount(r)}
                >
                  <td>{r.account}</td>
                  <td>{(r.label ?? '').slice(0, 45)}</td>
                  <td>
                    <AmountCell value={r.ytd} />
                  </td>
                  <td>
                    <AmountCell value={r.budget_ytd} />
                  </td>
                  <td>
                    <AmountCell value={r.last_year_ytd} />
                  </td>
                  <td>
                    <PctCell value={r.var_budget} divZero={r.var_budget_div_zero} />
                  </td>
                  <td>
                    <PctCell value={r.var_last_year} divZero={r.var_last_year_div_zero} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
