import {
  ORDER_SOURCES, PAYMENT_STATUSES,
  calculateActualMaterialsCost, getFilmCostPerMeter, FILM_TYPES,
  calculateWorkerPayout,
} from '@/shared/constants'
import { formatPrice } from '@/shared/lib/utils'
import { useProductionLogs } from '@/features/production/hooks/useProductionLogs'
import { InfoField } from './InfoField'

/**
 * Финансы заказа: 3 крупных плитки (Итого / Себестоимость / Маржинальность),
 * детали ниже. Себестоимость материалов считается автоматически из production logs
 * (плёнка по типу × MATERIAL_COSTS, смола × RESIN_COST_PER_GRAM). Стоимость труда
 * считается через calculateWorkerPayout — только пост-печатные операции (заливка,
 * выборка, сборка, упаковка). На печать/ламинацию/резку — ручной cost_labor fallback.
 * Доступ — только для admin/manager.
 */
export function FinanceTab({ order }) {
  const { logs } = useProductionLogs(order.id, order.qty)
  const actual = calculateActualMaterialsCost(logs, order.film_type)
  const payout = calculateWorkerPayout(logs)

  const total = Number(order.price_final) || 0
  const manualLabor = Number(order.cost_labor) || 0
  const autoLabor = payout.total
  const labor = autoLabor > 0 ? autoLabor : manualLabor
  const manualMaterials = Number(order.cost_materials) || 0
  const materials = actual.total > 0 ? actual.total : manualMaterials
  const cost = materials + labor
  const margin = total - cost
  const marginPct = total > 0 ? (margin / total) * 100 : 0
  const safeQty = order.qty > 0 ? order.qty : 1
  const pricePerUnit = total / safeQty
  const costPerUnit = cost / safeQty

  return (
    <div className="space-y-6">
      {/* Top: 3 large bento tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-accent text-on-accent rounded-2xl shadow-card p-5">
          <p className="text-sm opacity-70">Итоговая стоимость</p>
          <p className="text-[clamp(1.25rem,3.5vw,1.875rem)] font-bold font-display tracking-tight mt-1 break-words">{formatPrice(total)}</p>
          {order.qty > 0 && (
            <p className="text-xs opacity-70 mt-1">{formatPrice(pricePerUnit)} / шт</p>
          )}
        </div>
        <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
          <p className="text-sm text-text-muted">Себестоимость</p>
          <p className="text-[clamp(1.25rem,3.5vw,1.875rem)] font-bold font-display tracking-tight mt-1 break-words">{formatPrice(cost)}</p>
          <p className="text-xs text-text-muted mt-1">
            {formatPrice(costPerUnit)} / шт
          </p>
          <p className="text-xs text-text-muted mt-0.5">
            Материалы {formatPrice(materials)} + труд {formatPrice(labor)}
            {autoLabor > 0 && <span className="ml-1 text-success">(авто)</span>}
          </p>
        </div>
        <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
          <p className="text-sm text-text-muted">Маржинальность</p>
          <p className={`text-[clamp(1.25rem,3.5vw,1.875rem)] font-bold font-display tracking-tight mt-1 break-words ${margin > 0 ? 'text-success' : margin < 0 ? 'text-danger' : ''}`}>
            {formatPrice(margin)}
          </p>
          {total > 0 && (
            <p className={`text-xs mt-1 ${margin > 0 ? 'text-success' : margin < 0 ? 'text-danger' : 'text-text-muted'}`}>
              {marginPct.toFixed(1)}%
            </p>
          )}
        </div>
      </div>

      {/* Actual materials breakdown */}
      {actual.total > 0 && (
        <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
          <h2 className="font-semibold mb-3">Фактический расход материалов</h2>
          <div className="divide-y divide-border text-sm">
            {Object.entries(actual.films).filter(([k]) => k !== '__lamination__').map(([ft, m]) => (
              <div key={ft} className="py-2 flex items-center justify-between">
                <span className="text-text-muted">{FILM_TYPES[ft]?.label || ft} · {m.toFixed(1)} м</span>
                <span className="font-medium tabular-nums">{Math.round(m * getFilmCostPerMeter(ft))} ₽</span>
              </div>
            ))}
            {actual.films.__lamination__ > 0 && (
              <div className="py-2 flex items-center justify-between">
                <span className="text-text-muted">Ламинация · {actual.films.__lamination__.toFixed(1)} м</span>
                <span className="font-medium tabular-nums">{Math.round(actual.films.__lamination__ * 130)} ₽</span>
              </div>
            )}
            {actual.resinGrams > 0 && (
              <div className="py-2 flex items-center justify-between">
                <span className="text-text-muted">Смола · {actual.resinGrams.toFixed(0)} г</span>
                <span className="font-medium tabular-nums">{Math.round(actual.resinCost)} ₽</span>
              </div>
            )}
          </div>
          {manualMaterials > 0 && Math.abs(manualMaterials - actual.total) > 1 && (
            <p className="text-xs text-text-muted mt-3">
              Ручной cost_materials: {formatPrice(manualMaterials)} (используется фактический расход)
            </p>
          )}
        </div>
      )}

      {/* Payout breakdown — только пост-печать */}
      {autoLabor > 0 && (
        <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
          <h2 className="font-semibold mb-3">Сдельная оплата (пост-печать)</h2>
          <div className="divide-y divide-border text-sm">
            {Object.entries(payout.breakdown).filter(([, v]) => v.count > 0).map(([k, v]) => (
              <div key={k} className="py-2 flex items-center justify-between">
                <span className="text-text-muted">
                  {v.label} · {v.count} шт × {v.rate} ₽
                </span>
                <span className="font-medium tabular-nums">{formatPrice(v.amount)}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-text-muted mt-3">
            Печать / ламинация / резка / дизайн — не учитываются в сдельной оплате.
          </p>
        </div>
      )}

      {/* Details */}
      <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
        <h2 className="font-semibold mb-4 text-lg">Детали</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <InfoField label="Материалы" value={formatPrice(materials)} />
          <InfoField label="Труд" value={formatPrice(labor)} />
          <InfoField label="Цена / шт" value={formatPrice(pricePerUnit)} />
          <InfoField label="Себестоимость / шт" value={formatPrice(costPerUnit)} />
          <InfoField label="Наценка" value={order.markup ? `x${order.markup}` : '—'} />
          <InfoField label="Скидка" value={order.discount_pct ? `${Math.round(order.discount_pct * 100)}%` : '—'} />
        </div>
      </div>

      {/* Deal */}
      <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
        <h2 className="font-semibold text-lg mb-4">Сделка</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          {order.deal_name && <InfoField label="Название сделки" value={order.deal_name} />}
          {order.bitrix_deal_id && <InfoField label="Bitrix ID" value={order.bitrix_deal_id} />}
          <InfoField label="Партнёрский" value={order.is_partner ? 'Да (-25%)' : 'Нет'} />
          <InfoField label="Источник" value={ORDER_SOURCES[order.source]?.label || '—'} />
          {order.source === 'referrer' && order.source_referrer && (
            <InfoField label="Референт" value={order.source_referrer} />
          )}
          <InfoField label="Оплата" value={PAYMENT_STATUSES[order.payment_status]?.label || '—'} />
        </div>
      </div>
    </div>
  )
}
