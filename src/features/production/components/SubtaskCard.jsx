import { Link } from 'react-router-dom'
import { REPRINT_STATUS_LABELS } from '@/shared/constants'
import { REPRINT_UI_STATUS_LABELS } from '../lib/production-logs'
import { formatOrderNumber as fmtNum } from '@/shared/lib/utils'

const UI_STATUS_TONE = {
  queued: 'bg-surface-dim text-text-muted',
  in_progress: 'bg-accent/15 text-accent',
  paused: 'bg-warning/15 text-warning',
  done: 'bg-success/15 text-success',
}

/**
 * R22.1 (ТЗ 20.07 Фаза 1) — карточка допечатки. Используется на вкладке
 * «Подзадачи» и в производственных очередях. Кликабельна → страница подзадачи.
 * Отмечена лейблом «Допечатка».
 */
export function SubtaskCard({ subtask, order, overall, uiStatus }) {
  const num = fmtNum(order)
  const pct = overall?.percentage ?? 0
  return (
    <Link
      to={`/production/subtask/${subtask.id}`}
      className="block bg-surface rounded-xl border border-border p-4 hover:border-accent/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-warning/15 text-warning">Допечатка</span>
            <span className="text-sm font-semibold truncate">{subtask.title || `Допечатка к #${num}`}</span>
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            Заказ #{num} · {subtask.qty} шт · {REPRINT_STATUS_LABELS[subtask.status] || subtask.status}
          </p>
        </div>
        {uiStatus && (
          <span className={`text-[11px] px-1.5 py-0.5 rounded shrink-0 ${UI_STATUS_TONE[uiStatus] || ''}`}>
            {REPRINT_UI_STATUS_LABELS[uiStatus] || uiStatus}
          </span>
        )}
      </div>
      {order?.deadline && (
        <p className="text-xs text-text-muted mb-2">Срок: {new Date(order.deadline).toLocaleDateString('ru-RU')}</p>
      )}
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 bg-surface-dim rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <span className="text-xs text-text-muted tabular-nums">{pct}%</span>
      </div>
    </Link>
  )
}
