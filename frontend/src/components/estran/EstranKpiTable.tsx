import type { EstranKpiItem } from '../../api/estran'

interface Props {
  items: EstranKpiItem[]
}

function formatValue(item: EstranKpiItem): string {
  if (item.value == null) return '-'
  if (item.unit === '%') return `${item.value.toLocaleString('fr-FR')} %`
  return `${item.value.toLocaleString('fr-FR')} ${item.unit}`
}

export default function EstranKpiTable({ items }: Props) {
  return (
    <div className="rounded-xl border border-slate-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-900/90">
          <tr>
            <th className="text-left p-3 text-slate-400">Base</th>
            <th className="text-left p-3 text-slate-400">Nom KPI</th>
            <th className="text-left p-3 text-slate-400">Valeur calculee</th>
            <th className="text-left p-3 text-slate-400">Unite</th>
            <th className="text-left p-3 text-slate-400">Commentaire</th>
          </tr>
        </thead>
        <tbody>
          {items.map((kpi) => (
            <tr key={`${kpi.base}-${kpi.kpiKey}`} className="border-t border-slate-800/80">
              <td className="p-3">{kpi.base}</td>
              <td className="p-3">
                <div className="font-medium">{kpi.label}</div>
                <div className="text-xs text-slate-500 mt-1">Formule: {kpi.formula}</div>
              </td>
              <td className="p-3">
                {formatValue(kpi)}
                {kpi.division_by_zero && <span className="ml-2 text-xs text-amber-400">(division /0)</span>}
              </td>
              <td className="p-3">{kpi.unit}</td>
              <td className="p-3 text-slate-300">{kpi.comment}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
