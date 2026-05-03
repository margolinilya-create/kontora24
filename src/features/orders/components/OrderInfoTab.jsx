import { useState } from 'react'
import { Link } from 'react-router-dom'
import { OrderEditForm } from './OrderEditForm'
import { OrderAttachments } from './OrderAttachments'
import { OrderComments } from './OrderComments'
import { TechCardActions } from '@/features/techcard/components/TechCardActions'
import { CommercialProposal } from '@/features/kp/components/CommercialProposal'
import { OperationChecklist } from '@/features/production/components/OperationChecklist'
import { ORDER_TYPES } from '@/shared/constants'
import { formatPrice, formatDate, formatDateTime } from '@/shared/lib/utils'
import Spinner from '@/shared/components/Spinner'

function InfoField({ label, value }) {
  return (
    <div>
      <p className="text-text-muted text-xs">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}

function PriceCard({ label, value, highlight }) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? 'bg-accent/10 border border-accent/20' : 'bg-surface-dim'}`}>
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`text-lg font-bold ${highlight ? 'text-accent' : ''}`}>
        {formatPrice(value)}
      </p>
    </div>
  )
}

export function OrderInfoTab({ order, onRecalculate, recalculating, onSaved }) {
  const [showKP, setShowKP] = useState(false)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        {/* Order params */}
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4">Параметры заказа</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <InfoField label="Тип" value={ORDER_TYPES[order.order_type]?.label || order.order_type} />
            <InfoField label="Размер" value={`${order.width_mm} x ${order.height_mm} мм`} />
            <InfoField label="Тираж" value={`${order.qty} шт`} />
            <InfoField label="Кол-во видов" value={order.design_variants || 1} />
            <InfoField label="Ламинация" value={order.need_lam ? (order.lam_type || 'Да') : 'Нет'} />
            <InfoField label="Срок" value={`${order.prod_days || '—'} дн.`} />
            {order.film_type && <InfoField label="Плёнка" value={order.film_type} />}
            {order.stickers_per_pack && <InfoField label="Видов в паке" value={order.stickers_per_pack} />}
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-surface rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Стоимость</h2>
            <button
              onClick={onRecalculate}
              disabled={recalculating}
              className="border border-border text-text hover:bg-surface-dim font-medium rounded-lg px-3 py-1.5 text-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {recalculating && <Spinner size="xs" className="border-current" />}
              Пересчитать
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <PriceCard label="Материалы" value={order.cost_materials} />
            <PriceCard label="Труд" value={order.cost_labor} />
            <PriceCard label="Себестоимость" value={order.cost_total} />
            <PriceCard label="Итого" value={order.price_final} highlight />
          </div>
          <div className="flex gap-6 mt-4 text-sm text-text-muted">
            <span>Наценка: x{order.markup || '—'}</span>
            <span>Скидка: {order.discount_pct ? `${(order.discount_pct * 100).toFixed(0)}%` : '—'}</span>
            <span>За штуку: {formatPrice(order.price_per_unit)}</span>
          </div>
        </div>

        {/* Tech Card */}
        <TechCardActions order={order} />

        {/* KP button */}
        <button
          onClick={() => setShowKP(true)}
          className="border border-border text-text hover:bg-surface-dim font-medium rounded-lg px-4 py-2 text-sm transition-colors"
        >
          Коммерческое предложение
        </button>
        {showKP && <CommercialProposal order={order} onClose={() => setShowKP(false)} />}

        {/* Operations */}
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-3">Операции</h2>
          <OperationChecklist order={order} />
        </div>

        {/* Notes */}
        {order.notes && (
          <div className="bg-surface rounded-xl border border-border p-5">
            <h2 className="font-semibold mb-2">Заметки</h2>
            <p className="text-sm text-text-muted whitespace-pre-wrap">{order.notes}</p>
          </div>
        )}

        {/* Edit */}
        <OrderEditForm order={order} onSaved={onSaved} />

        {/* Attachments */}
        <OrderAttachments orderId={order.id} />

        {/* Comments (production chat) */}
        <OrderComments orderId={order.id} />
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-3">Клиент</h2>
          {order.client ? (
            <div className="text-sm space-y-1">
              <Link to={`/clients/${order.client_id}`} className="font-medium text-accent hover:underline">{order.client.name}</Link>
              {order.client.phone && <p className="text-text-muted">{order.client.phone}</p>}
              {order.client.email && <p className="text-text-muted">{order.client.email}</p>}
            </div>
          ) : (
            <p className="text-sm text-text-muted">Не указан</p>
          )}
        </div>

        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-3">Информация</h2>
          <div className="text-sm space-y-2">
            <InfoField label="Создан" value={formatDateTime(order.created_at)} />
            <InfoField label="Обновлён" value={formatDateTime(order.updated_at)} />
            {order.deadline && <InfoField label="Дедлайн" value={formatDate(order.deadline)} />}
            <InfoField label="Создал" value={order.creator?.display_name || '—'} />
            <InfoField label="Исполнитель" value={order.assignee?.display_name || 'Не назначен'} />
          </div>
        </div>
      </div>
    </div>
  )
}
