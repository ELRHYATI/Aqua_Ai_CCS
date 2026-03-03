import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  Package,
  FileCheck,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react'
import { api, PurchasePriority, AchatAnomalyRecord } from '../services/apiClient'
import styles from './AchatPage.module.css'

function KPICard({
  title,
  value,
  subtitle,
  variant,
  icon: Icon,
  span = 1,
}: {
  title: string
  value: string
  subtitle?: string
  variant: 'success' | 'warning' | 'danger' | 'neutral'
  icon: React.ElementType
  span?: 1 | 2
}) {
  return (
    <div
      className={`${styles.kpiCard} ${styles[`kpi${variant}`]} ${span === 2 ? styles.kpiSpan2 : ''}`}
    >
      <div className={styles.kpiIcon}>
        <Icon size={span === 2 ? 28 : 22} strokeWidth={1.5} aria-hidden />
      </div>
      <div className={styles.kpiContent}>
        <p className={styles.kpiValue}>{value}</p>
        <h3 className={styles.kpiTitle}>{title}</h3>
        {subtitle && <p className={styles.kpiSubtitle}>{subtitle}</p>}
      </div>
    </div>
  )
}

function PriorityRow({ p }: { p: PurchasePriority }) {
  return (
    <tr>
      <td>
        <span className={p.type === 'da' ? styles.badgeDA : styles.badgeBC}>
          {p.type.toUpperCase()}
        </span>
      </td>
      <td>{p.reference ?? '-'}</td>
      <td>{p.amount != null ? p.amount.toLocaleString('fr-FR') : '-'}</td>
      <td>{p.delay_days}</td>
      <td>{p.status ?? '-'}</td>
      <td>{p.critical_flag ? 'Oui' : 'Non'}</td>
      <td>
        <span
          className={
            p.risk_score > 15
              ? styles.riskHigh
              : p.risk_score > 5
                ? styles.riskMedium
                : styles.riskLow
          }
        >
          {p.risk_score.toFixed(1)}
        </span>
      </td>
      <td>{p.expected_delivery_date ?? '-'}</td>
    </tr>
  )
}

