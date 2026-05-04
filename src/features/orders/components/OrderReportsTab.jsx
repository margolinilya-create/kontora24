import { useAuth } from '@/features/auth/hooks/useAuth'
import { useProductionLogs } from '@/features/production/hooks/useProductionLogs'
import { ProductionLogForm } from '@/features/production/components/logs/ProductionLogForm'
import { ProductionLogHistory } from '@/features/production/components/logs/ProductionLogHistory'
import { addProductionLogAndCheckAdvance } from '@/features/orders/hooks/useOrders'
import { TaskTimer } from '@/features/production/components/TaskTimer'
import { useTimer, formatTotalTime } from '@/features/production/hooks/useTimer'
import { formatDateTime } from '@/shared/lib/utils'

export function OrderReportsTab({ order, onUpdated }) {
  const { profile } = useAuth()
  const { logs, getStageProgress, refetch } = useProductionLogs(order.id, order.qty)
  const { entries } = useTimer(order.id)

  const myLogs = logs.filter((l) => l.worker_id === profile?.id)
  const progress = getStageProgress(order.status)
  const canLog = order.status !== 'new' && order.status !== 'done' && order.status !== 'cancelled' && order.status !== 'design'

  async function handleLogSubmit(stage, logData) {
    await addProductionLogAndCheckAdvance(order.id, stage, logData, order)
    refetch()
    onUpdated?.()
  }

  return (
    <div className="space-y-6">
      {/* Log form for current stage */}
      {canLog && (
        <ProductionLogForm
          stage={order.status}
          progress={progress}
          onSubmit={handleLogSubmit}
        />
      )}

      {/* Time tracking */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="font-semibold mb-4">Время работы</h2>
        <TaskTimer orderId={order.id} orderStatus={order.status} />
        {entries.length > 0 && (
          <div className="mt-4 space-y-2">
            {entries.map((entry) => (
              <div key={entry.id} className="flex justify-between text-sm py-1 border-b border-border last:border-0">
                <span className="text-text-muted">{formatDateTime(entry.started_at)}</span>
                <span>{entry.duration_minutes ? formatTotalTime(entry.duration_minutes) : 'В процессе'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* My contributions to this order */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="font-semibold mb-4">
          Мой вклад в заказ ({myLogs.length} {myLogs.length === 1 ? 'запись' : 'записей'})
        </h2>
        <ProductionLogHistory logs={myLogs} />
      </div>

      {/* All contributions (visible to admin/manager) */}
      {logs.length > myLogs.length && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4">Все записи ({logs.length})</h2>
          <ProductionLogHistory logs={logs} />
        </div>
      )}
    </div>
  )
}
