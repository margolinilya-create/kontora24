import { useState, useRef, useEffect } from 'react'
import {
  ORDER_STATUSES, ORDER_TYPES, getOrderRoute,
  IS_3D_STICKERPACK, SUBTASK_STATUS_TO_STAGE, SUBTASK_STATUS_LABELS,
  TRACK_LABELS, getSubtaskRoute,
} from '@/shared/constants'
import { formatDateTime } from '@/shared/lib/utils'
import { updateOrderStatus } from '@/features/orders/hooks/useOrders'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'

const DEPT_DOT = {
  design:  'bg-dept-design',
  print:   'bg-dept-print',
  pouring: 'bg-dept-pouring',
  finish:  'bg-dept-finish',
  info:    'bg-info',
  danger:  'bg-danger',
}

function dotColor(status) {
  switch (status) {
    case 'new':
    case 'color_approval': return DEPT_DOT.info
    case 'design':
    case 'sample_layout':
    case 'batch_layout':
    case 'prepress': return DEPT_DOT.design
    case 'sample_print':
    case 'print':
    case 'lamination':
    case 'cutting': return DEPT_DOT.print
    case 'selection_pouring':
    case 'pouring':
    case 'drying':
    case 'selection': return DEPT_DOT.pouring
    case 'assembly_3d':
    case 'packaging':
    case 'otk':
    case 'done': return DEPT_DOT.finish
    case 'cancelled': return DEPT_DOT.danger
    default: return DEPT_DOT.info
  }
}

// Цвет точки для статуса подзадачи (printing/laminating/cutting/...).
// Маппим в order-stage через SUBTASK_STATUS_TO_STAGE и берём dotColor.
function subtaskDotColor(subStatus) {
  const mapped = SUBTASK_STATUS_TO_STAGE[subStatus]
  if (mapped) return dotColor(mapped)
  if (subStatus === 'drying') return DEPT_DOT.pouring
  if (subStatus === 'ready') return DEPT_DOT.finish
  return DEPT_DOT.info
}

// Одна точка с подписью под ней.
function Dot({ kind = 'order', status, isCompleted, isCurrent, label, tooltip, size = 'md' }) {
  const cls = kind === 'subtask' ? subtaskDotColor(status) : dotColor(status)
  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5'
  const ringForCurrent = isCurrent ? 'ring-4 ring-accent/25' : ''
  return (
    <div className="flex flex-col items-center gap-1 shrink-0" title={tooltip}>
      <span
        className={`${dotSize} rounded-full transition-all ${
          isCurrent ? `${cls} ${ringForCurrent}` : isCompleted ? cls : 'bg-surface-2 ring-1 ring-border'
        }`}
        aria-hidden="true"
      />
      <span className={`text-[10px] leading-tight whitespace-nowrap ${
        isCurrent ? 'font-semibold text-text' : isCompleted ? 'text-text-muted' : 'text-text-muted/60'
      }`}>{label}</span>
    </div>
  )
}

function Connector({ done }) {
  return <span className={`h-px w-3 sm:w-6 shrink-0 ${done ? 'bg-text-muted/40' : 'bg-border'}`} aria-hidden="true" />
}

// Пилюля с названием трека (СТИКЕР / ФОН / ДОП СТИКЕР).
function TrackPill({ label, tone }) {
  const cls = {
    backgrounds: 'bg-dept-print/15 text-dept-print border-dept-print/30',
    stickers: 'bg-dept-pouring/15 text-dept-pouring border-dept-pouring/30',
    extra_stickers: 'bg-warning/15 text-warning border-warning/30',
  }[tone] || 'bg-surface-2 text-text-muted border-border'
  return (
    <span className={`shrink-0 inline-flex items-center justify-center px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${cls}`}>
      {label}
    </span>
  )
}

