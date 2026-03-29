import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { EstranKpiSeriesPoint } from '../../api/estran'

const COLORS = ['#00b4d8', '#90e0ef', '#0077b6', '#48cae4', '#0096c7', '#023e8a']

type ChartRow = Record<string, number | string>

function groupSeries(points: EstranKpiSeriesPoint[], kpiKey: string): { rows: ChartRow[]; keys: string[] } {
  const selected = points.filter((p) => p.kpiKey === kpiKey && p.value != null && p.year != null && p.month != null)
  const keySet = new Set<string>()
  const buckets = new Map<string, ChartRow>()

  selected.forEach((p) => {
    const metricKey = p.parc || p.residence || p.origine || 'Global'
    keySet.add(metricKey)
    const x = `${p.year}-${String(p.month).padStart(2, '0')}`
    if (!buckets.has(x)) buckets.set(x, { period: x })
    buckets.get(x)![metricKey] = Number(p.value)
  })

  return {
    rows: Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map((entry) => entry[1]),
    keys: Array.from(keySet),
  }
}

interface Props {
  series: EstranKpiSeriesPoint[]
}

export default function EstranKpiCharts({ series }: Props) {
  const recapture = groupSeries(series, 'recapture_prim')
  const biomasse = groupSeries(series, 'biomasse_recuperee_hc')

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div className="rounded-xl border border-slate-800 p-4">
        <h3 className="font-semibold mb-3">% recapture primaire (annee/mois)</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={recapture.rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
              <XAxis dataKey="period" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip />
              <Legend />
              {recapture.keys.map((k, idx) => (
                <Line key={k} dataKey={k} stroke={COLORS[idx % COLORS.length]} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 p-4">
        <h3 className="font-semibold mb-3">% biomasse recuperee HC (annee/mois)</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={biomasse.rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
              <XAxis dataKey="period" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip />
              <Legend />
              {biomasse.keys.map((k, idx) => (
                <Bar key={k} dataKey={k} fill={COLORS[idx % COLORS.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
