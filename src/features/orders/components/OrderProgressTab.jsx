import { useProductionLogs } from '@/features/production/hooks/useProductionLogs'
import { ProductionLogHistory } from '@/features/production/components/logs/ProductionLogHistory'
import { StageProgressBar } from '@/features/production/components/logs/StageProgressBar'
import { STAGE_FIELDS } from '@/features/production/lib/production-logs'
import { MaterialConsumption } from '@/features/production/components/MaterialConsumption'
import { PackDesignsForm } from '@/features/production/components/PackDesignsForm'
import { usePackDesigns } from '@/features/production/hooks/usePackDesigns'
import { getOrderRoute } from '@/shared/constants'

/**
 * Вкладка "Прогресс". Сверху для 3D-стикерпака — виджет заливки по видам
 * + виджет выборки фонов и упаковки. Ниже — общий прогресс по всем этапам.
 */
export function OrderProgressTab({ order, onUpdated }) {
  const { logs, getStageProgress, updateLog, softDeleteLog, error: logsError } = useProductionLogs(order.id, order.qty)
  const isPack3D = order.order_type === 'stickerpack3D'
  const isStickerOnly3D = order.order_type === 'sticker3D'
  const is3D = isPack3D || isStickerOnly3D

  const { designs, allComplete, addProgress, updateName } = usePackDesigns(isPack3D ? order.id : null)

  async function handleUpdate(logId, patch) {
    await updateLog(logId, patch)
    onUpdated?.()
  }

  async function handleDelete(logId) {
    await softDeleteLog(logId)
    onUpdated?.()
  }

  const selectionProgress = isPack3D ? getStageProgress('selection_pouring', 'backgrounds') : null
  const pouringProgress = isStickerOnly3D ? getStageProgress('pouring') : null
  const packagingProgress = getStageProgress('packaging')

  return (
    <div className="space-y-6">
      {logsError && (
        <div role="alert" className="bg-danger/10 border border-danger/30 text-danger rounded-lg px-3 py-2 text-sm">
          Не удалось загрузить логи производства. Прогресс по этапам может быть неполным.
        </div>
      )}

      {/* 3D-only widgets */}
      {is3D && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Заливка смолы — пак: по видам, одиночный 3D: общая шкала */}
          <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
            <h2 className="font-semibold mb-1">Заливка смолы</h2>
            <p className="text-xs text-text-muted mb-4">
              {isPack3D ? 'По каждому виду стикеров — отдельная шкала.' : 'Общая шкала залитых стикеров.'}
            </p>
            {isPack3D ? (
              <PackDesignsForm designs={designs} addProgress={addProgress} updateName={updateName} />
            ) : (
              <>
                <StageProgressBar progress={pouringProgress || { total: 0, target: order.qty, percentage: 0, isComplete: false }} />
                <p className="text-xs text-text-muted mt-2">
                  Ввод данных — на странице на вкладке «Расход материалов».
                </p>
              </>
            )}
          </div>

          {/* Выборка фонов и упаковка */}
          <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
            <h2 className="font-semibold mb-4">Выборка фонов и упаковка</h2>
            {isPack3D && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1 text-sm">
                  <span>Выбрано фонов</span>
                  <span className="text-text-muted">{selectionProgress?.total || 0} / {order.qty} шт</span>
                </div>
                <StageProgressBar progress={selectionProgress || { total: 0, target: order.qty, percentage: 0, isComplete: false }} />
              </div>
            )}
            <div>
              <div className="flex items-center justify-between mb-1 text-sm">
                <span>Упаковано</span>
                <span className="text-text-muted">{packagingProgress.total} / {order.qty} шт</span>
              </div>
              <StageProgressBar progress={packagingProgress} />
            </div>
            {isPack3D && allComplete && (
              <p className="text-xs text-success mt-3">Все виды залиты. Готово к сборке.</p>
            )}
          </div>
        </div>
      )}

      {/* Stage progress cards (общий обзор всех этапов) */}
      <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
        <h2 className="font-semibold mb-4">Прогресс по этапам</h2>
        <div className="space-y-3">
          {getOrderRoute(order).filter(s => s !== 'new' && s !== 'done' && s !== 'cancelled').map((stage) => {
            const config = STAGE_FIELDS[stage]
            if (!config) return null

            const progress = getStageProgress(stage)
            const isCurrentStage = order.status === stage
            const stageLogs = logs.filter((l) => l.stage === stage)

            return (
              <div
                key={stage}
                className={`rounded-xl border p-3 ${isCurrentStage ? 'border-accent/30 bg-accent/[0.03]' : 'border-border'}`}
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

                {stageLogs.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <ProductionLogHistory
                      logs={stageLogs}
                      onUpdateLog={handleUpdate}
                      onDeleteLog={handleDelete}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Material consumption */}
      <MaterialConsumption order={order} />
    </div>
  )
}
