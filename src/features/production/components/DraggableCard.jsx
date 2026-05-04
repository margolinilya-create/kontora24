import { useState, useMemo, memo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Link } from 'react-router-dom'
import { ClaimButton } from '@/features/orders/components/ClaimButton'
import { TaskTimer } from './TaskTimer'
import { OperationChecklist } from './OperationChecklist'
import { TechCardPreview } from './TechCardPreview'
import { ORDER_TYPES, PRIORITIES, MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE } from '@/shared/constants'
import { supabase } from '@/shared/lib/supabase'
// Use simple arithmetic instead of date-fns to avoid pulling it into production board chunk

const PRIORITY_BORDER = {
  urgent: 'border-l-danger',
  high: 'border-l-warning',
}

function formatTimeInStatus(timestamp) {
  if (!timestamp) return null
  const ms = Date.now() - new Date(timestamp).getTime()
  const h = Math.floor(ms / MS_PER_HOUR)
  if (h < 1) return `${Math.floor(ms / MS_PER_MINUTE)} мин`
  if (h < 24) return `${h} ч`
  return `${Math.floor(h / 24)} дн`
}

function formatDeadline(deadline) {
  if (!deadline) return null
  return new Date(deadline).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

const CardContent = memo(function CardContent({ order, onUpdated, isOverlay = false }) {
  const [showTechCard, setShowTechCard] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const now = Date.now()
  const timeInStatus = formatTimeInStatus(order.status_changed_at || order.updated_at)
  const deadlineTime = order.deadline ? new Date(order.deadline).getTime() : null
  const isOverdue = deadlineTime && deadlineTime < now
  const isUrgentDeadline = deadlineTime && !isOverdue && (deadlineTime - now) < MS_PER_DAY
  const priority = PRIORITIES[order.priority]
  const showPriority = order.priority === 'urgent' || order.priority === 'high'

  return (
    <div className="flex flex-col gap-2.5">
      {/* Header: number + claim */}
      <div className="flex items-center justify-between">
        {isOverlay ? (
          <span className="font-bold text-accent">#{order.number}</span>
        ) : (
          <div className="flex items-center gap-1.5">
            <Link
              to={`/orders/${order.id}`}
              className="font-bold text-accent hover:underline"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              #{order.number}
            </Link>
            <button
              onClick={(e) => { e.stopPropagation(); setShowTechCard(true) }}
              onPointerDown={(e) => e.stopPropagation()}
              className="text-xs text-text-muted hover:text-accent transition-colors min-h-[44px] px-1"
            >
              Тех карта
            </button>
          </div>
        )}
        {!isOverlay && <ClaimButton order={order} onClaimed={onUpdated} />}
      </div>

      {/* Type + specs */}
      <div>
        <p className="text-sm font-medium text-text leading-tight">
          {ORDER_TYPES[order.order_type]?.label}
        </p>
        <p className="text-xs text-text-muted mt-0.5">
          {order.width_mm} x {order.height_mm} мм · {order.qty} шт
        </p>
      </div>

      {/* Secondary details — always visible on desktop, expandable on mobile */}
      {!isOverlay && (
        <div className={`flex flex-col gap-2.5 ${expanded ? '' : 'hidden sm:flex'}`}>
          <AttachmentThumbnail attachments={order.attachments} />
          {order.client?.name && (
            <p className="text-xs text-text-muted truncate">{order.client.name}</p>
          )}
          <TaskTimer orderId={order.id} orderStatus={order.status} compact />
        </div>
      )}
      {!isOverlay && !expanded && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(true) }}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-xs text-accent/70 hover:text-accent transition-colors py-1 min-h-[44px] sm:hidden"
        >
          Подробнее...
        </button>
      )}

      {/* Footer: meta row */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Deadline */}
          {order.deadline && (
            <span className={`text-xs shrink-0 ${
              isOverdue
                ? 'text-danger font-medium'
                : isUrgentDeadline
                  ? 'text-warning font-medium'
                  : 'text-text-muted'
            }`}>
              {formatDeadline(order.deadline)}
            </span>
          )}
          {/* Assignee */}
          {order.assignee?.display_name && (
            <span className="text-xs text-text-muted truncate">
              · {order.assignee.display_name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Priority badge */}
          {showPriority && (
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${priority?.color}`}>
              {priority?.label}
            </span>
          )}
          {/* Operation checklist progress */}
          <OperationChecklist order={order} compact />
          {/* Time in status */}
          {timeInStatus && (
            <span className="text-xs text-text-muted">{timeInStatus}</span>
          )}
        </div>
      </div>
      {!isOverlay && <TechCardPreview orderId={order.id} isOpen={showTechCard} onClose={() => setShowTechCard(false)} />}
    </div>
  )
})

function AttachmentThumbnail({ attachments }) {
  const imgAttachment = useMemo(() => {
    if (!attachments?.length) return null
    return attachments.find(a => a.mime_type?.startsWith('image/') || /\.(png|jpg|jpeg|webp)$/i.test(a.file_name))
  }, [attachments])

  const publicUrl = useMemo(() => {
    if (!imgAttachment?.file_path) return null
    const { data } = supabase.storage.from('order-files').getPublicUrl(imgAttachment.file_path)
    return data?.publicUrl || null
  }, [imgAttachment?.file_path])

  if (!publicUrl) return null
  return (
    <div className="rounded-lg overflow-hidden h-16">
      <img src={publicUrl} alt="" width={260} height={64} className="w-full h-full object-cover" loading="lazy" />
    </div>
  )
}

export const DraggableCard = memo(function DraggableCard({ order, onUpdated }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: order.id,
    data: { status: order.status },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms cubic-bezier(0.25, 1, 0.5, 1)',
  }

  const priorityBorder = PRIORITY_BORDER[order.priority]

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="rounded-xl border-2 border-dashed border-accent/20 bg-accent/[0.03] h-[120px] transition-all duration-200"
      />
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      aria-roledescription="перетаскиваемый элемент"
      className={`kanban-card bg-surface rounded-xl border border-border p-3.5 cursor-grab active:cursor-grabbing touch-none
        hover:shadow-md hover:border-accent/20
        transition-all duration-200 ease-out
        ${priorityBorder ? `border-l-[3px] ${priorityBorder}` : ''}`}
    >
      <CardContent order={order} onUpdated={onUpdated} />
    </div>
  )
})

export function DragOverlayCard({ order }) {
  const priorityBorder = PRIORITY_BORDER[order.priority]

  return (
    <div
      className={`bg-surface rounded-xl border-2 border-accent shadow-2xl p-3.5 w-[272px]
        rotate-[1.5deg] scale-[1.03] pointer-events-none
        ${priorityBorder ? `border-l-[3px] ${priorityBorder}` : ''}`}
      style={{ filter: 'drop-shadow(0 16px 24px rgba(0,0,0,0.12))' }}
    >
      <CardContent order={order} isOverlay />
    </div>
  )
}
