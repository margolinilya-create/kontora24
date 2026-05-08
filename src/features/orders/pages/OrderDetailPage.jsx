import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useOrderDetail, updateOrder } from '../hooks/useOrders'
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
import { Skeleton } from '@/shared/components/Skeleton'
import Button from '@/shared/components/Button'
import Modal from '@/shared/components/Modal'
import Tabs from '@/shared/components/Tabs'
import {
  ORDER_TYPES, FILM_TYPES, LAMINATION_TYPES, DELIVERY_TYPES, PRIORITIES,
} from '@/shared/constants'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { toast } from '@/shared/stores/toast-store'

const IMAGE_RX = /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i

function isImageUrl(url) {
  return typeof url === 'string' && IMAGE_RX.test(url)
}

function GearIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
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
          <button onClick={() => setEditing(true)} className="text-xs px-2 py-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors">
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

function OverviewTab({ order }) {
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
        {/* Row 3: highlighted comment from customer */}
        {order.notes && (
          <div className="bg-accent/10 border border-accent/30 rounded-2xl p-4">
            <p className="text-xs font-medium text-accent uppercase mb-1.5">Комментарий заказчика</p>
            <p className="text-sm whitespace-pre-wrap text-text">{order.notes}</p>
          </div>
        )}
      </div>

      {/* Right: preview */}
      <div className="bg-surface rounded-2xl border border-border shadow-card p-4">
        <p className="text-xs text-text-muted uppercase mb-2">Превью макета</p>
        {order.mockup_path && isImageUrl(order.mockup_path) ? (
          <img
            src={order.mockup_path}
            alt="Макет"
            loading="lazy"
            className="w-full max-h-[420px] object-contain rounded-xl border border-border bg-surface-dim"
          />
        ) : order.mockup_path ? (
          <a
            href={order.mockup_path}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-text hover:text-accent underline decoration-text-muted/40 hover:decoration-accent transition-colors break-all"
          >
            {order.mockup_path}
          </a>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-text-muted text-sm bg-surface-dim rounded-xl border border-dashed border-border">
            Нет макета
          </div>
        )}
      </div>
    </div>
  )
}

export default function OrderDetailPage() {
  const { id } = useParams()
  const { order, history, loading, refetch } = useOrderDetail(id)
  const { hasRole } = useAuth()
  const isFinance = hasRole(['admin', 'manager'])

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

  const clientName = order.client?.name || '—'
  const managerName = order.creator?.display_name || '—'
  const orderDate = order.created_at ? new Date(order.created_at).toLocaleDateString('ru-RU') : '—'
  const deadlineDate = order.deadline ? new Date(order.deadline).toLocaleDateString('ru-RU') : null

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
            <h1 className="text-4xl sm:text-5xl font-bold font-display tracking-tight leading-none">
              ORD-{String(order.number).padStart(4, '0')}
            </h1>
            {order.priority && order.priority !== 'normal' && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITIES[order.priority]?.color}`}>
                {PRIORITIES[order.priority]?.label}
              </span>
            )}
          </div>
          <p className="text-text-muted text-sm mt-2">
            {clientName} · {managerName} · {orderDate}
            {deadlineDate && <> · <span className="text-text">сдача {deadlineDate}</span></>}
          </p>
        </div>

        {/* Right: status switch + rollback + edit gear */}
        <div className="flex items-center gap-2 ml-auto">
          <StatusOverride order={order} onUpdated={refetch} />
          <StatusSwitcher order={order} onUpdated={refetch} />
          {isFinance && (
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
      <div className="inline-flex items-center gap-2 rounded-2xl border border-border bg-surface p-1.5">
        <Button variant="secondary" size="sm" onClick={() => setPrintType('techcard')}>Тех. карта</Button>
        <Button variant="secondary" size="sm" onClick={() => setPrintType('production')}>На бокс</Button>
        <Button variant="secondary" size="sm" onClick={() => setPrintType('delivery')}>На выдачу</Button>
      </div>

      {/* Stepper */}
      <OrderStepper order={order} history={history} onUpdated={refetch} />

      {/* Source files link — компактная высота, инлайн-редактирование */}
      <SourceFilesRow order={order} onUpdated={refetch} onCopy={copySourceLink} />

      {/* Tabs */}
      <Tabs items={tabs} active={tab} onChange={setTab} />

      {/* Tab content */}
      <div>
        {tab === 'overview' && <OverviewTab order={order} />}
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
