import type { EstranBase, EstranFiltersResponse } from '../../api/estran'

export interface EstranFilterState {
  base: EstranBase | ''
  year: number | ''
  month: number | ''
  parc: string
  residence: string
  origine: string
}

interface EstranFiltersProps {
  value: EstranFilterState
  options?: EstranFiltersResponse
  onChange: (next: EstranFilterState) => void
}

export default function EstranFilters({ value, options, onChange }: EstranFiltersProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
      <select
        className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
        value={value.base}
        onChange={(e) => onChange({ ...value, base: e.target.value as EstranBase | '' })}
      >
        <option value="">Toutes les bases</option>
        <option value="primaire">Primaire</option>
        <option value="hc">HC</option>
      </select>

      <select
        className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
        value={value.year}
        onChange={(e) => onChange({ ...value, year: e.target.value ? Number(e.target.value) : '' })}
      >
        <option value="">Toutes les annees</option>
        {options?.annees?.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>

      <select
        className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
        value={value.month}
        onChange={(e) => onChange({ ...value, month: e.target.value ? Number(e.target.value) : '' })}
      >
        <option value="">Tous les mois</option>
        {options?.months?.map((m) => (
          <option key={m} value={m}>
            {m.toString().padStart(2, '0')}
          </option>
        ))}
      </select>

      <select
        className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
        value={value.parc}
        onChange={(e) => onChange({ ...value, parc: e.target.value })}
      >
        <option value="">Tous les parcs</option>
        {options?.parcs?.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      <select
        className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
        value={value.residence}
        onChange={(e) => onChange({ ...value, residence: e.target.value })}
      >
        <option value="">Toutes les residences</option>
        {options?.residences?.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>

      <select
        disabled={value.base !== 'hc'}
        className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm disabled:opacity-50"
        value={value.origine}
        onChange={(e) => onChange({ ...value, origine: e.target.value })}
      >
        <option value="">Origine (HC)</option>
        {options?.origines?.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )
}
