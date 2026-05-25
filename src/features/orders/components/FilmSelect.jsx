import { useMemo } from 'react'
import { useMaterials } from '@/features/warehouse/hooks/useMaterials'
import { FILM_TYPES } from '@/shared/constants'
import { formatNumber } from '@/shared/lib/utils'

const SELECT_CLASS = 'w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm min-h-[44px]'

/**
 * Селект плёнки, формирующий опции из реальных остатков на складе
 * (бриф 25.05: «выпадающий список из тех, что имеются на складе»).
 *
 * Источник: k24_materials с type='film' и material_code, заполненным
 * миграцией 025 (G/M/Transparent_G/Transparent_M/Holo/Gold/Chrome).
 * Сводим по material_code: один пункт на код, остаток — сумма по позициям.
 *
 * Если значение `value` сейчас выбрано, но его нет на складе (legacy
 * заказ, либо остаток ушёл в 0 пока меняли) — пункт всё равно остаётся,
 * но помечается «(нет на складе)».
 */
export function FilmSelect({ label, value, onChange, includeOutOfStock = false, id }) {
  const { materials } = useMaterials()

  const options = useMemo(() => {
    // Группируем по material_code; ключ — code, значение — суммарный stock
    const stockByCode = {}
    for (const m of materials) {
      if (m.type !== 'film') continue
      if (!m.material_code) continue
      stockByCode[m.material_code] = (stockByCode[m.material_code] || 0) + (Number(m.stock_qty) || 0)
    }

    // Опции — по кодам, которые есть в FILM_TYPES (стабильный порядок и лейблы)
    const result = []
    for (const code of Object.keys(FILM_TYPES)) {
      const stock = stockByCode[code]
      const inStock = stock !== undefined && stock > 0
      if (inStock || includeOutOfStock || code === value) {
        result.push({
          value: code,
          label: FILM_TYPES[code].label,
          stock,
          inStock,
        })
      }
    }
    return result
  }, [materials, value, includeOutOfStock])

  return (
    <div>
      {label && <label className="block text-sm font-medium mb-1" htmlFor={id}>{label}</label>}
      <select
        id={id}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className={SELECT_CLASS}
      >
        {options.length === 0 && (
          <option value="" disabled>Нет плёнки на складе</option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
            {o.stock !== undefined ? ` · ${formatNumber(o.stock, 1)} м` : ''}
            {!o.inStock ? ' (нет на складе)' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
