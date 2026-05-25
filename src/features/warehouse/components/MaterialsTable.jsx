import { useMemo } from 'react'
import { MATERIAL_CATEGORIES, getMaterialCategory, getStockStatus, MATERIAL_TYPES } from '@/shared/constants'
import { formatPrice } from '@/shared/lib/utils'
import { WarehouseFilterBar } from './WarehouseFilterBar'

/**
 * Табличный вид склада с фильтрами по категории и статусу остатка.
 * При клике по строке — открывает StockModal для ручного прихода/расхода.
 * Фильтр state приходит снаружи (page-level), чтобы быть общим с другими табами.
 */
export function MaterialsTable({ materials, onSelect, filter, onFilter }) {
  const { category = 'all', status = 'all', search = '' } = filter || {}

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
      <WarehouseFilterBar
        search={search}
        onSearch={(v) => onFilter({ ...filter, search: v })}
        category={category}
        onCategory={(v) => onFilter({ ...filter, category: v })}
        status={status}
        onStatus={(v) => onFilter({ ...filter, status: v })}
      />

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
                  <th className="px-4 py-2 font-medium text-right">Себест.</th>
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
                      <td className="px-4 py-2.5 text-right tabular-nums text-text-muted">
                        {Number(m.unit_cost) > 0 ? `${formatPrice(m.unit_cost)}/${unit}` : '—'}
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