export default function AchatPage() {
  const [showAnomalies, setShowAnomalies] = useState(false)
  const [anomalyMethod, setAnomalyMethod] = useState('isolation_forest')

  const da = useQuery({ queryKey: ['achat', 'da'], queryFn: () => api.getPurchaseDA() })
  const bc = useQuery({ queryKey: ['achat', 'bc'], queryFn: () => api.getPurchaseBC() })
  const priorities = useQuery({
    queryKey: ['achat', 'priorities'],
    queryFn: () => api.getAchatPriorities(),
  })
  const anomalies = useQuery({
    queryKey: ['achat', 'anomalies', anomalyMethod],
    queryFn: () => api.getAchatAnomalies({ limit: 500, method: anomalyMethod }),
    enabled: showAnomalies,
  })

  const daList = da.data ?? []
  const bcList = bc.data ?? []
  const priorityList = priorities.data ?? []

  const daOnTime = daList.filter((x) => (x.delay_days ?? 0) <= 0).length
  const daLate = daList.filter((x) => (x.delay_days ?? 0) > 0).length
  const daLateCritical = daList.filter((x) => (x.delay_days ?? 0) > 0 && x.critical_flag).length

  const bcOnTime = bcList.filter((x) => (x.delay_days ?? 0) <= 0).length
  const bcNonLivre = bcList.filter((x) => (x.delay_days ?? 0) > 0).length
  const bcToMonitor = bcList.filter(
    (x) => (x.delay_days ?? 0) > 0 && !x.critical_flag
  ).length

  const total = daList.length + bcList.length
  const onTimeTotal = daOnTime + bcOnTime
  const complianceRate = total > 0 ? Math.round((onTimeTotal / total) * 100) : 0
  const targetCompliance = 95

  const criticalCount = priorityList.filter((p) => p.risk_score > 15).length
  const watchCount = priorityList.filter((p) => p.risk_score > 5 && p.risk_score <= 15).length
  const okCount = priorityList.filter((p) => p.risk_score <= 5).length

  const avgDelay =
    priorityList.length > 0
      ? (
          priorityList.reduce((s, p) => s + (p.delay_days ?? 0), 0) /
          priorityList.length
        ).toFixed(1)
      : '0'

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>KPI DA & BC Non Livré</h1>
          <p className={styles.subtitle}>
            Suivi des indicateurs de performance sur les demandes d&apos;achat et bons de commande
          </p>
        </div>
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
            className={styles.btnAnomaly}
            onClick={() => setShowAnomalies(!showAnomalies)}
          >
            {showAnomalies ? 'Masquer' : 'Voir anomalies ML'}
          </button>
        </div>
      </header>

      <section className={styles.bentoGrid}>
        <KPICard
          title="DA validés à temps"
          value={`${daOnTime} / ${daList.length}`}
          subtitle={daList.length ? `${Math.round((daOnTime / daList.length) * 100)}%` : '-'}
          variant="success"
          icon={CheckCircle2}
        />
        <KPICard
          title="BC livrés dans les délais"
          value={`${bcOnTime} / ${bcList.length}`}
          subtitle={bcList.length ? `${Math.round((bcOnTime / bcList.length) * 100)}%` : '-'}
          variant="success"
          icon={Package}
        />
        <KPICard
          title="DA en retard"
          value={daLateCritical > 0 ? `${daLateCritical} critiques` : daLate > 0 ? `${daLate} en retard` : '0'}
          subtitle={daLate > 0 && daLateCritical === 0 ? 'À traiter' : undefined}
          variant="danger"
          icon={AlertCircle}
          span={2}
        />
        <KPICard
          title="BC non livrés"
          value={bcToMonitor > 0 ? `${bcToMonitor} à surveiller` : `${bcNonLivre} en attente`}
          subtitle={bcNonLivre > 0 ? 'Suivi requis' : undefined}
          variant="warning"
          icon={Clock}
        />
        <KPICard
          title="Taux de conformité"
          value={`${complianceRate}%`}
          subtitle={`Cible : ${targetCompliance}%`}
          variant={complianceRate >= targetCompliance ? 'success' : 'warning'}
          icon={TrendingUp}
        />
        <KPICard
          title="Délai moyen traitement"
          value={`${avgDelay} jours`}
          subtitle="Cible : 3.0j"
          variant={parseFloat(avgDelay) <= 3 ? 'success' : 'warning'}
          icon={FileCheck}
        />
        <KPICard
          title="Critiques"
          value={String(criticalCount)}
          subtitle="Intervention urgente"
          variant="danger"
          icon={AlertTriangle}
        />
        <KPICard
          title="À surveiller"
          value={String(watchCount)}
          subtitle="Risque de dépassement"
          variant="warning"
          icon={Clock}
        />
        <KPICard
          title="Conformes"
          value={String(okCount)}
          subtitle="Dans les délais"
          variant="success"
          icon={CheckCircle2}
        />
      </section>

      {showAnomalies && (
        <div className={styles.anomaliesSection}>
          <h3>Anomalies DA/BC détectées par ML</h3>
          {anomalies.isFetching ? (
            <p className={styles.muted}>Calcul des anomalies…</p>
          ) : anomalies.data && anomalies.data.length > 0 ? (
            <div className={styles.anomalyTable}>
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Référence</th>
                    <th>Montant</th>
                    <th>Retard (j)</th>
                    <th>Severité</th>
                  </tr>
                </thead>
                <tbody>
                  {anomalies.data.map((a: AchatAnomalyRecord) => (
                    <tr key={`${a.type}-${a.id}`}>
                      <td>{a.type.toUpperCase()}</td>
                      <td>{a.reference ?? '-'}</td>
                      <td>{a.amount != null ? a.amount.toLocaleString('fr-FR') : '-'}</td>
                      <td>{a.delay_days}</td>
                      <td>
                        <span className={styles[`badge${a.severity}`]}>
                          {a.severity}
                        </span>
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

      <section className={styles.tableSection}>
        <h2>Détail des priorités</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Type</th>
                <th>Référence</th>
                <th>Montant</th>
                <th>Retard (j)</th>
                <th>Statut</th>
                <th>Critique</th>
                <th>Risk score</th>
                <th>Livraison prévue</th>
              </tr>
            </thead>
            <tbody>
              {priorities.isLoading && (
                <tr>
                  <td colSpan={8}>Chargement…</td>
                </tr>
              )}
              {priorities.error && (
                <tr>
                  <td colSpan={8} className={styles.error}>
                    {String(priorities.error)}
                  </td>
                </tr>
              )}
              {!priorities.isLoading &&
                !priorities.error &&
                priorityList.map((p) => (
                  <PriorityRow key={`${p.type}-${p.id}`} p={p} />
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
