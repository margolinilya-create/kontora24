import { materialsOfCategory } from '@/features/warehouse/lib/order-material-categories'
import { formatNumber } from '@/shared/lib/utils'

const SELECT_CLASS = 'w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm min-h-[44px]'

/**
 * R25.7B (ТЗ 7.5): дополнительные материалы заказа — по селекту на каждую
 * категорию «Дополнительный материал», чей этап списания есть в маршруте.
 * value / onChange — { [categoryId]: materialId|null }.
 */
export function ExtraMaterialsFields({ extraCategories, materials, value, onChange, idPrefix = 'extra-mat' }) {
  if (!extraCategories?.length) return null
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {extraCategories.map((c) => {
        const selected = value?.[c.id] || ''
        const options = materialsOfCategory(materials, c.id, selected || null)
        const id = `${idPrefix}-${c.id}`
        return (
          <div key={c.id}>
            <label htmlFor={id} className="block text-sm font-medium mb-1">{c.name}</label>
            <select
              id={id}
              value={selected}
              onChange={(e) => onChange({ ...(value || {}), [c.id]: e.target.value || null })}
              className={SELECT_CLASS}
            >
              <option value="">— не нужно —</option>
              {options.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {formatNumber(Number(m.stock_qty) || 0, 1)} {m.unit || ''}
                  {m.archived_at ? ' (в архиве)' : ''}
                </option>
              ))}
            </select>
            {options.length === 0 && (
              <p className="mt-1 text-xs text-text-muted">В категории нет позиций на складе.</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
