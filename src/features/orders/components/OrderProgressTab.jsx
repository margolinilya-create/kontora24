import { useProductionLogs } from '@/features/production/hooks/useProductionLogs'
import { ProductionLogForm } from '@/features/production/components/logs/ProductionLogForm'
import { addProductionLogAndCheckAdvance } from '@/features/orders/hooks/useOrders'
import { PackDesignsForm } from '@/features/production/components/PackDesignsForm'
import { usePackDesigns } from '@/features/production/hooks/usePackDesigns'
import {
  ORDER_STATUSES, FILM_TYPES, calculateActualMaterialsCost, getOrderRoute,
} from '@/shared/constants'

// Этапы где нет ручного учёта (worker не вводит данные).
const NO_INPUT_STAGES = new Set(['new', 'design', 'prepress', 'otk', 'done', 'cancelled'])

// Линии аналитики прогресса справа. Показываем только то, что входит в маршрут заказа.
function getProgressLines(order) {
  const route = getOrderRoute(order)
  const isPack3D = order.order_type === 'stickerpack3D'
  const is3D = isPack3D || order.order_type === 'sticker3D'
  const lines = []

  if (route.includes('print')) {
    lines.push({ key: 'print_stickers', stage: 'print', track: isPack3D ? 'stickers' : null, qtyField: 'stickers_printed', label: 'Напечатано стикеров' })
    if (isPack3D) {
      lines.push({ key: 'print_backgrounds', stage: 'print', track: 'backgrounds', qtyField: 'backgrounds_printed', label: 'Напечатано фонов' })
    }
  }
  if (route.includes('lamination')) {
    lines.push({ key: 'lamination', stage: 'lamination', track: null, qtyField: 'lamination_meters', label: isPack3D ? 'Заламинировано фонов' : 'Заламинировано', unit: 'м' })
  }
  if (route.includes('cutting')) {
    lines.push({ key: 'cutting', stage: 'cutting', track: isPack3D ? 'stickers' : null, qtyField: 'qty_cut', label: 'Нарезано стикеров' })
    if (isPack3D) {
      lines.push({ key: 'cutting_bg', stage: 'cutting', track: 'backgrounds', qtyField: 'qty_cut', label: 'Нарезано фонов' })
    }
  }
  if (route.includes('selection_pouring')) {
    lines.push({ key: 'selection', stage: 'selection_pouring', track: 'backgrounds', qtyField: 'qty_selected', label: 'Выбрано фонов' })
    lines.push({ key: 'pouring_pack', stage: 'selection_pouring', track: 'stickers', qtyField: 'stickers_good', label: 'Залито стикеров' })
  }
  if (route.includes('pouring')) {
    lines.push({ key: 'pouring', stage: 'pouring', track: null, qtyField: 'stickers_good', label: 'Залито стикеров (хороших)' })
  }
  if (route.includes('assembly_3d')) {
    lines.push({ key: 'assembly', stage: 'assembly_3d', track: null, qtyField: 'packs_assembled', label: 'Собрано паков' })
  }
  if (route.includes('packaging')) {
    lines.push({ key: 'packaging', stage: 'packaging', track: null, qtyField: 'packs_packaged', label: is3D ? 'Упаковано стикеров' : 'Упаковано' })
  }

  return lines
}

function aggregateLine(logs, line) {
  let stageLogs = logs.filter((l) => l.stage === line.stage)
  if (line.track) stageLogs = stageLogs.filter((l) => l.track === line.track)
  const total = stageLogs.reduce((sum, l) => sum + (Number(l[line.qtyField]) || 0), 0)
  const defects = stageLogs.reduce((sum, l) => sum + (Number(l.defects) || 0), 0)
  return { total, defects }
}

// Расход плёнки сгруппированный по типу — для виджета на этапе печати.
function aggregateFilmUsage(logs, fallbackFilmType) {
  const byType = {}
  for (const l of logs) {
    if (l.stage !== 'print') continue
    const meters = Number(l.film_meters) || 0
    if (!meters) continue
    const ft = l.film_type || fallbackFilmType
    if (!ft) continue
    byType[ft] = (byType[ft] || 0) + meters
  }
  return byType
}

/**
 * Левый виджет: ввод данных по текущему этапу.
 * На NO_INPUT_STAGES — статичная плашка. На остальных — ProductionLogForm.
 */
