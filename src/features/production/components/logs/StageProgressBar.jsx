/**
 * Compact progress bar for kanban cards.
 * Shows "X / Y шт (Z%)" with colored bar.
 */
export function StageProgressBar({ progress, compact = false }) {
  if (!progress) return null

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2.5 bg-surface-dim rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${progress.isComplete ? 'bg-success' : 'bg-accent'}`}
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
        <span className={`text-xs font-medium shrink-0 tabular-nums ${progress.isComplete ? 'text-success' : 'text-text-muted'}`}>
          {progress.total}/{progress.target} ({progress.percentage}%)
        </span>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-text-muted mb-1">
        <span>{progress.total} / {progress.target} шт</span>
        <span className={progress.isComplete ? 'text-success font-medium' : ''}>{progress.percentage}%</span>
      </div>
      <div className="h-2 bg-surface-dim rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${progress.isComplete ? 'bg-success' : 'bg-accent'}`}
          style={{ width: `${progress.percentage}%` }}
        />
      </div>
    </div>
  )
}
