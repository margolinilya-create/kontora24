import { useTimer, formatElapsed, formatTotalTime } from '../hooks/useTimer'
import Button from '@/shared/components/Button'

export function TaskTimer({ orderId, orderStatus, compact = false }) {
  const { isRunning, elapsed, totalMinutes, start, stop } = useTimer(orderId, { tickInterval: compact ? 30000 : 1000 })

  async function handleToggle() {
    if (isRunning) {
      await stop()
    } else {
      await start(orderStatus)
    }
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        {isRunning && (
          <span className="text-xs font-mono text-accent font-medium">{formatElapsed(elapsed)}</span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleToggle() }}
          onPointerDown={(e) => e.stopPropagation()}
          className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors ${
            isRunning
              ? 'bg-danger/15 text-danger hover:bg-danger/25'
              : 'bg-accent/15 text-accent hover:bg-accent/25'
          }`}
        >
          {isRunning ? 'Стоп' : 'Старт'}
        </button>
        {totalMinutes > 0 && !isRunning && (
          <span className="text-[10px] text-text-muted">{formatTotalTime(totalMinutes)}</span>
        )}
      </div>
    )
  }

  // Full view for detail pages
  return (
    <div className="flex items-center gap-3">
      {isRunning && (
        <span className="text-lg font-mono text-accent font-bold">{formatElapsed(elapsed)}</span>
      )}
      <Button
        variant={isRunning ? 'danger' : 'primary'}
        size="sm"
        onClick={handleToggle}
      >
        {isRunning ? 'Остановить' : 'Начать работу'}
      </Button>
      {totalMinutes > 0 && (
        <span className="text-sm text-text-muted">Всего: {formatTotalTime(totalMinutes)}</span>
      )}
    </div>
  )
}
