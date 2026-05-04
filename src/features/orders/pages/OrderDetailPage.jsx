import { useState, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useOrderDetail, updateOrder } from '../hooks/useOrders'
import { InfoField } from '../components/InfoField'
import { EditableField } from '../components/EditableField'
import { AdminOrderEditor } from '../components/AdminOrderEditor'
import { StatusSwitcher } from '../components/StatusSwitcher'
import { DepartmentTimeline } from '../components/DepartmentTimeline'
import { OrderComments } from '../components/OrderComments'
import { OrderAttachments } from '../components/OrderAttachments'
import { TechCardActions } from '@/features/techcard/components/TechCardActions'
import { StickerActions } from '@/features/techcard/components/StickerActions'
import Spinner from '@/shared/components/Spinner'
import Button from '@/shared/components/Button'
import { ORDER_TYPES } from '@/shared/constants'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { formatPrice } from '@/shared/lib/utils'
import { toast } from '@/shared/stores/toast-store'
import { supabase } from '@/shared/lib/supabase'

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
    const attachment = order.attachments?.[0]
    if (attachment?.file_path) {
      const url = supabase.storage.from('order-files').getPublicUrl(attachment.file_path).data?.publicUrl
      if (url) {
        navigator.clipboard.writeText(url)
        toast.success('Ссылка скопирована')
        return
      }
    }
    if (order.notes) {
      // Try to extract URL from notes
      const urlMatch = order.notes.match(/https?:\/\/\S+/)
      if (urlMatch) {
        navigator.clipboard.writeText(urlMatch[0])
        toast.success('Ссылка скопирована')
        return
      }
    }
    toast.error('Нет ссылки на файлы')
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Spinner /></div>
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-2">Заказ не найден</h2>
        <Link to="/orders" className="text-accent hover:underline">← К списку заказов</Link>
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
          <h1 className="text-3xl font-bold">
            ORD-{String(order.number).padStart(4, '0')}
            <span className="text-text-muted ml-2">—</span>
            <span className="ml-2">{clientName}</span>
          </h1>
          <p className="text-text-muted text-sm mt-1">
            Менеджер: {managerName}
          </p>
          <p className="inline-block bg-accent/10 text-accent font-medium text-sm px-3 py-1 rounded-lg mt-2">
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

      {/* Department timeline */}
      <DepartmentTimeline order={order} />

      {/* Admin edit mode */}
      {editing && isAdmin && (
        <AdminOrderEditor
          order={order}
          onSaved={() => { setEditing(false); refetch() }}
          onCancel={() => setEditing(false)}
        />
      )}

      {/* Source files link */}
      <div className="bg-surface rounded-xl border border-border p-4 flex items-center gap-3">
        <span className="text-sm text-text-muted">Исходные файлы заказчика:</span>
        {order.attachments?.length > 0 ? (
          <a
            href={supabase.storage.from('order-files').getPublicUrl(order.attachments[0].file_path).data?.publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-accent hover:underline truncate flex-1"
          >
            {order.attachments[0].file_name}
          </a>
        ) : (
          <span className="text-sm text-text-muted flex-1">Нет файлов</span>
        )}
        <Button variant="secondary" size="sm" onClick={copySourceLink}>
          Копировать
        </Button>
      </div>

      {/* Order info */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="font-semibold mb-4 text-lg">Информация о заказе</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <InfoField label="Тип" value={ORDER_TYPES[order.order_type]?.label || order.order_type} />
          <InfoField label="Размер" value={`${order.width_mm} x ${order.height_mm} мм`} />
          <InfoField label="Тираж" value={`${order.qty} шт`} />
          <InfoField label="Ламинация" value={order.need_lam ? 'Да' : 'Нет'} />
          <InfoField label="3D" value={order.order_type?.includes('3D') ? 'Да' : 'Нет'} />
          {order.bopp_bag && <InfoField label="БОПП пакет" value="Да" />}
          {order.design_variants && <InfoField label="Кол-во видов" value={order.design_variants} />}
          <InfoField label="Срок сдачи" value={order.deadline ? new Date(order.deadline).toLocaleDateString('ru-RU') : '—'} />
        </div>

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

      {/* Finance (admin/manager only) */}
      {isFinance && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="font-semibold text-lg mb-4">Финансы</h2>
          <div className="bg-primary text-white rounded-xl p-6 mb-4">
            <p className="text-sm opacity-70">Итого</p>
            <p className="text-4xl font-bold">{formatPrice(order.price_final)}</p>
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

      {/* Client preview (first image attachment) */}
      {order.attachments?.some(a => a.mime_type?.startsWith('image/')) && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-3">Макет заказчика</h2>
          <div className="flex flex-wrap gap-3">
            {order.attachments.filter(a => a.mime_type?.startsWith('image/')).map(a => (
              <img
                key={a.id}
                src={supabase.storage.from('order-files').getPublicUrl(a.file_path).data?.publicUrl}
                alt={a.file_name}
                className="max-h-64 rounded-lg border border-border object-contain"
              />
            ))}
          </div>
        </div>
      )}

      {/* Attachments */}
      <OrderAttachments orderId={order.id} />

      {/* Comments */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="font-semibold mb-3">Комментарии</h2>
        <OrderComments orderId={order.id} />
      </div>

      {/* Tech card panel */}
      {showTechCard && (
        <div ref={techCardRef} className="bg-surface rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Тех. карта</h2>
            <button onClick={() => setShowTechCard(false)} className="text-text-muted hover:text-text text-sm">Закрыть</button>
          </div>
          <TechCardActions order={order} defaultOpen />
        </div>
      )}


      {/* Production sticker panel */}
      {showProductionSticker && (
        <div ref={productionStickerRef} className="bg-surface rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Стикер "В производство"</h2>
            <button onClick={() => setShowProductionSticker(false)} className="text-text-muted hover:text-text text-sm">Закрыть</button>
          </div>
          <StickerActions type="production" order={order} />
        </div>
      )}

      {/* Delivery sticker panel */}
      {showDeliverySticker && (
        <div ref={deliveryStickerRef} className="bg-surface rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Стикер "На выдачу"</h2>
            <button onClick={() => setShowDeliverySticker(false)} className="text-text-muted hover:text-text text-sm">Закрыть</button>
          </div>
          <StickerActions type="delivery" order={order} />
        </div>
      )}

      {/* History panel */}
      {showHistory && (
        <div ref={historyRef} className="bg-surface rounded-xl border border-border p-5">
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
