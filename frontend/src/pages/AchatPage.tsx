import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area,
} from 'recharts'
import {
  FileText,
  Package,
  Truck,
  DollarSign,
  Users,
  Layers,
  TrendingUp,
  Clock,
  AlertTriangle,
  Timer,
  Target,
  PackageCheck,
} from 'lucide-react'
import { api } from '../services/apiClient'
import type { AchatSuiviResponse, AchatSuiviRecord } from '../services/apiClient'
import styles from './AchatPage.module.css'

const PENDING_DAYS_THRESHOLD = 5

function isPendingDa(st: string | undefined): boolean {
  if (!st) return false
  const s = st.toLowerCase()
  return s.includes('aucun') || s.includes('en attente') || s.includes('pending')
}

function daysSince(dateStr: string | undefined): number {
  if (!dateStr) return Infinity
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return Infinity
  const now = new Date()
  return Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000))
}

function useAchatAlerts(records: AchatSuiviRecord[]) {
  return useMemo(() => {
    const pendingOver5: AchatSuiviRecord[] = []
    let maxValeur = 0
    for (const r of records) {
      if (isPendingDa(r.statut_da) && daysSince(r.date_creation_da) > PENDING_DAYS_THRESHOLD) {
        pendingOver5.push(r)
      }
      if (r.valeur != null && r.valeur > maxValeur) maxValeur = r.valeur
    }
    const uniqueDaPending = new Set(pendingOver5.map((r) => r.id_da)).size
    return { pendingOver5, countPendingDa: uniqueDaPending }
  }, [records])
}

const CHART_TOOLTIP_STYLE = {
  background: 'rgba(17,25,32,0.95)',
  border: '1px solid rgba(0,180,216,0.2)',
  borderRadius: '10px',
  fontSize: '0.82rem',
}

const PIE_COLORS = ['#00b4d8', '#22d3a8', '#fbbf24', '#ef4444', '#a78bfa', '#f97316']

function KpiCard({ icon: Icon, label, value, sub, accent = 'aqua' }: {
  icon: typeof FileText; label: string; value: string | number; sub?: string; accent?: string
}) {
  const accentClass = styles[`kpi_${accent}`] || ''
  return (
    <div className={`${styles.kpiCard} ${accentClass}`}>
      <div className={styles.kpiIcon}><Icon size={22} strokeWidth={1.5} /></div>
      <div>
        <p className={styles.kpiValue}>{value}</p>
        <p className={styles.kpiLabel}>{label}</p>
        {sub && <p className={styles.kpiSub}>{sub}</p>}
      </div>
    </div>
  )
}

function formatNum(v: number) {
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`
  return v.toLocaleString('fr-FR')
}

function formatPct(v: number | null | undefined) {
  if (v == null) return '—'
  return `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
}

