import { useMemo } from 'react'
import { useMaterials } from '@/features/warehouse/hooks/useMaterials'
import { useWarehouseCategories } from '@/features/warehouse/hooks/useWarehouseCategories'
import { orderFieldMaterials, groupOptions } from '@/features/warehouse/lib/order-material-categories'
import { FILM_TYPES } from '@/shared/constants'
import { formatNumber } from '@/shared/lib/utils'

const SELECT_CLASS = 'w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm min-h-[44px]'

/**
 * Селект плёнки — каждая позиция склада k24_materials (type='film') — отдельная
 * опция. value = material.id; onChange отдаёт { materialId, code } чтобы родитель
 * мог одновременно сохранить film_material_id (R16.1) и legacy film_type.
 *
 * До R16.1 опции группировались по material_code и менеджер видел только
 * агрегированный остаток (например «Глянцевая · 75 м» когда на складе 2 рулона
 * разных брендов). Сейчас каждый рулон виден отдельно — менеджер выбирает
 * конкретный, триггер deduct_materials_from_log списывает с него.
 *
 * Сортировка: позиции с остатком > 0 наверху, затем 0/out-of-stock, внутри —
 * по material_code (если есть) + имени.
 *
 * R25.7B (ТЗ 7.5): список строится по отметкам категорий склада
 * («Показывать при заведении заказа» + поле «Материал печати») и группируется
 * по категориям. Если ни одна категория не отмечена — прежний список по
 * служебному типу 'film'.
 */
export function FilmSelect({ label, value, onChange, includeOutOfStock = false, id, expected }) {
  const { materials } = useMaterials()
  const { categories } = useWarehouseCategories()

  const { options, currentMaterial, grouped } = useMemo(() => {
    const { items: films, grouped: isGrouped } = orderFieldMaterials(
      materials.filter((m) => !m.archived_at), categories, 'print',
    )

    const enriched = films.map((m) => ({
      id: m.id,
      name: m.name,
      code: m.material_code || null,
      unit: m.unit || 'м',
      group: m.group,
      groupRank: m.groupRank,
      stock: Number(m.stock_qty) || 0,
      inStock: (Number(m.stock_qty) || 0) > 0,
    }))

    // current — если value совпадает с id, либо (legacy) с material_code
    let current = enriched.find((o) => o.id === value)
    if (!current && value) {
      current = enriched.find((o) => o.code === value)
    }

    // Если выбранный материал отфильтрован (архивирован/отсутствует) — добавим
    // его как «(нет на складе)» — чтобы UI не теряло выбор.
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

    let result = enriched.filter((o) => o.inStock || includeOutOfStock || (current && current.id === o.id))

    result.sort((a, b) => {
      if (a.inStock !== b.inStock) return a.inStock ? -1 : 1
      // среди inStock — сначала с material_code (понятная типизация), потом без
      if (!!a.code !== !!b.code) return a.code ? -1 : 1
      const codeCmp = (a.code || '').localeCompare(b.code || '')
      if (codeCmp !== 0) return codeCmp
      return a.name.localeCompare(b.name)
    })

    return { options: result, currentMaterial: current || null, grouped: isGrouped }
  }, [materials, categories, value, includeOutOfStock])

  // Прогноз расхода считаем по выбранной позиции (а не по всем G).
  const shortage = (expected != null && currentMaterial)
    ? Math.max(0, expected - currentMaterial.stock)
    : 0

  function renderOption(o) {
    const codeLabel = o.code && FILM_TYPES[o.code]?.label
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
        {options.length === 0 && (
          <option value="" disabled>Нет плёнки на складе</option>
        )}
        {!currentMaterial && options.length > 0 && (
          <option value="" disabled>— выбрать плёнку —</option>
        )}
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
