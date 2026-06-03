import { useMemo } from 'react'
import { useMaterials } from '@/features/warehouse/hooks/useMaterials'
import { LAMINATION_TYPES } from '@/shared/constants'
import { formatNumber } from '@/shared/lib/utils'

const SELECT_CLASS = 'w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm min-h-[44px]'

/**
 * Селект ламинации, формирующий опции из реальных остатков на складе
 * (бриф 03.06: «должен выпадать список плёнки, которая есть на складе
 * в категории Плёнка для ламинации»).
 *
 * Источник: k24_materials с type='lam_film' и material_code, заполненным
 * миграцией 025/037 (matte/glossy/transfer). Сводим по material_code:
 * один пункт на код, остаток — сумма по позициям.
 *
 * Если значение `value` сейчас выбрано, но его нет на складе — пункт всё
 * равно остаётся, но помечается «(нет на складе)».
 *
 * Дополнительная опция «Без ламинации» (value=''/null) всегда первая.
 */
export function LaminationSelect({ value, onChange, includeOutOfStock = false, id, expected }) {
  const { materials } = useMaterials()

  const { options, currentStock } = useMemo(() => {
    const stockByCode = {}
    for (const m of materials) {
      if (m.type !== 'lam_film') continue
      if (!m.material_code) continue
      stockByCode[m.material_code] = (stockByCode[m.material_code] || 0) + (Number(m.stock_qty) || 0)
    }

    const result = []
    for (const code of Object.keys(LAMINATION_TYPES)) {
      const stock = stockByCode[code]
      const inStock = stock !== undefined && stock > 0
      if (inStock || includeOutOfStock || code === value) {
        result.push({
          value: code,
          label: LAMINATION_TYPES[code].label,
          stock,
          inStock,
        })
      }
    }
    return { options: result, currentStock: value ? stockByCode[value] : undefined }
  }, [materials, value, includeOutOfStock])

  const shortage = (expected != null && currentStock != null)
    ? Math.max(0, expected - currentStock)
    : 0

  return (
    <div>
      <label className="block text-sm font-medium mb-1" htmlFor={id}>Ламинация / перенос на монтаж</label>
      <select
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={SELECT_CLASS}
      >
        <option value="">Без ламинации</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
            {o.stock !== undefined ? ` · ${formatNumber(o.stock, 1)} м` : ''}
            {!o.inStock ? ' (нет на складе)' : ''}
          </option>
        ))}
      </select>
      {shortage > 0 && (
        <p className="mt-1 text-xs text-danger">
          На складе {formatNumber(currentStock, 1)} м, прогноз расхода {formatNumber(expected, 1)} м — не хватает {formatNumber(shortage, 1)} м.
        </p>
      )}
    </div>
  )
}
