import { useState, useMemo } from 'react'
import { MATERIAL_CATEGORIES, getMaterialCategory, getStockStatus, MATERIAL_TYPES } from '@/shared/constants'

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'Все категории' },
  ...Object.entries(MATERIAL_CATEGORIES).map(([key, { label }]) => ({ value: key, label })),
]

const STATUS_OPTIONS = [
  { value: 'all', label: 'Все статусы' },
  { value: 'empty', label: 'Закончилось' },
  { value: 'low', label: 'Мало' },
  { value: 'ok', label: 'Достаточно' },
]

/**
 * Табличный вид склада с фильтрами по категории и статусу остатка.
 * При клике по строке — открывает StockModal для ручного прихода/расхода.
 */
export function MaterialsTable({ materials, onSelect }) {
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    return materials.filter((m) => {
      if (!m) return false
      if (category !== 'all' && getMaterialCategory(m) !== category) return false
      if (status !== 'all' && getStockStatus(m).key !== status) return false
      if (search && !(m.name || '').toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [materials, category, status, search])

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по названию"
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border p-12 text-center text-text-muted text-sm">
          Нет материалов под выбранные фильтры
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-border shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-muted bg-surface-dim/50">
                  <th className="px-4 py-2 font-medium">Название</th>
                  <th className="px-4 py-2 font-medium">Категория</th>
                  <th className="px-4 py-2 font-medium text-right">Остаток</th>
                  <th className="px-4 py-2 font-medium text-right">Минимум</th>
                  <th className="px-4 py-2 font-medium">Статус</th>
                  <th className="px-4 py-2 font-medium w-24"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const cat = getMaterialCategory(m)
                  const stStatus = getStockStatus(m)
                  const unit = MATERIAL_TYPES[m.type]?.unit || m.unit || ''
                  const catLabel = (cat && MATERIAL_CATEGORIES[cat]?.label) || '—'
                  return (
                    <tr key={m.id} className="border-b border-border last:border-0 hover:bg-surface-2 transition-colors">
                      <td className="px-4 py-2.5 font-medium">{m.name}</td>
                      <td className="px-4 py-2.5 text-text-muted">{catLabel}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <span className={Number(m.stock_qty) < 0 ? 'text-danger font-medium' : ''}>
                          {Number(m.stock_qty).toFixed(1)}
                        </span>
                        <span className="text-text-muted ml-1">{unit}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-text-muted">
                        {Number(m.min_qty) > 0 ? `${Number(m.min_qty).toFixed(1)} ${unit}` : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stStatus.color}`}>
                          {stStatus.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => onSelect(m)}
                          className="text-xs text-text-muted hover:text-text px-2 py-1 rounded hover:bg-surface-dim transition-colors"
                        >
                          Приход / расход
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
