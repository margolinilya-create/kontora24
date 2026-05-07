import { useState, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useOrderDetail } from '../hooks/useOrders'
import { InfoField } from '../components/InfoField'
import { EditableField } from '../components/EditableField'
import { AdminOrderEditor } from '../components/AdminOrderEditor'
import { StatusSwitcher } from '../components/StatusSwitcher'
import { OrderTimeline } from '../components/OrderTimeline'
import { OrderComments } from '../components/OrderComments'
import { OrderStageInput } from '../components/OrderStageInput'
import { TechCardActions } from '@/features/techcard/components/TechCardActions'
import { StickerActions } from '@/features/techcard/components/StickerActions'
import { Skeleton } from '@/shared/components/Skeleton'
import Button from '@/shared/components/Button'
import {
  ORDER_TYPES, FILM_TYPES, LAMINATION_TYPES, DELIVERY_TYPES,
  ORDER_SOURCES, PAYMENT_STATUSES, DESIGN_STATUSES, PRIORITIES,
} from '@/shared/constants'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { formatPrice } from '@/shared/lib/utils'
import { toast } from '@/shared/stores/toast-store'

export default function OrderDetailPage() {
  const { id } = useParams()
  const { order, history, loading, refetch } = useOrderDetail(id)
  const { hasRole, realRole } = useAuth()
  const isFinance = hasRole(['admin', 'manager'])
  const isAdmin = realRole === 'admin'
  const [editing, setEditing] = useState(false)
  const [showTechCard, setShowTechCard] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showProductionSticker, setShowProductionSticker] = useState(false)
  const [showDeliverySticker, setShowDeliverySticker] = useState(false)

  const techCardRef = useRef(null)
  const productionStickerRef = useRef(null)
  const deliveryStickerRef = useRef(null)
  const historyRef = useRef(null)

  const scrollToRef = useCallback((ref) => {
    setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
  }, [])


  function copySourceLink() {
    if (order.mockup_path) {
      navigator.clipboard.writeText(order.mockup_path)
      toast.success('Ссылка скопирована')
      return
    }
    toast.error('Нет ссылки на файлы')
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="bg-surface rounded-2xl border border-border shadow-card p-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-28" />
              </div>
            ))}
          </div>
        </div>
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-2">Заказ не найден</h2>
        <Link to="/orders" className="text-text hover:text-accent transition-colors underline decoration-text-muted/40 hover:decoration-accent">← К списку заказов</Link>
      </div>
    )
  }

  const clientName = order.client?.name || '—'
  const managerName = order.creator?.display_name || '—'
  const orderDate = order.created_at ? new Date(order.created_at).toLocaleDateString('ru-RU') : '—'

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link to="/orders" className="text-text-muted hover:text-text transition-colors text-sm inline-block">
        ← Назад к списку
      </Link>

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3 flex-wrap">
            <span>ORD-{String(order.number).padStart(4, '0')}</span>
            {order.priority && order.priority !== 'normal' && (
              <span className={`text-sm px-2 py-0.5 rounded-full font-medium ${PRIORITIES[order.priority]?.color}`}>
                {PRIORITIES[order.priority]?.label}
              </span>
            )}
            <span className="text-text-muted">—</span>
            <span>{clientName}</span>
          </h1>
          <p className="text-text-muted text-sm mt-1">
            Менеджер: {managerName}
          </p>
          <p className="inline-block bg-surface border border-border text-text-muted font-medium text-sm px-3 py-1 rounded-lg mt-2">
            {orderDate}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <Button variant={editing ? 'primary' : 'secondary'} onClick={() => setEditing(!editing)}>
              {editing ? 'Закрыть редактор' : 'Редактировать'}
            </Button>
          )}
          <Button variant="secondary" onClick={() => { setShowTechCard(v => { if (!v) scrollToRef(techCardRef); return !v }) }}>
            Тех. карта
          </Button>
          <Button variant="secondary" onClick={() => { setShowProductionSticker(v => { if (!v) scrollToRef(productionStickerRef); return !v }) }}>
            В производство
          </Button>
          <Button variant="secondary" onClick={() => { setShowDeliverySticker(v => { if (!v) scrollToRef(deliveryStickerRef); return !v }) }}>
            На выдачу
          </Button>
          <Button variant="secondary" onClick={() => { setShowHistory(v => { if (!v) scrollToRef(historyRef); return !v }) }}>
            История
          </Button>
          <StatusSwitcher order={order} onUpdated={refetch} />
        </div>
      </div>

      {/* Order progress timeline */}
      <OrderTimeline order={order} history={history} />

      {/* Admin edit mode */}
      {editing && isAdmin && (
        <AdminOrderEditor
          order={order}
          onSaved={() => { setEditing(false); refetch() }}
          onCancel={() => setEditing(false)}
        />
      )}

      {/* Source files link (internal disk) */}
      <div className="bg-surface rounded-2xl border border-border shadow-card p-4 flex items-center gap-3">
        <span className="text-sm text-text-muted">Исходные файлы:</span>
        {order.mockup_path ? (
          <a
            href={order.mockup_path}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-text hover:text-accent transition-colors truncate flex-1 underline decoration-text-muted/40 hover:decoration-accent"
          >
            {order.mockup_path}
          </a>
        ) : (
          <span className="text-sm text-text-muted flex-1">Нет ссылки</span>
        )}
        <Button variant="secondary" size="sm" onClick={copySourceLink}>
          Копировать
        </Button>
      </div>

      {/* Order info */}
      <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
        <h2 className="font-semibold mb-4 text-lg">Информация о заказе</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <InfoField label="Тип" value={ORDER_TYPES[order.order_type]?.label || order.order_type} />
          <InfoField label="Размер" value={`${order.width_mm} x ${order.height_mm} мм`} />
          <InfoField label="Тираж" value={`${order.qty} шт`} />
          <InfoField label="Плёнка" value={FILM_TYPES[order.film_type]?.label || order.film_type || '—'} />
          <InfoField label="Ламинация" value={LAMINATION_TYPES[order.lam_type]?.label || 'Нет'} />
          <InfoField label="Кол-во видов" value={order.design_variants || 1} />
          {(order.order_type === 'stickerpack' || order.order_type === 'stickerpack3D') && order.stickers_per_pack && (
            <InfoField label="Стикеров в паке" value={order.stickers_per_pack} />
          )}
          <InfoField label="Дизайн" value={DESIGN_STATUSES[order.design_status]?.label || '—'} />
          <InfoField label="Срок сдачи" value={order.deadline ? new Date(order.deadline).toLocaleDateString('ru-RU') : '—'} />
        </div>

        {/* Flags */}
        {(order.is_urgent || order.needs_montage_film || order.needs_individual_cut || order.bopp_bag) && (
          <div className="flex flex-wrap gap-2 mt-4">
            {order.is_urgent && <span className="text-xs px-2 py-1 rounded-full bg-danger/10 text-danger font-medium">Срочно</span>}
            {order.needs_montage_film && <span className="text-xs px-2 py-1 rounded-full bg-surface-dim text-text-muted font-medium">Монтажная плёнка</span>}
            {order.needs_individual_cut && <span className="text-xs px-2 py-1 rounded-full bg-surface-dim text-text-muted font-medium">Индивид. резка</span>}
            {order.bopp_bag && <span className="text-xs px-2 py-1 rounded-full bg-surface-dim text-text-muted font-medium">БОПП пакет</span>}
          </div>
        )}

        {/* Notes */}
        {order.notes && (
          <div className="mt-4">
            <p className="text-xs text-text-muted uppercase mb-1">Заметки</p>
            <div className="bg-surface-dim rounded-lg p-3 text-sm whitespace-pre-wrap">{order.notes}</div>
          </div>
        )}

        {/* Editable production fields */}
        <h3 className="font-semibold mt-6 mb-3">Производственные данные</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <EditableField
            label="Напечатано (м)"
            field="printed_meters"
            order={order}
            onSaved={refetch}
          />
          <EditableField
            label="Потрачено смеси"
            field="resin_used"
            order={order}
            onSaved={refetch}
          />
          <EditableField
            label="Брак (шт)"
            field="rejected_qty"
            order={order}
            onSaved={refetch}
          />
          <EditableField
            label="Напечатано (шт)"
            field="printed_qty"
            order={order}
            onSaved={refetch}
          />
        </div>
      </div>

      {/* Stage input for production workers */}
      <OrderStageInput order={order} onUpdated={refetch} />

      {/* Delivery */}
      <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
        <h2 className="font-semibold text-lg mb-4">Отгрузка</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <InfoField label="Получение" value={DELIVERY_TYPES[order.delivery_type]?.label || 'Самовывоз'} />
          {order.delivery_type === 'delivery' && (
            <>
              {order.delivery_city && <InfoField label="Город" value={order.delivery_city} />}
              {order.delivery_address && <InfoField label="Адрес" value={order.delivery_address} />}
            </>
          )}
        </div>
        {order.delivery_type === 'delivery' && order.delivery_notes && (
          <div className="mt-3">
            <p className="text-xs text-text-muted uppercase mb-1">Комментарий к доставке</p>
            <div className="bg-surface-dim rounded-lg p-3 text-sm whitespace-pre-wrap">{order.delivery_notes}</div>
          </div>
        )}
      </div>

      {/* Deal info (admin/manager only) */}
      {isFinance && (
        <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
          <h2 className="font-semibold text-lg mb-4">Сделка</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
      )}

      {/* Finance (admin/manager only) */}
      {isFinance && (
        <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
          <h2 className="font-semibold text-lg mb-4">Финансы</h2>
          <div className="bg-accent text-on-accent rounded-2xl shadow-card p-6 mb-4">
            <p className="text-sm opacity-70">Итого</p>
            <p className="text-4xl font-bold font-display tracking-tight">{formatPrice(order.price_final)}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <InfoField label="Материалы" value={formatPrice(order.cost_materials)} />
            <InfoField label="Труд" value={formatPrice(order.cost_labor)} />
            <InfoField label="Себестоимость" value={formatPrice(order.cost_total)} />
            <InfoField label="За штуку" value={formatPrice(order.price_per_unit)} />
            <InfoField label="Наценка" value={order.markup ? `x${order.markup}` : '—'} />
            <InfoField label="Скидка" value={order.discount_pct ? `${Math.round(order.discount_pct * 100)}%` : '—'} />
          </div>
        </div>
      )}

      {/* Comments */}
      <OrderComments orderId={order.id} />

      {/* Tech card panel */}
      {showTechCard && (
        <div ref={techCardRef} className="bg-surface rounded-2xl border border-border shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Тех. карта</h2>
            <button onClick={() => setShowTechCard(false)} className="text-text-muted hover:text-text text-sm">Закрыть</button>
          </div>
          <TechCardActions order={order} defaultOpen />
        </div>
      )}


      {/* Production sticker panel */}
      {showProductionSticker && (
        <div ref={productionStickerRef} className="bg-surface rounded-2xl border border-border shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Стикер "В производство"</h2>
            <button onClick={() => setShowProductionSticker(false)} className="text-text-muted hover:text-text text-sm">Закрыть</button>
          </div>
          <StickerActions type="production" order={order} />
        </div>
      )}

      {/* Delivery sticker panel */}
      {showDeliverySticker && (
        <div ref={deliveryStickerRef} className="bg-surface rounded-2xl border border-border shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Стикер "На выдачу"</h2>
            <button onClick={() => setShowDeliverySticker(false)} className="text-text-muted hover:text-text text-sm">Закрыть</button>
          </div>
          <StickerActions type="delivery" order={order} />
        </div>
      )}

      {/* History panel */}
      {showHistory && (
        <div ref={historyRef} className="bg-surface rounded-2xl border border-border shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">История изменений</h2>
            <button onClick={() => setShowHistory(false)} className="text-text-muted hover:text-text text-sm">Закрыть</button>
          </div>
          <div className="space-y-2">
            {history.length === 0 ? (
              <p className="text-text-muted text-sm">Нет записей</p>
            ) : (
              history.map((h) => (
                <div key={h.id} className="flex items-center justify-between text-sm py-2 border-b border-border last:border-0">
                  <div>
                    <span className="font-medium">{h.changed_by_profile?.display_name || 'Система'}</span>
                    <span className="text-text-muted ml-2">
                      {h.from_status || '—'} → {h.to_status}
                    </span>
                  </div>
                  <span className="text-text-muted text-xs">
                    {new Date(h.created_at).toLocaleString('ru-RU')}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
