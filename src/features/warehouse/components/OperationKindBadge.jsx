import { OPERATION_KINDS } from '../lib/warehouse-journal'

const TONE_CLASS = {
  success: 'bg-success/15 text-success',
  danger: 'bg-danger/15 text-danger',
  warning: 'bg-warning/25 text-text',
  info: 'bg-info/15 text-info',
  muted: 'bg-surface-dim text-text-muted',
}

/** R25.8: плашка вида операции склада; у автоматических — пометка «авто». */
export function OperationKindBadge({ kind, isAuto, needsReview }) {
  const meta = OPERATION_KINDS[kind]
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap ${TONE_CLASS[meta?.tone] || TONE_CLASS.muted}`}>
        {meta?.label || kind || '—'}
      </span>
      {isAuto && <span className="text-[10px] bg-info/15 text-info px-1.5 py-0.5 rounded">авто</span>}
      {needsReview && (
        <span className="text-[10px] bg-warning/25 text-text px-1.5 py-0.5 rounded" title="Проверить после переноса истории">
          проверить
        </span>
      )}
    </span>
  )
}
