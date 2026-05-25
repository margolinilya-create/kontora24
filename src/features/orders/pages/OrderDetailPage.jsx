import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useOrderDetail, updateOrder } from '../hooks/useOrders'
import { useOrderItems } from '../hooks/useOrderItems'
import { findOrCreateClientByName } from '@/features/clients/hooks/useClients'
import { InfoField } from '../components/InfoField'
import { AdminOrderEditor } from '../components/AdminOrderEditor'
import { StatusSwitcher } from '../components/StatusSwitcher'
import { StatusOverride } from '../components/StatusOverride'
import { OrderStepper } from '../components/OrderStepper'
import { OrderComments } from '../components/OrderComments'
import { OrderProgressTab } from '../components/OrderProgressTab'
import { OrderReportsTab } from '../components/OrderReportsTab'
import { OrderHistoryTab } from '../components/OrderHistoryTab'
import { FinanceTab } from '../components/FinanceTab'
import { PrintPreviewModal } from '@/features/techcard/components/PrintPreviewModal'
import { TechCardPreviewSlot } from '@/features/techcard/components/TechCardPreviewSlot'
import { Skeleton } from '@/shared/components/Skeleton'
import Button from '@/shared/components/Button'
import Modal from '@/shared/components/Modal'
import Tabs from '@/shared/components/Tabs'
import DropdownMenu from '@/shared/components/DropdownMenu'
import {
  ORDER_TYPES, FILM_TYPES, LAMINATION_TYPES, DELIVERY_TYPES, PRIORITIES,
} from '@/shared/constants'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import { toast } from '@/shared/stores/toast-store'
import { formatOrderNumber } from '@/shared/lib/utils'

function GearIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function EditableOrderNumber({ order, canEdit, onUpdated }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(order.custom_number || '')
  const [saving, setSaving] = useState(false)
  const formatted = formatOrderNumber(order)
  const fallback = String(order.number)

  async function save() {
    if (saving) return
    const trimmed = value.trim()
    if (trimmed.length > 64) {
      toast.error('Максимум 64 символа')
      return
    }
    const nextCustom = trimmed || null
    if (nextCustom === (order.custom_number || null)) { setEditing(false); return }
    setSaving(true)
    try {
      await updateOrder(order.id, { custom_number: nextCustom })
      toast.success(nextCustom ? `Номер изменён на ${nextCustom}` : `Сброшено к ${fallback}`)
      onUpdated?.()
      setEditing(false)
    } catch {
      toast.error('Не удалось изменить номер')
    } finally {
      setSaving(false)
    }
  }

  if (!canEdit) {
    return (
      <h1 className="text-4xl sm:text-5xl font-bold font-display tracking-tight leading-none">{formatted}</h1>
    )
  }
  if (editing) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <input
          autoFocus
          type="text"
          value={value}
          maxLength={64}
          placeholder={fallback}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') { setEditing(false); setValue(order.custom_number || '') }
          }}
          className="min-w-[200px] max-w-md bg-surface-2 rounded px-3 py-1 text-2xl sm:text-3xl font-bold font-display tracking-tight focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <button onClick={save} disabled={saving} className="text-xs px-2 py-1 rounded bg-accent text-on-accent font-medium disabled:opacity-50">{saving ? '…' : 'OK'}</button>
        <button onClick={() => { setEditing(false); setValue(order.custom_number || '') }} className="text-xs px-2 py-1 text-text-muted hover:text-text">×</button>
        <span className="text-xs text-text-muted">Пустое поле → {fallback}</span>
      </div>
    )
  }
  return (
    <button
      onClick={() => setEditing(true)}
      title={`Изменить номер заказа (по умолчанию ${fallback})`}
      className="text-4xl sm:text-5xl font-bold font-display tracking-tight leading-none hover:text-accent transition-colors text-left"
    >
      {formatted}
    </button>
  )
}

