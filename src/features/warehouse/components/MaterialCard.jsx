import { MATERIAL_TYPES } from '@/shared/constants'
import { formatNumber, formatPrice } from '@/shared/lib/utils'

export function MaterialCard({ material, onAddStock }) {
  const isLow = material.min_qty > 0 && Number(material.stock_qty) <= Number(material.min_qty)
  const typeInfo = MATERIAL_TYPES[material.type]

  return (
    <div className={`bg-surface rounded-xl border p-5 ${isLow ? 'border-danger' : 'border-border'}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold">{material.name}</h3>
          <p className="text-xs text-text-muted">{typeInfo?.label || material.type}</p>
        </div>
        {isLow && (
          <span className="bg-red-100 text-danger text-xs font-medium px-2 py-0.5 rounded-full">
            Мало
          </span>
        )}
      </div>

      <div className="text-3xl font-bold mb-1">
        {formatNumber(material.stock_qty, 1)}
        <span className="text-sm font-normal text-text-muted ml-1">{material.unit}</span>
      </div>

      <div className="flex items-center justify-between text-xs text-text-muted mt-2">
        <span>Мин: {formatNumber(material.min_qty, 1)} {material.unit}</span>
        <span>{formatPrice(material.price_per_unit)}/{material.unit}</span>
      </div>

      <button
        onClick={() => onAddStock(material)}
        className="mt-3 w-full border border-border text-text hover:bg-surface-dim font-medium rounded-lg py-2 text-sm transition-colors"
      >
        + Приход / Расход
      </button>
    </div>
  )
}
