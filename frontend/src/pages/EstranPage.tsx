import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { AlertTriangle, AlertCircle, Info, Waves } from 'lucide-react'
import { api } from '../services/apiClient'
import type { EstranAnomalyRecord } from '../services/apiClient'
import styles from './EstranPage.module.css'

const SEVERITY_CONFIG: Record<string, { label: string; color: string; desc: string; icon: typeof AlertTriangle }> = {
  critical: {
    label: 'Critique',
    color: '#ef4444',
    desc: 'Action immédiate requise',
    icon: AlertTriangle,
  },
  high: {
    label: 'Critique',
    color: '#ef4444',
    desc: 'Action immédiate requise',
    icon: AlertTriangle,
  },
  major: {
    label: 'Majeure',
    color: '#f97316',
    desc: 'À traiter sous 48h',
    icon: AlertCircle,
  },
  medium: {
    label: 'Majeure',
    color: '#f97316',
    desc: 'À traiter sous 48h',
    icon: AlertCircle,
  },
  minor: {
    label: 'Mineure',
    color: '#eab308',
    desc: 'Surveillance recommandée',
    icon: Info,
  },
  low: {
    label: 'Mineure',
    color: '#eab308',
    desc: 'Surveillance recommandée',
    icon: Info,
  },
}

function SeverityCard({
  severity,
  count,
}: {
  severity: 'critical' | 'major' | 'minor'
  count: number
}) {
  const config = SEVERITY_CONFIG[severity]
  const Icon = config?.icon ?? Info

  return (
    <div className={`${styles.severityCard} ${styles[`severity${severity}`]}`}>
      <div className={styles.severityIcon}>
        <Icon size={24} strokeWidth={2} aria-hidden />
      </div>
      <div className={styles.severityContent}>
        <p className={styles.severityCount}>{count}</p>
        <h3>{config?.label ?? severity}</h3>
        <p className={styles.severityDesc}>{config?.desc ?? ''}</p>
      </div>
    </div>
  )
}

function formatAnomalyId(id: number) {
  return `AN-${String(id).padStart(3, '0')}`
}

function formatDate(dateStr: string | undefined, year?: number, month?: number) {
  if (dateStr) return new Date(dateStr).toLocaleDateString('fr-FR')
  if (year && month) return `${String(month).padStart(2, '0')}/${year}`
  return '-'
}

