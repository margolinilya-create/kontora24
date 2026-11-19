// R25.6 (ТЗ 17.11, Фаза 6.3): блок «Расчёт из калькулятора» во вкладке «Финансы».
// Снимок k24_orders.calc_snapshot читается только через k24_orders_full с
// view:finance (вкладка «Финансы» уже под этим правом). Если стоимость заказа
// отличается от расчёта — оранжевая пометка. «Открыть в калькуляторе»
// восстанавливает расчёт через state роутера (пересчёт по текущим ставкам).
import { useNavigate } from 'react-router-dom'
import Button from '@/shared/components/Button'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import { formatDateTime } from '@/shared/lib/utils'
import { OPTION_LABELS } from '@/features/calculator/lib/calc'
import { calcPriceDiff, restoreCalcState } from '@/features/calculator/lib/calc-to-order'
import { formatInt, formatPrice, formatRub } from '@/features/calculator/lib/copy-text'
import { InfoField } from './InfoField'
import { itemsViewsQty, snapshotViewsChanged } from '../lib/order-variants'

// R27.0: items — виды заказа (k24_order_items). Если тиражи видов отличаются
// от расчёта — пометка «Виды изменены после расчёта»; «Открыть в калькуляторе»
// подставляет текущие виды заказа.
export function CalcSnapshotCard({ order, items = [] }) {
  const navigate = useNavigate()
  const canCalc = useCanDo('view:calculator')
  const snap = order?.calc_snapshot
  if (!snap || typeof snap !== 'object') return null

  const inp = snap.input || {}
  const views = Array.isArray(inp.views) ? inp.views : []
  const options = Object.entries(inp.options || {})
    .filter(([k, on]) => on && OPTION_LABELS[k])
    .map(([k]) => OPTION_LABELS[k])
  const diff = calcPriceDiff(order)
  const baseRestore = restoreCalcState(snap)
  const currentViews = itemsViewsQty(items).filter((q) => q > 0)
  const viewsChanged = snapshotViewsChanged(snap, items)
  const restore = baseRestore && currentViews.length > 0
    ? { ...baseRestore, views: currentViews }
    : baseRestore

  const tirage = views.length > 1
    ? `${formatInt(snap.qty)} шт (${views.map((v, i) => `вид ${i + 1} — ${formatInt(v)}`).join(', ')})`
    : `${formatInt(snap.qty)} шт`

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div className="min-w-0">
          <h2 className="font-semibold text-lg">Расчёт из калькулятора</h2>
          <p className="text-xs text-text-muted">
            {formatDateTime(snap.calculated_at)}
            {snap.calculated_by?.name && ` · ${snap.calculated_by.name}`}
          </p>
        </div>
        {canCalc && restore && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => navigate('/calculator', { state: { calcRestore: restore } })}
          >
            Открыть в калькуляторе
          </Button>
        )}
      </div>

      {diff && (
        <p className="mb-4 rounded-xl border border-warning/50 bg-warning/15 px-3 py-2 text-sm font-medium" role="status">
          Цена изменена вручную: в расчёте {formatRub(diff.calcTotal)}
        </p>
      )}

      {viewsChanged && (
        <p className="mb-4 rounded-xl border border-warning/50 bg-warning/15 px-3 py-2 text-sm font-medium" role="status">
          Виды изменены после расчёта: сейчас {currentViews.map((v) => formatInt(v)).join(' + ')} шт
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <InfoField label="Продукция" value={snap.product_label || '—'} />
        <InfoField label="Размер" value={inp.width_mm && inp.height_mm ? `${inp.width_mm} × ${inp.height_mm} мм` : '—'} />
        <InfoField label="Тираж" value={tirage} />
        <InfoField label="Материал" value={inp.film_name || '—'} />
        <InfoField label="Ламинация" value={inp.options?.lamination ? (inp.lam_name || 'да') : 'нет'} />
        <InfoField label="Опции" value={options.length > 0 ? options.join(', ') : '—'} />
        <InfoField label="Цена за 1 шт" value={snap.price_per_unit != null ? formatPrice(snap.price_per_unit) : '—'} />
        <InfoField label="Итого по расчёту" value={snap.total_rounded != null ? formatRub(snap.total_rounded) : '—'} />
        {snap.cost_total != null && (
          <InfoField label="Себестоимость по расчёту" value={formatRub(snap.cost_total)} />
        )}
        {snap.markup != null && (
          <InfoField label="Наценка по расчёту" value={`×${Number(snap.markup).toFixed(2).replace('.', ',')}`} />
        )}
      </div>
    </div>
  )
}
