import { useState, useCallback } from 'react'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useProductionLogs } from '@/features/production/hooks/useProductionLogs'
import { ProductionLogForm } from '@/features/production/components/logs/ProductionLogForm'
import { ProductionLogHistory } from '@/features/production/components/logs/ProductionLogHistory'
import { StageProgressBar } from '@/features/production/components/logs/StageProgressBar'
import { STAGE_FIELDS } from '@/features/production/lib/production-logs'
import { addProductionLogAndCheckAdvance } from '@/features/orders/hooks/useOrders'
import { canWorkOnStage } from '@/shared/constants'

export function OrderStageInput({ order, onUpdated }) {
  const { profile } = useAuth()
  const stage = order.status
  const config = STAGE_FIELDS[stage]
  const { logs, getStageProgress, error: logsError } = useProductionLogs(order.id, order.qty)
  const [showHistory, setShowHistory] = useState(false)

  const canWork = profile && canWorkOnStage(profile.role, stage)
  const progress = config ? getStageProgress(stage) : null
  const stageLogs = logs.filter((l) => l.stage === stage)

  const handleSubmit = useCallback(async (logStage, logData) => {
    await addProductionLogAndCheckAdvance(order.id, logStage, logData, order)
    onUpdated?.()
  }, [order, onUpdated])

  if (!config) return null

  return (
    <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
      <h2 className="font-semibold text-lg">Запись: {config.label}</h2>

      <StageProgressBar progress={progress} />

      {logsError && (
        <div role="alert" className="text-xs text-danger bg-danger/10 border border-danger/30 rounded px-2 py-1">
          Не удалось загрузить историю записей
        </div>
      )}

      {canWork && !logsError && (
        <ProductionLogForm
          stage={stage}
          progress={progress}
          onSubmit={handleSubmit}
        />
      )}

      {stageLogs.length > 0 && (
        <div>
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="text-sm text-accent hover:underline"
          >
            {showHistory ? 'Скрыть записи' : `Показать записи (${stageLogs.length})`}
          </button>
          {showHistory && (
            <div className="mt-3 pt-3 border-t border-border">
              <ProductionLogHistory logs={stageLogs} stage={stage} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