export default function EstranPage() {
  const [anomalyMethod, setAnomalyMethod] = useState('isolation_forest')

  const records = useQuery({
    queryKey: ['estran', 'records'],
    queryFn: () => api.getEstranRecords({ limit: 500 }),
  })

  const anomalies = useQuery({
    queryKey: ['estran', 'anomalies', anomalyMethod],
    queryFn: () => api.getEstranAnomalies({ limit: 500, method: anomalyMethod }),
  })

  const anomalyList = anomalies.data ?? []
  const criticalCount = anomalyList.filter((a) => a.severity === 'critical' || a.severity === 'high').length
  const majorCount = anomalyList.filter((a) => a.severity === 'major' || a.severity === 'medium').length
  const minorCount = anomalyList.filter((a) => a.severity === 'minor' || a.severity === 'low').length

  const chartData = [
    { name: 'Critiques', value: criticalCount, color: SEVERITY_CONFIG.critical.color },
    { name: 'Majeures', value: majorCount, color: SEVERITY_CONFIG.major.color },
    { name: 'Mineures', value: minorCount, color: SEVERITY_CONFIG.minor.color },
  ].filter((d) => d.value > 0)

  const hasAnomalies = anomalyList.length > 0

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>BD Estran - Détection des anomalies</h1>
          <p className={styles.subtitle}>
            Analyse automatique des données de production par parc, avec alertes par niveau de
            criticité
          </p>
        </div>
        <div className={styles.headerActions}>
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
          <button
            type="button"
            className={styles.btn}
            onClick={() => anomalies.refetch()}
            disabled={anomalies.isFetching}
          >
            {anomalies.isFetching ? 'Analyse…' : 'Actualiser'}
          </button>
        </div>
      </header>

      <section className={styles.summaryRow}>
        <SeverityCard severity="critical" count={criticalCount} />
        <SeverityCard severity="major" count={majorCount} />
        <SeverityCard severity="minor" count={minorCount} />
      </section>

      {anomalies.isFetching ? (
        <div className={styles.loadingState}>
          <Waves className={styles.loadingIcon} aria-hidden />
          <p>Calcul des anomalies en cours…</p>
        </div>
      ) : (
        <section className={styles.mainGrid}>
          <div className={styles.chartPanel}>
            <h2>Répartition par criticité</h2>
            {chartData.length > 0 ? (
              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={4}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} stroke="transparent" />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                      formatter={(v: number, name: string) => [v, name]}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className={styles.emptyChart}>Aucune anomalie à afficher</p>
            )}
          </div>

          <div className={styles.tablePanel}>
            <h2>Liste des anomalies détectées</h2>
            {hasAnomalies ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Type</th>
                      <th>Entité</th>
                      <th>Description</th>
                      <th>Biomasse (GR)</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anomalyList.map((a: EstranAnomalyRecord) => {
                      const rowClass = ['critical', 'high'].includes(a.severity)
                        ? styles.rowcritical
                        : ['major', 'medium'].includes(a.severity)
                          ? styles.rowmajor
                          : styles.rowminor
                      return (
                      <tr key={a.id} className={rowClass}>
                        <td className={styles.mono}>{formatAnomalyId(a.id)}</td>
                        <td>
                          <span
                            className={`${styles.severityBadge} ${styles[`badge${a.severity}`] || ''}`}
                          >
                            {SEVERITY_CONFIG[a.severity]?.label ?? a.severity}
                          </span>
                        </td>
                        <td>{a.parc_semi ?? a.parc_an ?? '-'}</td>
                        <td className={styles.descCell}>
                          {a.explanation ?? `Écart détecté sur parc ${a.parc_semi ?? '-'}`}
                        </td>
                        <td className={styles.numCell}>
                          {a.biomasse_gr != null
                            ? a.biomasse_gr.toLocaleString('fr-FR')
                            : '-'}
                        </td>
                        <td>{formatDate(a.date_recolte, a.year, a.month)}</td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={styles.emptyTable}>Aucune anomalie détectée dans la base Estran</p>
            )}
          </div>
        </section>
      )}

      {!anomalies.isFetching && (
        <section className={styles.recordsSection}>
          <h2>Données BD Estran ({records.data?.length ?? 0} enregistrements)</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Id</th>
                  <th>Parc</th>
                  <th>Ligne</th>
                  <th>Phase</th>
                  <th>Qté récoltée (kg)</th>
                  <th>Biomasse GR</th>
                  <th>Statut</th>
                  <th>Année</th>
                </tr>
              </thead>
              <tbody>
                {records.isLoading && (
                  <tr>
                    <td colSpan={8}>Chargement…</td>
                  </tr>
                )}
                {records.error && (
                  <tr>
                    <td colSpan={8} className={styles.error}>
                      {String(records.error)}
                    </td>
                  </tr>
                )}
                {!records.isLoading &&
                  !records.error &&
                  (records.data ?? []).slice(0, 50).map((r) => (
                    <tr
                      key={r.id}
                      className={
                        anomalyList.some((a) => a.id === r.id) ? styles.anomalyRow : ''
                      }
                    >
                      <td>{r.id}</td>
                      <td>{r.parc_semi ?? '-'}</td>
                      <td>{r.ligne_num ?? '-'}</td>
                      <td>{r.phase ?? '-'}</td>
                      <td>{r.quantite_brute_recoltee_kg ?? '-'}</td>
                      <td>{r.biomasse_gr ?? '-'}</td>
                      <td>{r.statut ?? '-'}</td>
                      <td>{r.year ?? '-'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {(records.data?.length ?? 0) > 50 && (
            <p className={styles.muted}>
              Affichage des 50 premiers enregistrements sur {records.data?.length}
            </p>
          )}
        </section>
      )}
    </div>
  )
}
