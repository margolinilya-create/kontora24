import { ORDER_SOURCES, PAYMENT_STATUSES } from '@/shared/constants'
import { formatPrice } from '@/shared/lib/utils'
import { InfoField } from './InfoField'

/**
 * Финансы заказа: 3 крупных плитки сверху (Итого / Себестоимость с трудом / Маржинальность),
 * детали и реквизиты сделки ниже. Доступ — только для admin/manager.
 */
export function FinanceTab({ order }) {
  const total = Number(order.price_final) || 0
  const cost = Number(order.cost_total) || 0
  const margin = total - cost

  return (
    <div className="space-y-6">
      {/* Top: 3 large bento tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-accent text-on-accent rounded-2xl shadow-card p-5">
          <p className="text-sm opacity-70">Итоговая стоимость</p>
          <p className="text-3xl font-bold font-display tracking-tight mt-1">{formatPrice(total)}</p>
        </div>
        <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
          <p className="text-sm text-text-muted">Себестоимость с трудом</p>
          <p className="text-3xl font-bold font-display tracking-tight mt-1">{formatPrice(cost)}</p>
        </div>
        <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
          <p className="text-sm text-text-muted">Маржинальность</p>
          <p className={`text-3xl font-bold font-display tracking-tight mt-1 ${margin > 0 ? 'text-success' : margin < 0 ? 'text-danger' : ''}`}>
            {formatPrice(margin)}
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
        <h2 className="font-semibold mb-4 text-lg">Детали</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <InfoField label="Материалы" value={formatPrice(order.cost_materials)} />
          <InfoField label="Труд" value={formatPrice(order.cost_labor)} />
          <InfoField label="За штуку" value={formatPrice(order.price_per_unit)} />
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
          <InfoField label="Партнёрский" value={order.is_partner ? 'Да (-35%)' : 'Нет'} />
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
