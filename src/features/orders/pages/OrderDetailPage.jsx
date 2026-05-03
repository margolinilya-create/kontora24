import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useOrderDetail, updateOrder } from '../hooks/useOrders'
import { StatusSwitcher } from '../components/StatusSwitcher'
import { DepartmentTimeline } from '../components/DepartmentTimeline'
import { OrderComments } from '../components/OrderComments'
import { OrderAttachments } from '../components/OrderAttachments'
import { TechCardActions } from '@/features/techcard/components/TechCardActions'
import { StickerActions } from '@/features/techcard/components/StickerActions'
import { CommercialProposal } from '@/features/kp/components/CommercialProposal'
import Spinner from '@/shared/components/Spinner'
import Button from '@/shared/components/Button'
import { ORDER_TYPES } from '@/shared/constants'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { formatPrice } from '@/shared/lib/utils'
import { toast } from '@/shared/stores/toast-store'
import { supabase } from '@/shared/lib/supabase'
import { calculate } from '@/features/calculator/lib/calculator'

export default function OrderDetailPage() {
  const { id } = useParams()
  const { order, history, loading, refetch } = useOrderDetail(id)
  const { hasRole } = useAuth()
  const isFinance = hasRole(['admin', 'manager'])
  const [recalculating, setRecalculating] = useState(false)
  const [showTechCard, setShowTechCard] = useState(false)
  const [showKP, setShowKP] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showProductionSticker, setShowProductionSticker] = useState(false)
  const [showDeliverySticker, setShowDeliverySticker] = useState(false)

  async function handleRecalculate() {
    if (!order) return
    setRecalculating(true)
    try {
      const [settingsRes, markupsRes] = await Promise.all([
        supabase.from('k24_settings').select('value').eq('key', 'calculator').single(),
        supabase.from('k24_settings').select('value').eq('key', 'markups').single(),
      ])
      const overrides = settingsRes.data?.value || {}
      const markups = markupsRes.data?.value || {}
      const is3D = order.order_type?.includes('3D') || false
      const markupOverride = markups[order.order_type]

      const result = calculate({
        width: order.width_mm, height: order.height_mm, qty: order.qty,
        orderType: order.order_type, needLam: order.need_lam || false, is3D, overrides,
      })

      let finalResult = result
      if (markupOverride && markupOverride !== result.markup) {
        const priceFinal = Math.round(result.costTotal * markupOverride * (1 - result.discount))
        const pricePerUnit = order.qty > 0 ? Math.round(priceFinal / order.qty) : 0
        finalResult = { ...result, markup: markupOverride, priceFinal, pricePerUnit }
      }

      await updateOrder(order.id, {
        cost_materials: finalResult.costMaterials, cost_labor: finalResult.costLabor,
        cost_total: finalResult.costTotal, price_final: finalResult.priceFinal,
        price_per_unit: finalResult.pricePerUnit, markup: finalResult.markup,
        discount_pct: finalResult.discount, prod_days: finalResult.prodDays,
      })

      toast.success(`Пересчитано: ${formatPrice(order.price_final)} -> ${formatPrice(finalResult.priceFinal)}`)
      refetch()
    } catch (err) {
      toast.error('Ошибка: ' + (err.message || 'Неизвестная ошибка'))
    } finally {
      setRecalculating(false)
    }
  }

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
          <Button variant="secondary" onClick={() => setShowTechCard(!showTechCard)}>
            Тех. карта
          </Button>
          <Button variant="secondary" onClick={() => setShowKP(!showKP)}>
            КП
          </Button>
          <Button variant="secondary" onClick={() => setShowProductionSticker(!showProductionSticker)}>
            В производство
          </Button>
          <Button variant="secondary" onClick={() => setShowDeliverySticker(!showDeliverySticker)}>
            На выдачу
          </Button>
          <Button variant="secondary" onClick={() => setShowHistory(!showHistory)}>
            История
          </Button>
          <StatusSwitcher order={order} onUpdated={refetch} />
        </div>
      </div>

      {/* Department timeline */}
      <DepartmentTimeline order={order} />

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
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Финансы</h2>
            <Button variant="secondary" size="sm" onClick={handleRecalculate} loading={recalculating}>
              Пересчитать
            </Button>
          </div>
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
        <div className="bg-surface rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Тех. карта</h2>
            <button onClick={() => setShowTechCard(false)} className="text-text-muted hover:text-text text-sm">Закрыть</button>
          </div>
          <TechCardActions order={order} />
        </div>
      )}

      {/* KP panel */}
      {showKP && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Коммерческое предложение</h2>
            <button onClick={() => setShowKP(false)} className="text-text-muted hover:text-text text-sm">Закрыть</button>
          </div>
          <CommercialProposal order={order} />
        </div>
      )}

      {/* Production sticker panel */}
      {showProductionSticker && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Стикер "В производство"</h2>
            <button onClick={() => setShowProductionSticker(false)} className="text-text-muted hover:text-text text-sm">Закрыть</button>
          </div>
          <StickerActions type="production" order={order} />
        </div>
      )}

      {/* Delivery sticker panel */}
      {showDeliverySticker && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Стикер "На выдачу"</h2>
            <button onClick={() => setShowDeliverySticker(false)} className="text-text-muted hover:text-text text-sm">Закрыть</button>
          </div>
          <StickerActions type="delivery" order={order} />
        </div>
      )}

      {/* History panel */}
      {showHistory && (
        <div className="bg-surface rounded-xl border border-border p-5">
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

function InfoField({ label, value }) {
  return (
    <div>
      <p className="text-xs text-text-muted uppercase">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}

function EditableField({ label, field, order, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(order[field] || '')

  async function save() {
    try {
      await updateOrder(order.id, { [field]: value || null })
      setEditing(false)
      onSaved()
    } catch {
      toast.error('Ошибка сохранения')
    }
  }

  if (editing) {
    return (
      <div>
        <p className="text-xs text-text-muted uppercase mb-1">{label}</p>
        <div className="flex gap-1">
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="border border-border rounded px-2 py-1 text-sm w-full bg-surface"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          />
          <button onClick={save} className="text-accent text-sm font-medium">OK</button>
        </div>
      </div>
    )
  }

  return (
    <div className="cursor-pointer" onClick={() => setEditing(true)} title="Нажмите для редактирования">
      <p className="text-xs text-text-muted uppercase">{label}</p>
      <p className="font-medium">{order[field] || '—'}</p>
    </div>
  )
}
