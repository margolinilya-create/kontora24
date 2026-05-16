import { useState } from 'react'
import { useProductionLogs } from '@/features/production/hooks/useProductionLogs'
import { ProductionLogForm } from '@/features/production/components/logs/ProductionLogForm'
import { ProductionLogHistory } from '@/features/production/components/logs/ProductionLogHistory'
import { addProductionLogAndCheckAdvance, updateOrderStatus } from '@/features/orders/hooks/useOrders'
import { PackDesignsForm } from '@/features/production/components/PackDesignsForm'
import { usePackDesigns } from '@/features/production/hooks/usePackDesigns'
import { computeIncoming, computeStageProgress } from '@/features/production/lib/production-logs'
import { StageJumper } from './StageJumper'
import ConfirmDialog from '@/shared/components/ConfirmDialog'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import {
  ORDER_STATUSES, FILM_TYPES, calculateActualMaterialsCost, getOrderRoute, IS_3D_STICKERPACK,
} from '@/shared/constants'

const NO_INPUT_STAGES = new Set(['new', 'design', 'prepress', 'otk', 'done', 'cancelled'])

function getProgressLines(order) {
  const route = getOrderRoute(order)
  const isPack3D = IS_3D_STICKERPACK(order.order_type)
  const is3D = isPack3D || order.order_type === 'sticker3D'
  // Для 3D-стикерпака стикеры вводятся поэвидово: всего нужно qty × кол-во видов.
  const packStickerTarget = isPack3D ? order.qty * (order.stickers_per_pack || 1) : order.qty
  const lines = []

  if (route.includes('print')) {
    lines.push({ key: 'print_stickers', stage: 'print', track: isPack3D ? 'stickers' : null, qtyField: 'stickers_printed', label: 'Напечатано стикеров', target: isPack3D ? packStickerTarget : undefined })
    if (isPack3D) {
      lines.push({ key: 'print_backgrounds', stage: 'print', track: 'backgrounds', qtyField: 'backgrounds_printed', label: 'Напечатано фонов' })
    }
  }
  if (route.includes('lamination')) {
    lines.push({ key: 'lamination_qty', stage: 'lamination', track: null, qtyField: 'lamination_qty', label: isPack3D ? 'Заламинировано фонов' : 'Заламинировано' })
  }
  if (route.includes('cutting')) {
    lines.push({ key: 'cutting', stage: 'cutting', track: isPack3D ? 'stickers' : null, qtyField: 'qty_cut', label: isPack3D ? 'Нарезано стикеров' : 'Нарезано', target: isPack3D ? packStickerTarget : undefined })
    if (isPack3D) {
      lines.push({ key: 'cutting_bg', stage: 'cutting', track: 'backgrounds', qtyField: 'qty_cut', label: 'Нарезано фонов' })
    }
  }
  if (route.includes('selection_pouring')) {
    lines.push({ key: 'selection', stage: 'selection_pouring', track: 'backgrounds', qtyField: 'qty_selected', label: 'Выбрано фонов' })
    lines.push({ key: 'pouring_pack', stage: 'selection_pouring', track: 'stickers', qtyField: 'stickers_good', label: 'Залито стикеров', target: packStickerTarget })
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

// Брак вычитается из total только для этапов из этого списка
// (на pouring/selection_pouring stickers_good/qty_selected уже годные).
const SUBTRACT_DEFECTS_STAGES = new Set(['print', 'cutting', 'lamination', 'packaging'])

function aggregateLine(logs, line) {
  let stageLogs = logs.filter((l) => l.stage === line.stage)
  if (line.track) stageLogs = stageLogs.filter((l) => l.track === line.track)
  const totalRaw = stageLogs.reduce((sum, l) => sum + (Number(l[line.qtyField]) || 0), 0)
  const defects = stageLogs.reduce((sum, l) => sum + (Number(l.defects) || 0), 0)
  const total = SUBTRACT_DEFECTS_STAGES.has(line.stage) ? Math.max(0, totalRaw - defects) : totalRaw
  return { total, defects }
}

// Расход плёнки сгруппированный по типу — для виджета на этапе печати.
// film_type больше не в логе → берём из заказа с учётом track для 3D-pack.
function aggregateFilmUsage(logs, order) {
  const isPack3D = IS_3D_STICKERPACK(order?.order_type)
  const byType = {}
  for (const l of logs) {
    if (l.stage !== 'print') continue
    const meters = Number(l.film_meters) || 0
    if (!meters) continue
    const ft = isPack3D && l.track === 'stickers'
      ? (order.film_type_stickers || order.film_type)
      : order.film_type
    if (!ft) continue
    byType[ft] = (byType[ft] || 0) + meters
  }
  return byType
}

function CurrentStageWidget({ order, logs, refetch, onUpdated }) {
  const stage = order.status
  const isPack3D = IS_3D_STICKERPACK(order.order_type)
  const route = getOrderRoute(order)

  const showPackDesigns = isPack3D && ['print', 'cutting', 'selection_pouring'].includes(stage)
  const packMode = stage === 'print' ? 'print' : stage === 'cutting' ? 'cutting' : 'pouring'
  const { designs, updateName } = usePackDesigns(showPackDesigns ? order.id : null)

  // ConfirmDialog «Завершить этап?» вместо auto-advance (фидбэк 17.05).
  const [pendingAdvance, setPendingAdvance] = useState(null) // { to } | null

  async function handleSubmit(s, data) {
    const res = await addProductionLogAndCheckAdvance(order.id, s, data, order)
    refetch()
    onUpdated?.()
    if (res?.is_complete && res?.next_status) {
      setPendingAdvance({ to: res.next_status })
    }
  }

  async function confirmAdvance() {
    if (!pendingAdvance) return
    try {
      await updateOrderStatus(order.id, order.status, pendingAdvance.to)
      toast.success('Этап завершён')
      onUpdated?.()
    } catch (err) {
      toast.error(translateError(err).message || err.message)
    } finally {
      setPendingAdvance(null)
    }
  }

  // Поэвидовой ввод стикеров для 3D-стикерпака — каждый «+» создаёт production_log
  // с worker_id + design_index + track='stickers' (единый учёт, см. usePackDesigns).
  const PACK_STICKER_FIELD = { print: 'stickers_printed', cutting: 'qty_cut', selection_pouring: 'stickers_good' }
  // Количественные поля трека «стикеры» убираем из общей формы — они вводятся
  // поэвидово. Для печати у трека остаётся «Плёнка стикеров», для резки/выборки
  // трек «стикеры» исчезает целиком (полей не остаётся).
  const PACK_OMIT_FIELDS = {
    print: { stickers: ['stickers_printed'] },
    cutting: { stickers: ['qty_cut', 'defects'] },
    selection_pouring: { stickers: ['stickers_good'] },
  }
  async function handlePackDesignSubmit(designIndex, { value, defects }) {
    const field = PACK_STICKER_FIELD[stage]
    const data = { track: 'stickers', design_index: designIndex, [field]: value }
    if (stage === 'cutting' && defects) data.defects = defects
    await handleSubmit(stage, data)
  }

  if (NO_INPUT_STAGES.has(stage)) {
    const label = ORDER_STATUSES[stage]?.label || stage
    return (
      <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
        <h2 className="font-semibold mb-1">Текущий этап: {label}</h2>
        <p className="text-sm text-text-muted mt-3 mb-4">На данном этапе нет ручного учёта.</p>
        <StageJumper order={order} onUpdated={onUpdated} />
      </div>
    )
  }

  const stageLabel = ORDER_STATUSES[stage]?.label || stage

  // Прогресс по трекам (если dual-track) или общий.
  // На ламинации 3D-стикерпака ламинируются ТОЛЬКО фоны — incoming считаем
  // по track='backgrounds' предыдущего этапа (фидбэк 17.05).
  let progressProp, incomingProp
  if (isPack3D && ['print', 'cutting', 'selection_pouring'].includes(stage)) {
    progressProp = {
      stickers: computeStageProgress(logs, stage, order.qty, 'stickers'),
      backgrounds: computeStageProgress(logs, stage, order.qty, 'backgrounds'),
    }
    incomingProp = {
      stickers: computeIncoming(logs, route, stage, order.qty, 'stickers'),
      backgrounds: computeIncoming(logs, route, stage, order.qty, 'backgrounds'),
    }
  } else if (isPack3D && stage === 'lamination') {
    progressProp = computeStageProgress(logs, stage, order.qty)
    incomingProp = computeIncoming(logs, route, stage, order.qty, 'backgrounds')
  } else {
    progressProp = computeStageProgress(logs, stage, order.qty)
    incomingProp = computeIncoming(logs, route, stage, order.qty, null)
  }

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
      <h2 className="font-semibold mb-3">Текущий этап: {stageLabel}</h2>
      {showPackDesigns && designs.length > 0 ? (
        <div className="mb-4">
          <p className="text-xs text-text-muted mb-2">Стикеры — по каждому виду отдельно</p>
          <PackDesignsForm
            designs={designs}
            logs={logs}
            stage={stage}
            route={route}
            onSubmitDesign={handlePackDesignSubmit}
            updateName={updateName}
            mode={packMode}
          />
          <div className="mt-4 pt-4 border-t border-border">
            <ProductionLogForm
              stage={stage}
              order={order}
              progress={progressProp}
              incoming={incomingProp}
              onSubmit={handleSubmit}
              omitFields={PACK_OMIT_FIELDS[stage]}
            />
          </div>
        </div>
      ) : (
        <ProductionLogForm stage={stage} order={order} progress={progressProp} incoming={incomingProp} onSubmit={handleSubmit} />
      )}

      <div className="mt-4 pt-4 border-t border-border">
        <StageJumper order={order} onUpdated={onUpdated} />
      </div>

      <ConfirmDialog
        isOpen={!!pendingAdvance}
        onClose={() => setPendingAdvance(null)}
        onConfirm={confirmAdvance}
        title="Все данные заполнены, завершить этап?"
        message={pendingAdvance ? `Заказ перейдёт на этап «${ORDER_STATUSES[pendingAdvance.to]?.label || pendingAdvance.to}». Если нужно дозаполнить — нажмите «Отмена».` : ''}
        confirmText="Завершить этап"
        variant="primary"
      />
    </div>
  )
}

function ProgressLinesWidget({ order, logs }) {
  const lines = getProgressLines(order)
  const target = order.qty
  const isOnPrint = order.status === 'print'
  const filmUsage = isOnPrint ? aggregateFilmUsage(logs, order) : null

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
      <h2 className="font-semibold mb-4">Прогресс по этапам</h2>
      <div className="space-y-3">
        {lines.map((line) => {
          const { total, defects } = aggregateLine(logs, line)
          const isQty = !line.unit
          const lineTarget = line.target ?? target
          const targetForLine = isQty ? lineTarget : null
          const overshoot = isQty && total > lineTarget ? total - lineTarget : 0
          const percentage = isQty && lineTarget > 0 ? Math.min(100, Math.round((total / lineTarget) * 100)) : null
          const isComplete = isQty ? total >= lineTarget : total > 0
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
  const { logs, refetch, updateLog, softDeleteLog, error: logsError } = useProductionLogs(order.id, order.qty)

  return (
    <div className="space-y-6">
      {logsError && (
        <div role="alert" className="bg-danger/10 border border-danger/30 text-danger rounded-lg px-3 py-2 text-sm">
          Не удалось загрузить логи производства. Прогресс по этапам может быть неполным.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CurrentStageWidget order={order} logs={logs} refetch={refetch} onUpdated={onUpdated} />
        <ProgressLinesWidget order={order} logs={logs} />
      </div>

      <ActualCostSummary order={order} logs={logs} />

      <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
        <h2 className="font-semibold mb-3">История записей</h2>
        <ProductionLogHistory logs={logs} onUpdateLog={updateLog} onDeleteLog={softDeleteLog} />
      </div>
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
