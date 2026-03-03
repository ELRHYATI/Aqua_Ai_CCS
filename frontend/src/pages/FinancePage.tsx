import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, Commentary, VarianceInput, FinanceAnomalyRecord } from '../services/apiClient'
import styles from './FinancePage.module.css'

export default function FinancePage() {
  const [commentary, setCommentary] = useState<Commentary | null>(null)
  const [showAnomalies, setShowAnomalies] = useState(false)
  const [anomalyMethod, setAnomalyMethod] = useState('isolation_forest')
  const queryClient = useQueryClient()

  const lines = useQuery({
    queryKey: ['finance', 'lines'],
    queryFn: () => api.getFinanceLines({ limit: 100 }),
  })

  const anomalies = useQuery({
    queryKey: ['finance', 'anomalies', anomalyMethod],
    queryFn: () => api.getFinanceAnomalies({ limit: 500, method: anomalyMethod }),
    enabled: showAnomalies,
  })

  const commentaryMutation = useMutation({
    mutationFn: (data: VarianceInput) => api.postFinanceCommentary(data),
    onSuccess: (data) => setCommentary(data),
  })

  const handleGenerateCommentary = () => {
    const data = lines.data ?? []
    const budget = data.reduce((s, l) => s + (l.budget ?? 0), 0)
    const real = data.reduce((s, l) => s + (l.real ?? 0), 0)
    const n1 = data.reduce((s, l) => s + (l.n1 ?? 0), 0)
    const varBr = budget - real
    const varPct = budget ? ((varBr / budget) * 100) : 0
    const topDrivers = data
      .filter((l) => (l.var_b_r ?? 0) !== 0)
      .sort((a, b) => Math.abs(b.var_b_r ?? 0) - Math.abs(a.var_b_r ?? 0))
      .slice(0, 3)
      .map((l) => l.label ?? l.code ?? '')

    commentaryMutation.mutate({
      ytd: data.reduce((s, l) => s + (l.ytd ?? 0), 0),
      budget,
      n1,
      real,
      var_b_r: varBr,
      var_pct: varPct,
      top_drivers: topDrivers,
      period_label: 'YTD 12 2025',
    })
  }

  const data = lines.data ?? []

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Résultat Financier</h1>
        <div className={styles.headerActions}>
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
            {showAnomalies ? 'Masquer' : 'Voir anomalies ML'}
          </button>
          <button
            type="button"
            className={styles.btn}
            onClick={handleGenerateCommentary}
            disabled={lines.isLoading || !data.length}
          >
            Générer commentaire IA
          </button>
        </div>
      </div>

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
                      <td><span className={styles[`badge${a.severity}`]}>{a.severity}</span></td>
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

      {commentary && (
        <div className={styles.commentary}>
          <h2>Commentaire IA</h2>
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
        </div>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Code</th>
              <th>GR</th>
              <th>Label</th>
              <th>Budget</th>
              <th>Réalisé</th>
              <th>N-1</th>
              <th>VAR B/R</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            {lines.isLoading && (
              <tr>
                <td colSpan={8}>Chargement…</td>
              </tr>
            )}
            {lines.error && (
              <tr>
                <td colSpan={8} className={styles.error}>
                  {String(lines.error)}
                </td>
              </tr>
            )}
            {!lines.isLoading &&
              !lines.error &&
              data.map((r) => (
                <tr key={r.id}>
                  <td>{r.code}</td>
                  <td>{r.gr ?? '-'}</td>
                  <td>{(r.label ?? '').slice(0, 40)}</td>
                  <td>{r.budget ?? '-'}</td>
                  <td>{r.real ?? '-'}</td>
                  <td>{r.n1 ?? '-'}</td>
                  <td>{r.var_b_r ?? '-'}</td>
                  <td>{r.var_pct != null ? `${r.var_pct}%` : '-'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
