import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { RotateCw } from 'lucide-react'
import { api } from '../services/apiClient'
import type { Commentary, VarianceInput } from '../services/apiClient'
import styles from './Dashboard.module.css'

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun']

function KPICard({
  title,
  value,
  subtitle,
  accent,
  loading,
}: {
  title: string
  value: string
  subtitle?: string
  accent: 'red' | 'orange' | 'blue'
  loading?: boolean
}) {
  return (
    <div className={`${styles.kpiCard} ${styles[`kpiCard${accent}`]}`}>
      <h3>{title}</h3>
      {loading ? (
        <p className={styles.kpiValue}>Chargement…</p>
      ) : (
        <>
          <p className={styles.kpiValue}>{value}</p>
          {subtitle && <p className={styles.kpiSubtitle}>{subtitle}</p>}
        </>
      )}
    </div>
  )
}

export default function Dashboard() {
  const [syncError, setSyncError] = useState<string | null>(null)
  const [commentary, setCommentary] = useState<Commentary | null>(null)
  const queryClient = useQueryClient()

  const syncMutation = useMutation({
    mutationFn: () => api.syncOneDrive(),
    onSuccess: () => {
      setSyncError(null)
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['estran'] })
      queryClient.invalidateQueries({ queryKey: ['finance'] })
      queryClient.invalidateQueries({ queryKey: ['achat'] })
      queryClient.invalidateQueries({ queryKey: ['ml'] })
    },
    onError: (err: Error) => setSyncError(err.message),
  })

  const stats = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => api.getDashboardStats(),
  })

  const mlAnalysis = useQuery({
    queryKey: ['ml', 'analysis'],
    queryFn: () => api.getMLAnalysis(),
  })

  const estranAnomalies = useQuery({
    queryKey: ['estran', 'anomalies'],
    queryFn: () => api.getEstranAnomalies({ limit: 200 }),
  })

  const financeLines = useQuery({
    queryKey: ['finance', 'lines'],
    queryFn: () => api.getFinanceLines({ limit: 500 }),
  })

  const da = useQuery({ queryKey: ['achat', 'da'], queryFn: () => api.getPurchaseDA() })
  const bc = useQuery({ queryKey: ['achat', 'bc'], queryFn: () => api.getPurchaseBC() })

  const commentaryMutation = useMutation({
    mutationFn: (data: VarianceInput) => api.postFinanceCommentary(data),
    onSuccess: (data) => setCommentary(data),
  })
  const hasRequestedCommentary = useRef(false)

  const s = stats.data
  const ml = mlAnalysis.data
  const anomalies = estranAnomalies.data ?? []
  const financeData = financeLines.data ?? []

  const estranCritCount = anomalies.filter((a) => a.severity === 'critical').length
  const estranMajCount = anomalies.filter((a) => a.severity === 'major').length
  const estranMinCount = anomalies.filter((a) => a.severity === 'minor').length
  const estranTotal = ml?.anomaly_counts?.estran ?? anomalies.length

  const budget = s?.finance?.budget_vs_real?.budget ?? 0
  const real = s?.finance?.budget_vs_real?.real ?? 0
  const ytd = s?.finance?.budget_vs_real?.ytd ?? real
  const varPct = budget ? ((ytd - budget) / budget) * 100 : 0
  const topDriver = s?.finance?.top_variances?.[0]
  const driverLabel = topDriver?.label ?? topDriver?.code ?? '—'

  const delayedDA = (da.data ?? []).filter((x) => (x.delay_days ?? 0) > 0)
  const delayedBC = (bc.data ?? []).filter((x) => (x.delay_days ?? 0) > 0)
  const delayedTotal = delayedDA.length + delayedBC.length
  const delayedCrit = [...delayedDA, ...delayedBC].filter((x) => x.critical_flag).length
  const delayedWatch = delayedTotal - delayedCrit

  const ytdChartData = MONTHS.map((m, i) => {
    const progress = (i + 1) / 6
    const baseYtd = ytd * progress * 1.05
    const baseBudget = budget * progress
    return {
      month: m,
      ytdReel: Math.round(baseYtd),
      budget: Math.round(baseBudget),
    }
  })

  const varianceTableRows = (s?.finance?.top_variances ?? []).slice(0, 8).map((v) => {
    const line = financeData.find((l) => l.code === v.code)
    const montant = line?.real ?? line?.budget ?? 0
    return {
      entite: v.label || v.code,
      compte: v.code,
      montant,
      variancePct: v.var_pct,
      statut: Math.abs(v.var_pct ?? 0) > 10 ? 'Alerte' : 'OK',
    }
  })

  const handleRegenerateCommentary = () => {
    const data = financeData
    const b = data.reduce((s, l) => s + (l.budget ?? 0), 0)
    const r = data.reduce((s, l) => s + (l.real ?? 0), 0)
    const n1 = data.reduce((s, l) => s + (l.n1 ?? 0), 0)
    const varBr = b - r
    const topDrivers = data
      .filter((l) => (l.var_b_r ?? 0) !== 0)
      .sort((a, b) => Math.abs(b.var_b_r ?? 0) - Math.abs(a.var_b_r ?? 0))
      .slice(0, 3)
      .map((l) => l.label ?? l.code ?? '')
    commentaryMutation.mutate({
      ytd: data.reduce((s, l) => s + (l.ytd ?? 0), 0),
      budget: b,
      n1,
      real: r,
      var_b_r: varBr,
      var_pct: b ? (varBr / b) * 100 : 0,
      top_drivers: topDrivers,
      period_label: 'YTD 12 2025',
    })
  }

  useEffect(() => {
    if (
      !hasRequestedCommentary.current &&
      !commentary &&
      financeData.length > 0 &&
      !commentaryMutation.isPending
    ) {
      hasRequestedCommentary.current = true
      const data = financeData
      const b = data.reduce((s, l) => s + (l.budget ?? 0), 0)
      const r = data.reduce((s, l) => s + (l.real ?? 0), 0)
      const n1 = data.reduce((s, l) => s + (l.n1 ?? 0), 0)
      const varBr = b - r
      const topDrivers = data
        .filter((l) => (l.var_b_r ?? 0) !== 0)
        .sort((a, b) => Math.abs(b.var_b_r ?? 0) - Math.abs(a.var_b_r ?? 0))
        .slice(0, 3)
        .map((l) => l.label ?? l.code ?? '')
      commentaryMutation.mutate({
        ytd: data.reduce((s, l) => s + (l.ytd ?? 0), 0),
        budget: b,
        n1,
        real: r,
        var_b_r: varBr,
        var_pct: b ? (varBr / b) * 100 : 0,
        top_drivers: topDrivers,
        period_label: 'YTD 12 2025',
      })
    }
  }, [commentary, financeData.length])

  const formatNumber = (v: number) =>
    v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : v.toFixed(0)

  return (
    <div className={styles.dashboard}>
      <div className={styles.header}>
        <h1>Dashboard</h1>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.syncBtn}
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending ? 'Sync…' : 'Sync OneDrive'}
          </button>
        </div>
      </div>
      {syncError && <p className={styles.error}>{syncError}</p>}

      <section className={styles.kpiRow}>
        <KPICard
          title="BD Estran - Anomalies"
          value={`${estranTotal} anomalies`}
          subtitle={
            estranTotal > 0
              ? `${estranCritCount} critiques, ${estranMajCount} majeures, ${estranMinCount} mineures`
              : undefined
          }
          accent="red"
          loading={mlAnalysis.isLoading && estranAnomalies.isLoading}
        />
        <KPICard
          title="YTD vs Budget vs N-1"
          value={`${varPct >= 0 ? '+' : ''}${varPct.toFixed(1)}% vs Budget`}
          subtitle={topDriver ? `Principal driver: ${driverLabel} ${(topDriver.var_pct ?? 0) >= 0 ? '+' : ''}${(topDriver.var_pct ?? 0).toFixed(0)}%` : undefined}
          accent="orange"
          loading={stats.isLoading}
        />
        <KPICard
          title="KPI DA & BC Non Livré"
          value={`${delayedTotal} éléments en retard`}
          subtitle={delayedTotal > 0 ? `${delayedCrit} critiques, ${delayedWatch} à surveiller` : undefined}
          accent="blue"
          loading={da.isLoading || bc.isLoading}
        />
      </section>

      <section className={styles.middleRow}>
        <div className={styles.chartPanel}>
          <h3>Évolution YTD vs Budget</h3>
          <div className={styles.chartInner}>
            {stats.isLoading ? (
              <p className={styles.muted}>Chargement…</p>
            ) : ytdChartData.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={ytdChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
                  <XAxis dataKey="month" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} tickFormatter={(v) => formatNumber(v)} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                    formatter={(v: number) => [v.toLocaleString('fr-FR'), '']}
                  />
                  <Legend />
                  <Bar dataKey="ytdReel" name="YTD Réel" fill="#1e40af" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="budget" name="Budget" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className={styles.muted}>Aucune donnée</p>
            )}
          </div>
        </div>

        <div className={styles.commentaryPanel}>
          <h3>Commentaire généré par l&apos;IA</h3>
          {commentaryMutation.isPending ? (
            <p className={styles.muted}>Génération en cours…</p>
          ) : commentary ? (
            <>
              <div className={styles.commentaryContent}>
                {commentary.summary && (
                  <p><strong>Performance globale :</strong> {commentary.summary}</p>
                )}
                {commentary.key_drivers && commentary.key_drivers.length > 0 && (
                  <p><strong>Points d&apos;attention :</strong>{' '}
                    {commentary.key_drivers.slice(0, 2).join('. ')}
                  </p>
                )}
                {estranTotal > 0 && (
                  <p><strong>Anomalies détectées :</strong>{' '}
                    {estranTotal} anomalies identifiées dans la base BD Estran{estranCritCount > 0 ? `, dont ${estranCritCount} critiques nécessitant une action immédiate` : ''}.
                  </p>
                )}
                {commentary.recommendations && commentary.recommendations.length > 0 && (
                  <p><strong>Recommandations :</strong>{' '}
                    {commentary.recommendations.slice(0, 2).join('. ')}
                  </p>
                )}
              </div>
              <button
                type="button"
                className={styles.regenerateBtn}
                onClick={handleRegenerateCommentary}
                disabled={commentaryMutation.isPending}
              >
                <RotateCw className={styles.btnIcon} aria-hidden />
                Regénérer le commentaire
              </button>
            </>
          ) : (
            <p className={styles.muted}>Cliquez pour générer un commentaire à partir des données Finance</p>
          )}
        </div>
      </section>

      <section className={styles.tableSection}>
        <h3>Détail des variances principales</h3>
        <div className={styles.tableWrap}>
          <table className={styles.varianceTable}>
            <thead>
              <tr>
                <th>Entité</th>
                <th>Compte</th>
                <th>Montant</th>
                <th>Variance %</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {stats.isLoading && (
                <tr>
                  <td colSpan={5}>Chargement…</td>
                </tr>
              )}
              {!stats.isLoading &&
                varianceTableRows.map((row, i) => (
                  <tr key={i}>
                    <td>{row.entite}</td>
                    <td>{row.compte}</td>
                    <td>
                      {row.montant != null
                        ? `${row.montant.toLocaleString('fr-FR')} €`
                        : '-'}
                    </td>
                    <td className={row.statut === 'Alerte' ? styles.varPositive : styles.varNegative}>
                      {row.variancePct != null
                        ? `${row.variancePct >= 0 ? '+' : ''}${row.variancePct.toFixed(1)}%`
                        : '-'}
                    </td>
                    <td>
                      <span
                        className={
                          row.statut === 'Alerte'
                            ? styles.badgeAlerte
                            : styles.badgeOk
                        }
                      >
                        {row.statut}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
