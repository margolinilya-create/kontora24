import { OrderTimeline } from './OrderTimeline'
import { StatusSwitcher } from './StatusSwitcher'
import { useProductionLogs } from '@/features/production/hooks/useProductionLogs'
import { ProductionLogHistory } from '@/features/production/components/logs/ProductionLogHistory'
import { StageProgressBar } from '@/features/production/components/logs/StageProgressBar'
import { STAGE_FIELDS } from '@/features/production/lib/production-logs'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { TaskTimer } from '@/features/production/components/TaskTimer'
import { MaterialConsumption } from '@/features/production/components/MaterialConsumption'
import { ORDER_STATUSES, getOrderRoute } from '@/shared/constants'
import { formatDateTime } from '@/shared/lib/utils'

export function OrderProgressTab({ order, history, onUpdated }) {
  const { hasRole } = useAuth()
  const { logs, getStageProgress, error: logsError } = useProductionLogs(order.id, order.qty)

  return (
    <div className="space-y-6">
      {logsError && (
        <div role="alert" className="bg-danger/10 border border-danger/30 text-danger rounded-lg px-3 py-2 text-sm">
          Не удалось загрузить логи производства. Прогресс по этапам может быть неполным.
        </div>
      )}
      {/* Timeline */}
      <OrderTimeline order={order} history={history} />

      {/* Current stage timer */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="font-semibold mb-3">Таймер</h2>
        <TaskTimer orderId={order.id} orderStatus={order.status} />
      </div>

      {/* Stage progress cards */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="font-semibold mb-4">Прогресс по этапам</h2>
        <div className="space-y-4">
          {getOrderRoute(order).filter(s => s !== 'new' && s !== 'done' && s !== 'cancelled').map((stage) => {
            const config = STAGE_FIELDS[stage]
            if (!config) return null

            const progress = getStageProgress(stage)
            const isCurrentStage = order.status === stage
            const stageLogs = logs.filter((l) => l.stage === stage)

            return (
              <div
                key={stage}
                className={`rounded-xl border p-4 ${isCurrentStage ? 'border-accent/30 bg-accent/[0.03]' : 'border-border'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${isCurrentStage ? 'text-accent' : ''}`}>
                      {config.label}
                    </span>
                    {isCurrentStage && (
                      <span className="text-[10px] bg-accent/15 text-accent px-2 py-0.5 rounded-full font-medium">
                        Текущий
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-text-muted">
                    {progress.total} / {progress.target} шт
                  </span>
                </div>

                <StageProgressBar progress={progress} />

                {/* Log entries for this stage */}
                {stageLogs.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <ProductionLogHistory logs={stageLogs} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Material consumption */}
      <MaterialConsumption order={order} />

      {/* Admin: manual status override */}
      {hasRole(['admin', 'manager']) && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-3">Управление статусом</h2>
          <StatusSwitcher order={order} onUpdated={onUpdated} />
        </div>
      )}

      {/* Full status history */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="font-semibold mb-3">История статусов</h2>
        {history.length === 0 ? (
          <p className="text-sm text-text-muted">Нет записей</p>
        ) : (
          <div className="space-y-3">
            {history.map((h) => (
              <div key={h.id} className="flex items-start gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-accent mt-1.5 flex-shrink-0" />
                <div>
                  <p>
                    {h.from_status && (
                      <><span className="text-text-muted">{ORDER_STATUSES[h.from_status]?.label}</span>{' → '}</>
                    )}
                    <span className="font-medium">{ORDER_STATUSES[h.to_status]?.label || h.to_status}</span>
                  </p>
                  <p className="text-xs text-text-muted">
                    {h.changed_by_profile?.display_name} · {formatDateTime(h.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
