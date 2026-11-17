import { useMemo } from 'react'
import { useMaterials } from '@/features/warehouse/hooks/useMaterials'
import { useWarehouseCategories } from '@/features/warehouse/hooks/useWarehouseCategories'
import { orderFieldMaterials, groupOptions } from '@/features/warehouse/lib/order-material-categories'
import { LAMINATION_TYPES } from '@/shared/constants'
import { formatNumber } from '@/shared/lib/utils'

const SELECT_CLASS = 'w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm min-h-[44px]'

/**
 * Селект ламинации — per-position опции из k24_materials (type='lam_film').
 * value = material.id; onChange отдаёт { materialId, code } для записи в
 * lam_material_id (R16.1) и legacy lam_type. Спец-опция «Без ламинации» —
 * value=null/'', сбрасывает оба.
 *
 * R25.4 (ТЗ 4.3): onlyCodes / excludeCodes — фильтр позиций по material_code.
 * Форма заказа исключает 'transfer' (монтажная плёнка — отдельный выбор
 * MontageFilmSelect). Текущее значение показывается всегда (старые заказы).
 *
 * R25.7B (ТЗ 7.5): позиции — по отметкам категорий склада (поле «Ламинация»),
 * сгруппированы по категориям; без отмеченных категорий — по типу 'lam_film'.
 */
export function LaminationSelect({
  value, onChange, includeOutOfStock = false, id, expected, label = 'Ламинация',
  onlyCodes = null, excludeCodes = null, emptyLabel = 'Без ламинации',
}) {
  const { materials } = useMaterials()
  const { categories } = useWarehouseCategories()

  const { options, currentMaterial, grouped } = useMemo(() => {
    const { items: lams, grouped: isGrouped } = orderFieldMaterials(
      materials.filter((m) => !m.archived_at), categories, 'lamination',
    )
    const enriched = lams.map((m) => ({
      id: m.id,
      name: m.name,
      code: m.material_code || null,
      unit: m.unit || 'м',
      group: m.group,
      groupRank: m.groupRank,
      stock: Number(m.stock_qty) || 0,
      inStock: (Number(m.stock_qty) || 0) > 0,
    }))

    let current = enriched.find((o) => o.id === value)
    if (!current && value) {
      current = enriched.find((o) => o.code === value)
    }
    if (value && !current) {
      const stub = materials.find((m) => m.id === value)
      if (stub) {
        current = {
          id: stub.id,
          name: stub.name,
          code: stub.material_code || null,
          unit: stub.unit || 'м',
          group: isGrouped ? 'Текущий выбор' : null,
          groupRank: -1,
          stock: Number(stub.stock_qty) || 0,
          inStock: false,
        }
        enriched.push(current)
      }
    }

    const codeAllowed = (o) => {
      if (onlyCodes && !onlyCodes.includes(o.code)) return false
      if (excludeCodes && o.code && excludeCodes.includes(o.code)) return false
      return true
    }
    const isCurrent = (o) => current && current.id === o.id
    let result = enriched.filter((o) => isCurrent(o) || (codeAllowed(o) && (o.inStock || includeOutOfStock)))
    result.sort((a, b) => {
      if (a.inStock !== b.inStock) return a.inStock ? -1 : 1
      if (!!a.code !== !!b.code) return a.code ? -1 : 1
      const codeCmp = (a.code || '').localeCompare(b.code || '')
      if (codeCmp !== 0) return codeCmp
      return a.name.localeCompare(b.name)
    })
    return { options: result, currentMaterial: current || null, grouped: isGrouped }
  }, [materials, categories, value, includeOutOfStock, onlyCodes, excludeCodes])

  const shortage = (expected != null && currentMaterial)
    ? Math.max(0, expected - currentMaterial.stock)
    : 0

  function renderOption(o) {
    const codeLabel = o.code && LAMINATION_TYPES[o.code]?.label
    const suffix = codeLabel ? ` · ${codeLabel}` : ''
    return (
      <option key={o.id} value={o.id}>
        {o.name}{suffix} · {formatNumber(o.stock, 1)} {o.unit}
        {!o.inStock ? ' (нет на складе)' : ''}
      </option>
    )
  }

  function handleChange(e) {
    const newId = e.target.value || null
    if (!newId) {
      onChange({ materialId: null, code: null })
      return
    }
    const m = options.find((o) => o.id === newId)
    onChange({ materialId: newId, code: m?.code || null })
  }

  return (
    <div>
      {label && <label className="block text-sm font-medium mb-1" htmlFor={id}>{label}</label>}
      <select
        id={id}
        value={currentMaterial?.id || ''}
        onChange={handleChange}
        className={SELECT_CLASS}
      >
        <option value="">{emptyLabel}</option>
        {grouped
          ? groupOptions(options).map((g) => (
            <optgroup key={g.label || '—'} label={g.label || '—'}>
              {g.options.map(renderOption)}
            </optgroup>
          ))
          : options.map(renderOption)}
      </select>
      {shortage > 0 && (
        <p className="mt-1 text-xs text-danger">
          На складе {formatNumber(currentMaterial.stock, 1)} м, прогноз расхода {formatNumber(expected, 1)} м — не хватает {formatNumber(shortage, 1)} м.
        </p>
      )}
    </div>
  )
}