export default function AchatPage() {
  const [tab, setTab] = useState<'overview' | 'detail'>('overview')

  const { data, isLoading, error } = useQuery({
    queryKey: ['achat', 'suivi'],
    queryFn: () => api.getAchatSuivi(),
  })

  const { data: dashboardStats } = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => api.getDashboardStats(),
    enabled: !!data,
  })

  const summary = data?.summary
  const kpis = data?.kpis
  const records = data?.records ?? []
  const { countPendingDa } = useAchatAlerts(records)
  const budget = dashboardStats?.finance?.budget_vs_real?.budget ?? 0
  const budgetExceeded = budget > 0 && (summary?.valeur_totale ?? 0) > budget

  // Prepare chart data
  const statutCdeData = kpis
    ? Object.entries(kpis.statut_cde).map(([name, value]) => ({ name: name.length > 25 ? name.slice(0, 22) + '…' : name, value }))
    : []

  const capexOpexData = kpis
    ? Object.entries(kpis.capex_opex).map(([name, d]) => ({ name, count: d.count, valeur: d.valeur }))
    : []

  const timelineData = kpis?.timeline ?? []
  const topCategories = kpis?.top_categories?.slice(0, 10) ?? []
  const topFournisseurs = kpis?.top_fournisseurs?.slice(0, 10) ?? []

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <p>Chargement des données Suivi Global CCS…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.errorBox}>
          <p>Erreur lors du chargement: {String(error)}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      {countPendingDa > 0 && (
        <div className={styles.alertBanner} role="alert">
          <AlertTriangle size={20} aria-hidden />
          <span>
            {countPendingDa} DA{countPendingDa > 1 ? 's' : ''} en attente depuis plus de {PENDING_DAYS_THRESHOLD} jours
          </span>
        </div>
      )}

      {budgetExceeded && (
        <div className={styles.alertBannerBudget} role="alert">
          <AlertTriangle size={20} aria-hidden />
          <span>
            La valeur totale des achats ({formatNum(summary?.valeur_totale ?? 0)} DH) dépasse le budget ({formatNum(budget)} DH)
          </span>
        </div>
      )}

      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Suivi Achats & Approvisionnements</h1>
          <p className={styles.subtitle}>
            Données issues de Suivi Global CCS — {summary?.total_lignes ?? 0} lignes
          </p>
        </div>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'overview' ? styles.tabActive : ''}`}
            onClick={() => setTab('overview')}
          >
            Vue d'ensemble
          </button>
          <button
            className={`${styles.tab} ${tab === 'detail' ? styles.tabActive : ''}`}
            onClick={() => setTab('detail')}
          >
            Détail ({records.length})
          </button>
        </div>
      </header>

      {/* ===== KPI CARDS ===== */}
      <section className={styles.kpiGrid}>
        <KpiCard icon={FileText} label="Total DA" value={summary?.total_da ?? 0} accent="aqua" />
        <KpiCard icon={Clock} label="DA en cours" value={summary?.da_en_cours ?? 0} sub="Sans commande" accent="orange" />
        <KpiCard icon={Package} label="BC en cours" value={summary?.bc_en_cours ?? 0} sub="En livraison / approbation" accent="blue" />
        <KpiCard icon={Truck} label="BC livrées" value={summary?.bc_livrees ?? 0} accent="green" />
        <KpiCard
          icon={Timer}
          label="Délai moyen traitement DA"
          value={summary?.delai_moyen_traitement_da_jours != null ? `${summary.delai_moyen_traitement_da_jours} j` : '—'}
          sub={
            summary?.delai_traitement_da_echantillon_n
              ? `Création BC − création DA · n=${summary.delai_traitement_da_echantillon_n} lignes`
              : 'Dates DA + BC requises'
          }
          accent="teal"
        />
        <KpiCard
          icon={Target}
          label="Taux OTD (BC)"
          value={formatPct(summary?.taux_otd_pct)}
          sub={
            summary?.bc_otd_echantillon_n
              ? `À l’heure si réception ≤ début livraison promis · n=${summary.bc_otd_echantillon_n}`
              : 'Réception + date livraison requises'
          }
          accent="purple"
        />
        <KpiCard
          icon={PackageCheck}
          label="Taux OTIF (BC)"
          value={formatPct(summary?.taux_otif_pct)}
          sub={
            summary?.bc_otif_echantillon_n
              ? `À l’heure + qté reçue ≥ qté commandée · n=${summary.bc_otif_echantillon_n}`
              : 'Promesse + qtés DA/BC requises'
          }
          accent="green"
        />
        <KpiCard icon={DollarSign} label="Valeur totale" value={formatNum(summary?.valeur_totale ?? 0) + ' DH'} accent="purple" />
        <KpiCard icon={Users} label="Fournisseurs" value={summary?.fournisseurs ?? 0} accent="aqua" />
        <KpiCard icon={Layers} label="Catégories" value={summary?.categories ?? 0} accent="teal" />
        <KpiCard icon={TrendingUp} label="Lignes" value={summary?.total_lignes ?? 0} accent="blue" />
      </section>

      <p className={styles.kpiLegend}>
        <strong>OTD</strong> (On Time Delivery) : part des lignes avec réception au plus tard à la{' '}
        <em>date de début de livraison</em> indiquée.{' '}
        <strong>OTIF</strong> (On Time In Full) : part des lignes livrées à l’heure <em>et</em> en quantité complète (
        réception ≥ commande). Calculs issus du fichier Suivi Global CCS.
      </p>

      {tab === 'overview' ? (
        <>
          {/* ===== ROW 1: Statut BC + Capex/Opex ===== */}
          <section className={styles.chartsRow}>
            <div className={styles.chartCard}>
              <h2>Statut des Commandes (BC)</h2>
              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={statutCdeData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={95}
                      paddingAngle={3}
                      dataKey="value"
                      nameKey="name"
                    >
                      {statutCdeData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="transparent" />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: '0.78rem' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={styles.chartCard}>
              <h2>Capex vs Opex</h2>
              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={capexOpexData} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" tick={{ fill: '#7d92a8', fontSize: 12 }} />
                    <YAxis tick={{ fill: '#7d92a8', fontSize: 11 }} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    <Bar dataKey="count" name="Lignes" fill="#00b4d8" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="valeur" name="Valeur (DH)" fill="#22d3a8" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* ===== ROW 2: Timeline ===== */}
          <section className={styles.fullCard}>
            <h2>Évolution mensuelle — DA créées vs BC créées</h2>
            <div className={styles.chartWrap}>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={timelineData}>
                  <defs>
                    <linearGradient id="gradDA" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00b4d8" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#00b4d8" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradBC" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22d3a8" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22d3a8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="month" tick={{ fill: '#7d92a8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#7d92a8', fontSize: 11 }} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Area type="monotone" dataKey="da_created" name="DA créées" stroke="#00b4d8" fill="url(#gradDA)" strokeWidth={2} />
                  <Area type="monotone" dataKey="bc_created" name="BC créées" stroke="#22d3a8" fill="url(#gradBC)" strokeWidth={2} />
                  <Legend wrapperStyle={{ fontSize: '0.78rem' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* ===== ROW 3: Top Categories + Top Fournisseurs ===== */}
          <section className={styles.chartsRow}>
            <div className={styles.chartCard}>
              <h2>Top Catégories (par valeur)</h2>
              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={topCategories} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis type="number" tick={{ fill: '#7d92a8', fontSize: 11 }} />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={140}
                      tick={{ fill: '#7d92a8', fontSize: 10 }}
                    />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => formatNum(v) + ' DH'} />
                    <Bar dataKey="valeur" name="Valeur (DH)" fill="#00b4d8" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={styles.chartCard}>
              <h2>Top Fournisseurs (par valeur)</h2>
              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={topFournisseurs} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis type="number" tick={{ fill: '#7d92a8', fontSize: 11 }} />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={140}
                      tick={{ fill: '#7d92a8', fontSize: 10 }}
                    />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => formatNum(v) + ' DH'} />
                    <Bar dataKey="valeur" name="Valeur (DH)" fill="#22d3a8" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* ===== ROW 4: KPIs par demandeur ===== */}
          {kpis?.by_demandeur && kpis.by_demandeur.length > 0 && (
            <section className={styles.fullCard}>
              <h2>KPIs par demandeur</h2>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Demandeur</th>
                      <th>Lignes</th>
                      <th>DA créées</th>
                      <th>Sans BC</th>
                      <th>BC en approbation</th>
                      <th>BC confirmées</th>
                      <th>BC envoyées</th>
                      <th>Livrées</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpis.by_demandeur.map((d) => (
                      <tr key={d.name}>
                        <td className={styles.demandeurCell}>{d.name}</td>
                        <td>{d.count}</td>
                        <td>{d.statut_da["Commande d'achat créée"] ?? 0}</td>
                        <td>{d.statut_da["Aucun document lié"] ?? 0}</td>
                        <td>{d.statut_cde["En cours d'approbation"] ?? 0}</td>
                        <td>{d.statut_cde["Confirmation reçue"] ?? 0}</td>
                        <td>{d.statut_cde["Envoyé"] ?? 0}</td>
                        <td>{d.statut_cde["Document lié créé"] ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      ) : (
        /* ===== DETAIL TAB ===== */
        <section className={styles.fullCard}>
          <h2>Détail des lignes ({records.length})</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>ID DA</th>
                  <th>Date DA</th>
                  <th>Produit</th>
                  <th>Catégorie</th>
                  <th>Statut DA</th>
                  <th>ID BC</th>
                  <th>Date BC</th>
                  <th>Statut BC</th>
                  <th>Valeur</th>
                  <th>Fournisseur</th>
                  <th>BL</th>
                  <th>Réception</th>
                  <th>Facture</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => {
                  const isPendingOld = isPendingDa(r.statut_da) && daysSince(r.date_creation_da) > PENDING_DAYS_THRESHOLD
                  return (
                  <tr key={i} className={isPendingOld ? styles.rowAlert : ''}>
                    <td>
                      <span className={styles.typeCell}>
                        <span className={`${styles.typeBadge} ${r.capex_opex === 'Capex' ? styles.badgeCapex : styles.badgeOpex}`}>
                          {r.capex_opex}
                        </span>
                        {isPendingOld && (
                        <span className={styles.pendingBadge} title={`En attente depuis ${daysSince(r.date_creation_da)} jours`}>
                          &gt;{PENDING_DAYS_THRESHOLD}j
                        </span>
                        )}
                      </span>
                    </td>
                    <td className={styles.mono}>{r.id_da ?? '-'}</td>
                    <td>{r.date_creation_da ? new Date(r.date_creation_da).toLocaleDateString('fr-FR') : '-'}</td>
                    <td className={styles.prodCell}>{(r.produit ?? '-').slice(0, 30)}</td>
                    <td>{(r.categorie ?? '-').slice(0, 20)}</td>
                    <td>{(r.statut_da ?? '-').slice(0, 20)}</td>
                    <td className={styles.mono}>{r.id_cde ?? '-'}</td>
                    <td>{r.date_creation_bc ? new Date(r.date_creation_bc).toLocaleDateString('fr-FR') : '-'}</td>
                    <td>{(r.statut_cde ?? '-').slice(0, 20)}</td>
                    <td className={styles.valCell}>{r.valeur != null ? formatNum(r.valeur) : '-'}</td>
                    <td>{(r.fournisseur ?? '-').slice(0, 20)}</td>
                    <td>{r.bl === 'Oui' ? '✓' : '-'}</td>
                    <td>{r.date_reception ? new Date(r.date_reception).toLocaleDateString('fr-FR') : '-'}</td>
                    <td>{r.facture === 'Oui' ? '✓' : r.facture === 'Non' ? '✗' : '-'}</td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