// Маркер развилки/сходимости: угловая скобка из двух чёрточек.
function ForkBracket({ direction = 'open' }) {
  const path = direction === 'open' ? 'M14 4 L4 12 L14 20' : 'M2 4 L12 12 L2 20'
  return (
    <svg viewBox="0 0 16 24" width="16" height="24" className="shrink-0 text-border" aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Ряд chips для одного трека: пилюля слева, точки/коннекторы дальше.
function TrackRow({ trackKey, statuses, currentStatus }) {
  const currentIdx = statuses.indexOf(currentStatus)
  return (
    <div className="flex items-center gap-1.5 min-w-max">
      <TrackPill label={TRACK_LABELS[trackKey] || trackKey} tone={trackKey} />
      {statuses.map((s, i) => {
        const isCompleted = currentIdx >= 0 && i < currentIdx
        const isCurrent = i === currentIdx
        const label = SUBTASK_STATUS_LABELS[s] || s
        return (
          <span key={s} className="flex items-center gap-1.5">
            <Dot
              kind="subtask"
              status={s}
              isCompleted={isCompleted}
              isCurrent={isCurrent}
              label={label}
              tooltip={isCurrent ? 'Текущий этап' : isCompleted ? 'Пройден' : 'Не пройден'}
              size="sm"
            />
            {i < statuses.length - 1 && <Connector done={currentIdx > i} />}
          </span>
        )
      })}
    </div>
  )
}

// Ряд chips для обычного маршрута (order.status namespace).
function OrderRow({ statuses, currentIdx, tsByStatus }) {
  return (
    <ol className="flex items-center gap-1.5 min-w-max">
      {statuses.map((status, i) => {
        const isCompleted = currentIdx >= 0 && i < currentIdx
        const isCurrent = i === currentIdx
        const s = ORDER_STATUSES[status]
        const ts = tsByStatus[status]
        const tooltip = ts
          ? `${formatDateTime(ts.created_at)}${ts.changed_by_profile?.display_name ? ` · ${ts.changed_by_profile.display_name}` : ''}`
          : isCurrent ? 'Текущий этап' : 'Не пройден'
        return (
          <li key={status} className="flex items-center gap-1.5">
            <Dot status={status} isCompleted={isCompleted} isCurrent={isCurrent} label={s?.label || status} tooltip={tooltip} />
            {i < statuses.length - 1 && <Connector done={currentIdx > i} />}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * Тонкая «закладочная» лента прогресса по этапам.
 * Для stickerpack3D и при наличии extras — рендерит развилку с пилюлями
 * (ФОН / СТИКЕР / ДОП СТИКЕР) между общим префиксом и общим хвостом
 * (..prepress < tracks > assembly_3d..).
 */
export function OrderStepper({ order, history, subtasks, extras, onUpdated }) {
  const [returning, setReturning] = useState(false)
  const isMountedRef = useRef(true)
  useEffect(() => () => { isMountedRef.current = false }, [])

  if (!order) return null
  const route = getOrderRoute(order)
  const currentIdx = route.indexOf(order.status)
  const isCancelled = order.status === 'cancelled'
  const isOffRoute = !isCancelled && currentIdx === -1

  const tsByStatus = {}
  history?.forEach((h) => { if (!tsByStatus[h.to_status]) tsByStatus[h.to_status] = h })

  const recoveryTarget = route.find((s) => s !== 'new') ?? route[0] ?? null

  async function handleReturn() {
    if (!recoveryTarget || returning) return
    setReturning(true)
    try {
      await updateOrderStatus(order.id, order.status, recoveryTarget, { isRollback: true })
      if (!isMountedRef.current) return
      toast.success(`Заказ возвращён на «${ORDER_STATUSES[recoveryTarget]?.label || recoveryTarget}»`)
      onUpdated?.()
    } catch (err) {
      if (isMountedRef.current) toast.error(translateError(err).message)
    } finally {
      if (isMountedRef.current) setReturning(false)
    }
  }

  if (isOffRoute) {
    const currentLabel = ORDER_STATUSES[order.status]?.label || order.status
    const orderTypeLabel = ORDER_TYPES[order.order_type]?.label || order.order_type
    const recoveryLabel = recoveryTarget ? (ORDER_STATUSES[recoveryTarget]?.label || recoveryTarget) : null
    return (
      <div className="bg-warning/10 border border-warning/40 rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 text-sm">
          <p className="font-medium text-warning">Заказ вне маршрута</p>
          <p className="text-text-muted text-xs mt-0.5">
            Статус «{currentLabel}» не входит в маршрут типа «{orderTypeLabel}».
            {recoveryTarget ? ' Верните заказ на корректный этап.' : ' Маршрут заказа пуст — обратитесь к администратору.'}
          </p>
        </div>
        {recoveryTarget && (
          <button
            onClick={handleReturn}
            disabled={returning}
            className="text-sm px-3 py-1.5 rounded-lg bg-warning text-on-accent font-medium hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
          >
            {returning ? 'Возвращаем…' : `Вернуть на «${recoveryLabel}»`}
          </button>
        )}
      </div>
    )
  }

  if (isCancelled) {
    return (
      <div className="bg-surface rounded-xl border border-border px-4 py-3 flex items-center gap-2 text-sm">
        <span className={`w-2 h-2 rounded-full ${DEPT_DOT.danger}`} aria-hidden="true" />
        <span className="font-medium text-danger">Отменён</span>
        {tsByStatus.cancelled && (
          <span className="text-text-muted text-xs ml-2">{formatDateTime(tsByStatus.cancelled.created_at)}</span>
        )}
      </div>
    )
  }

  const isPack3D = IS_3D_STICKERPACK(order.order_type)
  const hasMainSubtasks = isPack3D && subtasks?.backgrounds && subtasks?.stickers
  const hasExtras = Array.isArray(extras) && extras.length > 0
  const showFork = hasMainSubtasks || (hasExtras && (isPack3D || order.order_type === 'sticker3D'))

  // Без развилки — текущий стандартный stepper.
  if (!showFork) {
    return (
      <div className="bg-surface rounded-xl border border-border px-3 py-2.5 overflow-x-auto">
        <OrderRow statuses={route} currentIdx={currentIdx} tsByStatus={tsByStatus} />
      </div>
    )
  }

  // Развилка: префикс до первой dual-track стадии, хвост от assembly_3d.
  // Для sticker3D с extras: split по 'print', merge — после маршрута stickers
  // (assembly_3d отсутствует в sticker3D, но extras всё равно отдельным треком).
  const splitStage = 'print'
  const mergeStage = isPack3D ? 'assembly_3d' : 'packaging'
  const splitIdx = route.indexOf(splitStage)
  const mergeIdx = route.indexOf(mergeStage)
  const safeSplit = splitIdx < 0 ? Math.max(0, route.length - 1) : splitIdx
  const safeMerge = mergeIdx < 0 ? route.length : mergeIdx
  const prefix = route.slice(0, safeSplit)
  const suffix = route.slice(safeMerge)

  // Текущий индекс относительно префикса и хвоста.
  const prefixCurrentIdx = prefix.indexOf(order.status)
  const isAfterFork = order.status === mergeStage || route.indexOf(order.status) > safeMerge
  // Если order.status уже >= mergeStage — префикс полностью пройден.
  // Иначе если order.status в DUAL — префикс полностью пройден, suffix не начат.
  let suffixCurrentIdx = -1
  if (isAfterFork) {
    suffixCurrentIdx = suffix.indexOf(order.status)
  }
  // Префикс показываем как пройденный когда находимся в DUAL или дальше.
  const inOrAfterDual = currentIdx >= safeSplit
  const prefixEffectiveCurrent = inOrAfterDual ? prefix.length : prefixCurrentIdx

  // Треки для развилки. По скрину менеджера — порядок: СТИКЕР сверху, ФОН снизу.
  // Фильтруем pending/ready (они не показываются как этапы маршрута).
  function visibleSubtaskRoute(trackKey) {
    return getSubtaskRoute(trackKey, order).filter((s) => s !== 'pending' && s !== 'ready')
  }

  const trackRows = []
  if (hasMainSubtasks) {
    trackRows.push({
      key: 'stickers',
      statuses: visibleSubtaskRoute('stickers'),
      current: subtasks.stickers.status,
    })
    trackRows.push({
      key: 'backgrounds',
      statuses: visibleSubtaskRoute('backgrounds'),
      current: subtasks.backgrounds.status,
    })
  } else if (!isPack3D && order.order_type === 'sticker3D') {
    // Для sticker3D рендерим «основной» маршрут как один трек (на основе ORDER route
    // между splitIdx и mergeIdx) — для визуального единообразия с extras.
    const dualSlice = route.slice(safeSplit, safeMerge)
    trackRows.push({
      key: 'main',
      statuses: dualSlice,
      current: order.status,
      isOrderRoute: true,
    })
  }
  if (hasExtras) {
    for (const ex of extras) {
      trackRows.push({
        key: `extra-${ex.id}`,
        statuses: visibleSubtaskRoute('extra_stickers'),
        current: ex.status,
        trackLabel: 'extra_stickers',
      })
    }
  }

  return (
    <div className="bg-surface rounded-xl border border-border px-3 py-2.5 overflow-x-auto">
      <div className="flex items-start gap-3 min-w-max">
        {/* Префикс */}
        <OrderRow statuses={prefix} currentIdx={prefixEffectiveCurrent} tsByStatus={tsByStatus} />

        {/* Скобка раскрытия */}
        <div className="flex items-center self-stretch pt-1.5">
          <ForkBracket direction="open" />
        </div>

        {/* Параллельные треки */}
        <div className="flex flex-col gap-3 py-1.5">
          {trackRows.map((row) => (
            row.isOrderRoute ? (
              <OrderRow
                key={row.key}
                statuses={row.statuses}
                currentIdx={row.statuses.indexOf(row.current)}
                tsByStatus={tsByStatus}
              />
            ) : (
              <TrackRow
                key={row.key}
                trackKey={row.trackLabel || row.key}
                statuses={row.statuses}
                currentStatus={row.current}
              />
            )
          ))}
        </div>

        {/* Скобка сходимости */}
        <div className="flex items-center self-stretch pt-1.5">
          <ForkBracket direction="close" />
        </div>

        {/* Хвост */}
        <OrderRow statuses={suffix} currentIdx={suffixCurrentIdx} tsByStatus={tsByStatus} />
      </div>
    </div>
  )
}