function EditableClientName({ order, canEdit, onUpdated }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(order.client?.name || '')
  const [saving, setSaving] = useState(false)
  const display = order.client?.name || '—'

  async function save() {
    const trimmed = value.trim()
    if (trimmed === (order.client?.name || '')) { setEditing(false); return }
    setSaving(true)
    try {
      let clientId = null
      if (trimmed) {
        const client = await findOrCreateClientByName(trimmed)
        clientId = client?.id || null
      }
      await updateOrder(order.id, { client_id: clientId })
      toast.success('Заказчик обновлён')
      onUpdated?.()
      setEditing(false)
    } catch {
      toast.error('Не удалось обновить заказчика')
    } finally {
      setSaving(false)
    }
  }

  if (!canEdit) return <span>{display}</span>
  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') { setEditing(false); setValue(order.client?.name || '') }
          }}
          placeholder="Имя или название компании"
          className="bg-surface-2 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 min-w-[200px]"
        />
        <button onClick={save} disabled={saving} className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-on-accent font-medium disabled:opacity-50">{saving ? '…' : 'OK'}</button>
        <button onClick={() => { setEditing(false); setValue(order.client?.name || '') }} className="text-[10px] px-1.5 py-0.5 text-text-muted hover:text-text">×</button>
      </span>
    )
  }
  return (
    <button onClick={() => setEditing(true)} title="Изменить заказчика" className="hover:text-accent transition-colors underline decoration-text-muted/30 decoration-dotted underline-offset-2">
      {display}
    </button>
  )
}

function EditableDeadline({ order, canEdit, onUpdated }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(order.deadline || '')
  const [saving, setSaving] = useState(false)

  const display = order.deadline ? new Date(order.deadline).toLocaleDateString('ru-RU') : '—'

  async function save() {
    if (value === (order.deadline || '')) { setEditing(false); return }
    setSaving(true)
    try {
      await updateOrder(order.id, { deadline: value || null })
      toast.success('Срок обновлён')
      onUpdated?.()
      setEditing(false)
    } catch {
      toast.error('Не удалось обновить срок')
    } finally {
      setSaving(false)
    }
  }

  if (!canEdit) return <span className="text-text">сдача {display}</span>
  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <input
          autoFocus
          type="date"
          value={value || ''}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') { setEditing(false); setValue(order.deadline || '') }
          }}
          className="bg-surface-2 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <button onClick={save} disabled={saving} className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-on-accent font-medium disabled:opacity-50">{saving ? '…' : 'OK'}</button>
        <button onClick={() => { setEditing(false); setValue(order.deadline || '') }} className="text-[10px] px-1.5 py-0.5 text-text-muted hover:text-text">×</button>
      </span>
    )
  }
  return (
    <button onClick={() => setEditing(true)} title="Изменить срок сдачи" className="text-text hover:text-accent transition-colors underline decoration-text-muted/30 decoration-dotted underline-offset-2">
      сдача {display}
    </button>
  )
}

function SourceFilesRow({ order, onUpdated, onCopy }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(order.mockup_path || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await updateOrder(order.id, { mockup_path: value.trim() || null })
      onUpdated?.()
      setEditing(false)
    } catch {
      toast.error('Не удалось сохранить ссылку')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-surface rounded-xl border border-border px-3 py-1.5 flex items-center gap-2 text-sm">
      <span className="text-text-muted whitespace-nowrap text-xs">Исходники:</span>
      {editing ? (
        <>
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') { setEditing(false); setValue(order.mockup_path || '') }
            }}
            placeholder="Ссылка на макет"
            className="flex-1 bg-surface-2 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <button onClick={save} disabled={saving} className="text-xs px-2 py-1 rounded bg-accent text-on-accent font-medium disabled:opacity-50">
            {saving ? '…' : 'OK'}
          </button>
          <button onClick={() => { setEditing(false); setValue(order.mockup_path || '') }} className="text-xs px-2 py-1 rounded text-text-muted hover:text-text">
            ×
          </button>
        </>
      ) : (
        <>
          {order.mockup_path ? (
            <a
              href={order.mockup_path}
              target="_blank"
              rel="noopener noreferrer"
              className="text-text hover:text-accent transition-colors truncate flex-1 underline decoration-text-muted/40 hover:decoration-accent"
            >
              {order.mockup_path}
            </a>
          ) : (
            <span className="text-text-muted flex-1">Нет ссылки</span>
          )}
          {/* На mobile «Изменить» прячем — ссылка тапается, для правки нужен desktop (фидбэк 17.05) */}
          <button onClick={() => setEditing(true)} className="hidden md:inline-block text-xs px-2 py-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors">
            Изменить
          </button>
          <button onClick={onCopy} className="text-xs px-2 py-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors">
            Копировать
          </button>
        </>
      )}
    </div>
  )
}

