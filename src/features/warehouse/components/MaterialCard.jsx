import { MATERIAL_TYPES } from '@/shared/constants'
import { formatNumber, formatPrice } from '@/shared/lib/utils'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import { EditableMaterialName } from './EditableMaterialName'
import { MaterialActionsMenu } from './MaterialActionsMenu'
import { PlanFactBadge } from './PlanFactBadge'

export function MaterialCard({ material, onAddStock, onUpdated, plannedInfo }) {
  const isLow = material.min_qty > 0 && Number(material.stock_qty) <= Number(material.min_qty)
  const typeInfo = MATERIAL_TYPES[material.type]
  const canEditName = useCanDo('material:edit_name')
  const isArchived = !!material.archived_at

  return (
    <div className={`bg-surface rounded-2xl border shadow-card p-5 transition-colors
      ${isArchived ? 'border-border opacity-60' : (isLow ? 'border-danger/40' : 'border-border')}`}>
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="min-w-0 flex-1">
          {canEditName ? (
            <EditableMaterialName material={material} onUpdated={onUpdated} />
          ) : (
            <h3 className={`font-bold text-base leading-tight ${isArchived ? 'text-text-muted' : ''}`}>{material.name}</h3>
          )}
          <p className="text-xs text-text-muted mt-0.5">{typeInfo?.label || material.type}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isArchived && (
            <span className="bg-text-muted/15 text-text-muted text-xs font-medium px-2 py-0.5 rounded-full">
              Архив
            </span>
          )}
          {!isArchived && isLow && (
            <span className="bg-danger/15 text-danger text-xs font-medium px-2 py-0.5 rounded-full">
              Мало
            </span>
          )}
          <MaterialActionsMenu material={material} onUpdated={onUpdated} />
        </div>
      </div>

      <div className="mb-1 flex items-baseline gap-1 min-w-0">
        <span
          className={`font-bold font-display tracking-tight truncate ${
            String(formatNumber(material.stock_qty, 1)).length > 9 ? 'text-xl' : 'text-3xl'
          } ${Number(material.stock_qty) < 0 ? 'text-danger' : ''}`}
          title={Number(material.stock_qty) < 0 ? 'Отрицательный остаток — проверьте расходы' : undefined}
        >
          {formatNumber(material.stock_qty, 1)}
        </span>
        <span className="text-sm font-normal text-text-muted font-sans">{material.unit}</span>
      </div>
      <PlanFactBadge plannedInfo={plannedInfo} unit={material.unit} />

      {material.reserved > 0 && (
        <div className="text-xs text-text-muted mt-1 space-y-0.5">
          <p>Зарезервировано: {formatNumber(material.reserved, 1)} {material.unit}</p>
          <p>Доступно: {formatNumber(material.available, 1)} {material.unit}</p>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-text-muted mt-2">
        <span>Мин: {formatNumber(material.min_qty, 1)} {material.unit}</span>
        <span>
          Себест.: {Number(material.unit_cost) > 0
            ? `${formatPrice(material.unit_cost)}/${material.unit}`
            : '—'}
        </span>
      </div>

      {!isArchived && (
        <button
          onClick={() => onAddStock(material)}
          className="mt-3 w-full border border-border bg-surface text-text hover:bg-surface-dim font-medium rounded-xl py-2 text-sm transition-colors"
        >
          + Приход / Расход
        </button>
      )}
    </div>
  )
}