function CurrentStageWidget({ order, getStageProgress, refetch, onUpdated }) {
  const stage = order.status
  const isPack3D = order.order_type === 'stickerpack3D'

  // PackDesignsForm для stickerpack3D на этапах ввода стикеров (печать стикеров и заливка стикеров)
  const showPackDesigns = isPack3D && (stage === 'print' || stage === 'pouring' || stage === 'selection_pouring')
  const { designs, addProgress, updateName } = usePackDesigns(showPackDesigns ? order.id : null)

  async function handleSubmit(s, data) {
    await addProductionLogAndCheckAdvance(order.id, s, data, order)
    refetch()
    onUpdated?.()
  }

  if (NO_INPUT_STAGES.has(stage)) {
    const label = ORDER_STATUSES[stage]?.label || stage
    return (
      <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
        <h2 className="font-semibold mb-1">Текущий этап: {label}</h2>
        <p className="text-sm text-text-muted mt-3">На данном этапе нет ручного учёта.</p>
      </div>
    )
  }

  const stageLabel = ORDER_STATUSES[stage]?.label || stage
  const progress = getStageProgress(stage)

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
      <h2 className="font-semibold mb-3">Текущий этап: {stageLabel}</h2>
      {showPackDesigns && designs.length > 0 ? (
        <div className="mb-4">
          <p className="text-xs text-text-muted mb-2">По каждому виду стикеров — отдельно</p>
          <PackDesignsForm designs={designs} addProgress={addProgress} updateName={updateName} />
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-text-muted mb-2">Общий лог этапа</p>
            <ProductionLogForm stage={stage} order={order} progress={progress} onSubmit={handleSubmit} />
          </div>
        </div>
      ) : (
        <ProductionLogForm stage={stage} order={order} progress={progress} onSubmit={handleSubmit} />
      )}
    </div>
  )
}

/**
 * Правый виджет: список линий прогресса по этапам производства.
 * В правом верхнем углу каждой линии: красным — брак, серым — излишки.
 */
function ProgressLinesWidget({ order, logs }) {
  const lines = getProgressLines(order)
  const target = order.qty
  const isOnPrint = order.status === 'print'
  const filmUsage = isOnPrint ? aggregateFilmUsage(logs, order.film_type) : null

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
      <h2 className="font-semibold mb-4">Прогресс по этапам</h2>
      <div className="space-y-3">
        {lines.map((line) => {
          const { total, defects } = aggregateLine(logs, line)
          const isQty = !line.unit
          const targetForLine = isQty ? target : null
          const overshoot = isQty && total > target ? total - target : 0
          const percentage = isQty && target > 0 ? Math.min(100, Math.round((total / target) * 100)) : null
          const isComplete = isQty ? total >= target : total > 0
          const unit = line.unit || 'шт'

          return (
            <div key={line.key} className="rounded-xl border border-border p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-sm font-medium">{line.label}</span>
                <div className="flex items-center gap-2 shrink-0 text-xs">
                  {defects > 0 && (
                    <span className="text-danger font-medium" title="Брак">−{defects}</span>
                  )}
                  {overshoot > 0 && (
                    <span className="text-text-muted" title="Излишки">+{overshoot}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-text-muted mb-1">
                <span className="tabular-nums">
                  {total} {targetForLine !== null && <>/ {targetForLine}</>} {unit}
                </span>
                {percentage !== null && (
                  <span className={isComplete ? 'text-success font-medium' : ''}>{percentage}%</span>
                )}
              </div>
              {percentage !== null && (
                <div className="h-1.5 bg-surface-dim rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${isComplete ? 'bg-success' : 'bg-accent'}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Расход плёнки — только когда заказ на этапе печати */}
      {isOnPrint && filmUsage && Object.keys(filmUsage).length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <h3 className="font-semibold text-sm mb-2">Расход плёнки</h3>
          <div className="space-y-1.5">
            {Object.entries(filmUsage).map(([ft, m]) => (
              <div key={ft} className="flex items-center justify-between text-xs">
                <span className="text-text-muted">{FILM_TYPES[ft]?.label || ft}</span>
                <span className="font-medium tabular-nums">{m.toFixed(1)} м</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function OrderProgressTab({ order, onUpdated }) {
  const { logs, getStageProgress, refetch, error: logsError } = useProductionLogs(order.id, order.qty)

  return (
    <div className="space-y-6">
      {logsError && (
        <div role="alert" className="bg-danger/10 border border-danger/30 text-danger rounded-lg px-3 py-2 text-sm">
          Не удалось загрузить логи производства. Прогресс по этапам может быть неполным.
        </div>
      )}

      {/* Два виджета по горизонтали */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CurrentStageWidget order={order} getStageProgress={getStageProgress} refetch={refetch} onUpdated={onUpdated} />
        <ProgressLinesWidget order={order} logs={logs} />
      </div>

      {/* Сводка фактического расхода — справочно */}
      <ActualCostSummary order={order} logs={logs} />
    </div>
  )
}

function ActualCostSummary({ order, logs }) {
  const cost = calculateActualMaterialsCost(logs, order.film_type)
  if (cost.total === 0) return null
  return (
    <div className="bg-surface-2 rounded-xl border border-border px-4 py-2.5 text-xs text-text-muted flex flex-wrap gap-x-6 gap-y-1">
      <span>Плёнка: <strong className="text-text">{Math.round(cost.filmsTotal)} ₽</strong></span>
      {cost.resinGrams > 0 && (
        <span>Смола {cost.resinGrams.toFixed(0)} г: <strong className="text-text">{Math.round(cost.resinCost)} ₽</strong></span>
      )}
      <span>Итого: <strong className="text-text">{Math.round(cost.total)} ₽</strong></span>
    </div>
  )
}