function OrderItemsList({ orderId }) {
  const { items } = useOrderItems(orderId)
  if (!items || items.length <= 1) return null
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-card p-4">
      <p className="text-xs font-medium text-text-muted uppercase mb-2">
        Виды изделий ({items.length})
      </p>
      <div className="space-y-1 text-sm">
        {items.map((it) => (
          <div key={it.id} className="flex items-center justify-between gap-3 py-1 border-b border-border last:border-0">
            <span className="text-text-muted">Вид {it.idx}</span>
            <span className="font-medium tabular-nums">
              {Number(it.width_mm)} × {Number(it.height_mm)} мм · {Number(it.qty)} шт
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function OverviewTab({ order, onUpdated }) {
  const isPack = order.order_type === 'stickerpack' || order.order_type === 'stickerpack3D'
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Left: 3 rows */}
      <div className="space-y-3">
        {/* Row 1: Тип / Размер / Тираж / Плёнка */}
        <div className="bg-surface rounded-2xl border border-border shadow-card p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <InfoField label="Тип" value={ORDER_TYPES[order.order_type]?.label || order.order_type} />
          <InfoField label="Размер" value={`${order.width_mm} x ${order.height_mm} мм`} />
          <InfoField label="Тираж" value={`${order.qty} шт`} />
          <InfoField label="Плёнка" value={FILM_TYPES[order.film_type]?.label || (order.film_type && order.film_type !== 'white' ? order.film_type : '—')} />
        </div>
        {/* Row 2: Ламинация / БОПП / Стикеров в паке (только пак) / Отгрузка */}
        <div className="bg-surface rounded-2xl border border-border shadow-card p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <InfoField label="Ламинация" value={order.need_lam ? (LAMINATION_TYPES[order.lam_type]?.label || 'Да') : 'Нет'} />
          <InfoField label="БОПП пакет" value={order.bopp_bag ? 'Да' : 'Нет'} />
          {isPack && (
            <InfoField label="Стикеров в паке" value={order.stickers_per_pack || '—'} />
          )}
          <InfoField label="Отгрузка" value={DELIVERY_TYPES[order.delivery_type]?.label || 'Самовывоз'} />
        </div>
        {/* Виды изделий (multi-variant, R8.3 серии 25.05) */}
        <OrderItemsList orderId={order.id} />

        {/* Row 3: highlighted comment from customer */}
        {order.notes && (
          <div className="bg-accent/10 border border-accent/30 rounded-2xl p-4 min-w-0">
            <p className="text-xs font-medium text-accent uppercase mb-1.5">Комментарий заказчика</p>
            <p className="text-sm whitespace-pre-wrap break-words text-text">{order.notes}</p>
          </div>
        )}
      </div>

      {/* Right: preview — drag-and-drop, попадает в тех-карту автоматически */}
      <TechCardPreviewSlot order={order} onUpdated={onUpdated} />
    </div>
  )
}

export default function OrderDetailPage() {
  const { id } = useParams()
  const { order, history, loading, refetch } = useOrderDetail(id)
  useAuth() // keep mount for legacy stores
  const isFinance = useCanDo('view:finance')
  const canEdit = useCanDo('order:edit')

  const [tab, setTab] = useState('overview')
  const [editorOpen, setEditorOpen] = useState(false)
  const [printType, setPrintType] = useState(null) // 'techcard' | 'production' | 'delivery' | null

  function copySourceLink() {
    if (order?.mockup_path) {
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
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-6 w-24" />
        </div>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-40 w-full" />
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

  const managerName = order.creator?.display_name || '—'
  const orderDate = order.created_at ? new Date(order.created_at).toLocaleDateString('ru-RU') : '—'

  const tabs = [
    { key: 'overview', label: 'Обзор' },
    { key: 'progress', label: 'Прогресс' },
    { key: 'reports', label: 'Расход материалов' },
    { key: 'history', label: 'История' },
    ...(isFinance ? [{ key: 'finance', label: 'Финансы' }] : []),
  ]

  return (
    <div className="space-y-5">
      {/* Back */}
      <Link to="/orders" className="text-text-muted hover:text-text transition-colors text-sm inline-block">
        ← Назад к списку
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        {/* Left: number + meta */}
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <EditableOrderNumber order={order} canEdit={canEdit} onUpdated={refetch} />
            {order.priority && order.priority !== 'normal' && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITIES[order.priority]?.color}`}>
                {PRIORITIES[order.priority]?.label}
              </span>
            )}
          </div>
          <p className="text-text-muted text-sm mt-2">
            <EditableClientName order={order} canEdit={canEdit} onUpdated={refetch} />
            {' · '}{managerName} · {orderDate}
            {' · '}<EditableDeadline order={order} canEdit={canEdit} onUpdated={refetch} />
          </p>
        </div>

        {/* Right: status switch + rollback + edit gear */}
        <div className="flex items-center gap-2 ml-auto">
          <StatusOverride order={order} onUpdated={refetch} />
          <StatusSwitcher order={order} onUpdated={refetch} />
          {canEdit && (
            <button
              onClick={() => setEditorOpen(true)}
              aria-label="Редактировать заказ"
              className="w-10 h-10 rounded-lg border border-border text-text-muted hover:text-text hover:bg-surface-2 transition-colors flex items-center justify-center"
            >
              <GearIcon className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Print group — sgrouped under common border */}
      <div className="inline-flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-1.5 max-w-full">
        <Button variant="secondary" size="sm" className="whitespace-nowrap" onClick={() => setPrintType('techcard')}>Тех. карта</Button>
        <Button variant="secondary" size="sm" className="whitespace-nowrap" onClick={() => setPrintType('production')}>На бокс</Button>
        <Button variant="secondary" size="sm" className="whitespace-nowrap" onClick={() => setPrintType('delivery')}>На выдачу</Button>
      </div>

      {/* Stepper */}
      <OrderStepper order={order} history={history} onUpdated={refetch} />

      {/* Source files link — компактная высота, инлайн-редактирование */}
      <SourceFilesRow order={order} onUpdated={refetch} onCopy={copySourceLink} />

      {/* Tabs (desktop) / Dropdown (mobile) */}
      <div className="flex justify-end md:block">
        <div className="hidden md:inline-block">
          <Tabs items={tabs} active={tab} onChange={setTab} />
        </div>
        <DropdownMenu items={tabs} active={tab} onChange={setTab} className="md:hidden" />
      </div>

      {/* Tab content */}
      <div>
        {tab === 'overview' && <OverviewTab order={order} onUpdated={refetch} />}
        {tab === 'progress' && (
          <OrderProgressTab order={order} history={history} onUpdated={refetch} />
        )}
        {tab === 'reports' && (
          <OrderReportsTab order={order} onUpdated={refetch} />
        )}
        {tab === 'history' && (
          <OrderHistoryTab order={order} history={history} />
        )}
        {tab === 'finance' && isFinance && (
          <FinanceTab order={order} />
        )}
      </div>

      {/* Comments — visible across tabs (production chat) */}
      <OrderComments orderId={order.id} />

      {/* Print preview modals */}
      <PrintPreviewModal
        isOpen={printType !== null}
        onClose={() => setPrintType(null)}
        type={printType}
        order={order}
        onUpdated={refetch}
      />

      {/* Edit modal (gear) */}
      <Modal isOpen={editorOpen} onClose={() => setEditorOpen(false)} title="Редактирование заказа" maxWidth="max-w-5xl">
        <AdminOrderEditor
          order={order}
          onSaved={() => { setEditorOpen(false); refetch() }}
          onCancel={() => setEditorOpen(false)}
        />
      </Modal>
    </div>
  )
}
