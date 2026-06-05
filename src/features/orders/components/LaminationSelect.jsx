import { useMemo } from 'react'
import { useMaterials } from '@/features/warehouse/hooks/useMaterials'
import { LAMINATION_TYPES } from '@/shared/constants'
import { formatNumber } from '@/shared/lib/utils'

const SELECT_CLASS = 'w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm min-h-[44px]'

/**
 * Селект ламинации — per-position опции из k24_materials (type='lam_film').
 * value = material.id; onChange отдаёт { materialId, code } для записи в
 * lam_material_id (R16.1) и legacy lam_type. Спец-опция «Без ламинации» —
 * value=null/'', сбрасывает оба.
 */
export function LaminationSelect({ value, onChange, includeOutOfStock = false, id, expected, label = 'Ламинация / перенос на монтаж' }) {
  const { materials } = useMaterials()

  const { options, currentMaterial } = useMemo(() => {
    const lams = materials.filter((m) => m.type === 'lam_film' && !m.archived_at)
    const enriched = lams.map((m) => ({
      id: m.id,
      name: m.name,
      code: m.material_code || null,
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
          stock: Number(stub.stock_qty) || 0,
          inStock: false,
        }
        enriched.push(current)
      }
    }

    let result = enriched.filter((o) => o.inStock || includeOutOfStock || (current && current.id === o.id))
    result.sort((a, b) => {
      if (a.inStock !== b.inStock) return a.inStock ? -1 : 1
      if (!!a.code !== !!b.code) return a.code ? -1 : 1
      const codeCmp = (a.code || '').localeCompare(b.code || '')
      if (codeCmp !== 0) return codeCmp
      return a.name.localeCompare(b.name)
    })
    return { options: result, currentMaterial: current || null }
  }, [materials, value, includeOutOfStock])

  const shortage = (expected != null && currentMaterial)
    ? Math.max(0, expected - currentMaterial.stock)
    : 0

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
        <option value="">Без ламинации</option>
        {options.map((o) => {
          const codeLabel = o.code && LAMINATION_TYPES[o.code]?.label
          const suffix = codeLabel ? ` · ${codeLabel}` : ''
          return (
            <option key={o.id} value={o.id}>
              {o.name}{suffix} · {formatNumber(o.stock, 1)} м
              {!o.inStock ? ' (нет на складе)' : ''}
            </option>
          )
        })}
      </select>
      {shortage > 0 && (
        <p className="mt-1 text-xs text-danger">
          На складе {formatNumber(currentMaterial.stock, 1)} м, прогноз расхода {formatNumber(expected, 1)} м — не хватает {formatNumber(shortage, 1)} м.
        </p>
      )}
    </div>
  )
}
