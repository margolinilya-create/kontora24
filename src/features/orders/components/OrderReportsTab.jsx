import { useAuth } from '@/features/auth/hooks/useAuth'
import { useProductionLogs } from '@/features/production/hooks/useProductionLogs'
import { ProductionLogForm } from '@/features/production/components/logs/ProductionLogForm'
import { ProductionLogHistory } from '@/features/production/components/logs/ProductionLogHistory'
import { addProductionLogAndCheckAdvance } from '@/features/orders/hooks/useOrders'

export function OrderReportsTab({ order, onUpdated }) {
  const { profile } = useAuth()
  const { logs, getStageProgress, refetch, updateLog, softDeleteLog, error: logsError } = useProductionLogs(order.id, order.qty)

  const myLogs = logs.filter((l) => l.worker_id === profile?.id)
  const progress = getStageProgress(order.status)
  const canLog = order.status !== 'new' && order.status !== 'done' && order.status !== 'cancelled' && order.status !== 'design'

  async function handleLogSubmit(stage, logData) {
    await addProductionLogAndCheckAdvance(order.id, stage, logData, order)
    refetch()
    onUpdated?.()
  }

  async function handleUpdateLog(logId, patch) {
    await updateLog(logId, patch)
    onUpdated?.()
  }

  async function handleDeleteLog(logId) {
    await softDeleteLog(logId)
    onUpdated?.()
  }

  return (
    <div className="space-y-6">
      {logsError && (
        <div role="alert" className="bg-danger/10 border border-danger/30 text-danger rounded-lg px-3 py-2 text-sm">
          Не удалось загрузить логи производства
        </div>
      )}
      {/* Log form for current stage */}
      {canLog && (
        <ProductionLogForm
          stage={order.status}
          order={order}
          progress={progress}
          onSubmit={handleLogSubmit}
        />
      )}

      {/* My contributions to this order */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="font-semibold mb-4">
          Мой вклад в заказ ({myLogs.length} {myLogs.length === 1 ? 'запись' : 'записей'})
        </h2>
        <ProductionLogHistory
          logs={myLogs}
          onUpdateLog={handleUpdateLog}
          onDeleteLog={handleDeleteLog}
        />
      </div>

      {/* All contributions (visible to admin/manager) */}
      {logs.length > myLogs.length && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4">Все записи ({logs.length})</h2>
          <ProductionLogHistory
            logs={logs}
            onUpdateLog={handleUpdateLog}
            onDeleteLog={handleDeleteLog}
          />
        </div>
      )}
    </div>
  )
}
