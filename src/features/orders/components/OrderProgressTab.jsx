import { useState } from 'react'
import { useProductionLogs } from '@/features/production/hooks/useProductionLogs'
import { ProductionLogForm } from '@/features/production/components/logs/ProductionLogForm'
import { ProductionLogHistory } from '@/features/production/components/logs/ProductionLogHistory'
import { addProductionLogAndCheckAdvance, updateOrderStatus } from '@/features/orders/hooks/useOrders'
import { PackDesignsForm } from '@/features/production/components/PackDesignsForm'
import { usePackDesigns } from '@/features/production/hooks/usePackDesigns'
import { useOrderSubtasks } from '@/features/orders/hooks/useOrderSubtasks'
import { useOrderItems } from '@/features/orders/hooks/useOrderItems'
import { computeIncoming, computeStageProgress, hasSubtaskLog, SUBTRACT_DEFECTS_STAGES } from '@/features/production/lib/production-logs'
import { StageJumper } from './StageJumper'
import { ThreeDPouringExportButton } from './ThreeDPouringExportButton'
import { DryingTimer } from './DryingTimer'
import { CreateExtraStickersButton } from './CreateExtraStickersButton'
import { SamplePrintWidget } from './SamplePrintWidget'
import ConfirmDialog from '@/shared/components/ConfirmDialog'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import {
  ORDER_STATUSES, FILM_TYPES, calculateActualMaterialsCost, getOrderRoute, IS_3D_STICKERPACK,
  getNextSubtaskStatus, TRACK_LABELS, SUBTASK_STATUS_LABELS, getSubtaskRoute,
} from '@/shared/constants'
import { useAuth } from '@/features/auth/hooks/useAuth'

// R11.2: sample_layout / batch_layout — без производственных данных, advance
// через StatusSwitcher. color_approval имеет свой контрол ColorApprovalControls
// в header'е, на CurrentStageWidget показываем заглушку.
// R13.2 (бриф 02.06): prepress теперь имеет форму с prepared_qty — убираем из NO_INPUT.
const NO_INPUT_STAGES = new Set([
  'new', 'design', 'sample_layout', 'color_approval', 'batch_layout',
  'otk', 'done', 'cancelled',
])

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
  // R14.4: для sticker3D — отдельная линия «После сушки» = залитые − брак сушки.
  // Кастомная агрегация (см. aggregateLine — ветка для stage='drying').
  if (route.includes('drying')) {
    lines.push({ key: 'drying', stage: 'drying', track: null, qtyField: '__drying', label: 'Годных после сушки' })
  }
  if (route.includes('assembly_3d')) {
    lines.push({ key: 'assembly', stage: 'assembly_3d', track: null, qtyField: 'packs_assembled', label: 'Собрано паков' })
  }
  if (route.includes('packaging')) {
    lines.push({ key: 'packaging', stage: 'packaging', track: null, qtyField: 'packs_packaged', label: is3D ? 'Упаковано стикеров' : 'Упаковано' })
  }
  return lines
}

// R15.5 (бриф 04.06 #12, audit): константа теперь импортируется из
// production-logs.js (единая точка истины). Раньше тут была локальная копия
// с лишним 'drying' — но aggregateLine для drying идёт по кастомной ветке
// (incoming − dryingDefects, allowNegative), сет не читается. Dead code убран.

function aggregateLine(logs, line) {
  // R14.4: drying — total начинается от incoming (залитых на pouring/selection_pouring)
  // минус брак на drying. Отрицательные значения НЕ обрезаются — пусть менеджер
  // видит «−N перепечатать» если брак превысил тираж.
  if (line.stage === 'drying') {
    const pourField = (l) => Number(l.stickers_good) || Number(l.stickers_poured) || 0
    const incoming = logs
      .filter((l) => l.stage === 'pouring' || l.stage === 'selection_pouring')
      .reduce((sum, l) => sum + pourField(l), 0)
    const dryingDefects = logs
      .filter((l) => l.stage === 'drying')
      .reduce((sum, l) => sum + (Number(l.defects) || 0), 0)
    return { total: incoming - dryingDefects, defects: dryingDefects, allowNegative: true }
  }
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

  // Sticker3D multi-variant (фидбэк 28.05): на печать/резку/заливку показываем
  // PackDesignsForm с N=design_variants видов, k24_pack_designs создаются триггером.
  const isSticker3DMulti = order.order_type === 'sticker3D' && (order.design_variants || 1) > 1
  // R14.3 (бриф 03.06): prepress добавлен — на нём менеджер вводит план по
  // каждому виду. Это запускает полноценный учёт на следующих этапах.
  // R14.4 (бриф 03.06): drying добавлен для sticker3D — менеджер вносит брак
  // после сушки по каждому виду.
  const PACK_STAGES_3D_PACK = ['prepress', 'print', 'cutting', 'selection_pouring']
  const PACK_STAGES_STICKER3D = ['prepress', 'print', 'cutting', 'pouring', 'drying']
  const showPackDesigns =
    (isPack3D && PACK_STAGES_3D_PACK.includes(stage)) ||
    (isSticker3DMulti && PACK_STAGES_STICKER3D.includes(stage))
  const packMode = stage === 'prepress' ? 'prepress'
    : stage === 'print' ? 'print'
    : stage === 'cutting' ? 'cutting'
    : stage === 'drying' ? 'drying'
    : 'pouring'
  const { designs, updateName, updateQtyPlanned } = usePackDesigns(showPackDesigns ? order.id : null)

  // Подзадачи 3D-стикерпака (track-уровень) — миграция 032, фидбэк 17.05.
  const { subtasks, advance: advanceSubtask } = useOrderSubtasks(order.id, isPack3D)

  // ConfirmDialog «Завершить этап?» вместо auto-advance (фидбэк 17.05).
  const [pendingAdvance, setPendingAdvance] = useState(null) // { to } | null
  // ConfirmDialog «Отправить фоны/стикеры на N?» (R7 — параллельные подзадачи)
  const [pendingSubtask, setPendingSubtask] = useState(null) // { track, from, to } | null

  async function handleSubmit(s, data) {
    const res = await addProductionLogAndCheckAdvance(order.id, s, data, order)
    refetch()
    onUpdated?.()

    // Приоритет: трек-advance показываем раньше основного advance (для 3D-pack).
    if (res?.completed_track && isPack3D) {
      const sub = subtasks[res.completed_track]
      if (sub) {
        const next = getNextSubtaskStatus(res.completed_track, sub.status, order)
        if (next) {
          setPendingSubtask({ track: res.completed_track, from: sub.status, to: next })
          return
        }
      }
    }
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

  async function confirmSubtaskAdvance() {
    if (!pendingSubtask) return
    try {
      const res = await advanceSubtask(pendingSubtask.track, pendingSubtask.to)
      toast.success(`${TRACK_LABELS[pendingSubtask.track]} → ${SUBTASK_STATUS_LABELS[pendingSubtask.to]}`)
      onUpdated?.()
      // both_ready=true → обе подзадачи готовы, можно перевести заказ на assembly_3d
      if (res?.both_ready) {
        setPendingAdvance({ to: 'assembly_3d' })
      }
    } catch (err) {
      toast.error(translateError(err).message || err.message)
    } finally {
      setPendingSubtask(null)
    }
  }

  // Поэвидовой ввод стикеров для 3D-стикерпака (track='stickers') и для sticker3D
  // multi-variant (track=NULL) — каждый «+» создаёт production_log с worker_id +
  // design_index (единый учёт, см. usePackDesigns).
  // На pouring/selection_pouring пишем stickers_poured + computed stickers_good
  // (фидбэк 28.05). Для legacy-агрегаций stickers_good сохраняем = value - defects.
  const PACK_STICKER_FIELD = {
    print: 'stickers_printed',
    cutting: 'qty_cut',
    selection_pouring: 'stickers_poured',
    pouring: 'stickers_poured',
  }
  // Количественные поля убираем из общей формы — они вводятся поэвидово.
  // Для печати у трека остаётся «Плёнка стикеров», для резки/выборки/заливки
  // количественные поля исчезают (брак тоже).
  const PACK_OMIT_FIELDS = {
    print: { stickers: ['stickers_printed'] },
    cutting: { stickers: ['qty_cut', 'defects'] },
    selection_pouring: { stickers: ['stickers_poured', 'defects'] },
    pouring: { single: ['stickers_poured', 'defects'] },
  }
  async function handlePackDesignSubmit(designIndex, { value, defects }) {
    // R14.3: на prepress сохраняем только qty_planned в k24_pack_designs,
    // production_log не пишем — расход материалов считается на следующих этапах.
    if (stage === 'prepress') {
      await updateQtyPlanned(designIndex, value)
      return
    }
    // R14.4: на drying value — это «брак после сушки», пишем как defects лог
    // с track='stickers' + design_index. Логика вычитания — см. aggregateLine.
    if (stage === 'drying') {
      await handleSubmit(stage, { track: 'stickers', design_index: designIndex, defects: value })
      return
    }
    const field = PACK_STICKER_FIELD[stage]
    // PackDesignsForm.designStats фильтрует по track='stickers', поэтому для
    // sticker3D multi-variant тоже пишем track='stickers' (логи группируются
    // только по design_index, семантика «фон/стикер» неактуальна).
    const data = { track: 'stickers', design_index: designIndex, [field]: value }
    if ((stage === 'cutting' || stage === 'pouring' || stage === 'selection_pouring') && defects) {
      data.defects = defects
    }
    if (stage === 'pouring' || stage === 'selection_pouring') {
      data.stickers_good = Math.max(0, Number(value || 0) - Number(defects || 0))
    }
    await handleSubmit(stage, data)
  }

  if (stage === 'sample_print') {
    return (
      <div className="space-y-4">
        <StageJumperBlock order={order} onUpdated={onUpdated} />
        <SamplePrintWidget order={order} onAdvanced={onUpdated} />
      </div>
    )
  }

  if (NO_INPUT_STAGES.has(stage)) {
    const label = ORDER_STATUSES[stage]?.label || stage
    return (
      <div className="space-y-4">
        <StageJumperBlock order={order} onUpdated={onUpdated} />
        <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
          <h2 className="font-semibold mb-1">Учёт работы на этапе: {label}</h2>
          <p className="text-sm text-text-muted mt-3">На данном этапе нет ручного учёта.</p>
        </div>
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
    <div className="space-y-4">
      <StageJumperBlock order={order} onUpdated={onUpdated} />

      {stage === 'drying' && (
        <DryingTimer startedAt={order.drying_started_at} />
      )}

      <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
        <h2 className="font-semibold mb-3">Учёт работы на этапе: {stageLabel}</h2>
        {showPackDesigns && designs.length > 0 ? (
          <div>
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

      <ConfirmDialog
        isOpen={!!pendingSubtask}
        onClose={() => setPendingSubtask(null)}
        onConfirm={confirmSubtaskAdvance}
        title={pendingSubtask ? `Отправить ${(TRACK_LABELS[pendingSubtask.track] || pendingSubtask.track).toLowerCase()}ы на ${(SUBTASK_STATUS_LABELS[pendingSubtask.to] || pendingSubtask.to).toLowerCase()}?` : ''}
        message={pendingSubtask ? `Подзадача «${TRACK_LABELS[pendingSubtask.track]}» перейдёт на этап «${SUBTASK_STATUS_LABELS[pendingSubtask.to]}». Другая подзадача останется на текущем этапе.` : ''}
        confirmText="Отправить дальше"
        variant="primary"
      />
    </div>
  )
}

// Обёртка StageJumper в карточке. Не рендерит карточку если у пользователя нет
// прав (StageJumper сам возвращает null) — чтобы не было пустого блока.
function StageJumperBlock({ order, onUpdated }) {
  const { hasRole } = useAuth()
  if (!hasRole(['admin', 'manager'])) return null
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
      <StageJumper order={order} onUpdated={onUpdated} />
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
          const { total, defects, allowNegative } = aggregateLine(logs, line)
          const isQty = !line.unit
          const lineTarget = line.target ?? target
          const targetForLine = isQty ? lineTarget : null
          const overshoot = isQty && total > lineTarget ? total - lineTarget : 0
          // R14.4: для drying допускаем отрицательные значения (брак > залитых).
          const rawPct = isQty && lineTarget > 0 ? Math.round((total / lineTarget) * 100) : null
          const percentage = rawPct === null
            ? null
            : (allowNegative ? Math.max(-100, Math.min(100, rawPct)) : Math.min(100, Math.max(0, rawPct)))
          const isNegative = allowNegative && total < 0
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
                    className={`h-full rounded-full transition-all duration-500 ease-out ${
                      isNegative ? 'bg-danger' : isComplete ? 'bg-success' : 'bg-accent'
                    }`}
                    style={{ width: `${Math.abs(percentage)}%` }}
                  />
                </div>
              )}
              {isNegative && (
                <p className="text-xs text-danger mt-1">
                  Брак превысил залитые на {Math.abs(total)} шт — нужна допечатка.
                </p>
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

function MiniStepper({ route, status, accentClass }) {
  const currentIdx = route.indexOf(status)
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {route.map((s, i) => {
        const done = i < currentIdx
        const current = i === currentIdx
        return (
          <span key={s} className="flex items-center gap-1">
            <span
              className={[
                'inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold',
                done ? `${accentClass} text-white` : current ? `${accentClass} text-white ring-2 ring-offset-1 ring-offset-surface ring-current` : 'bg-surface-dim text-text-muted border border-border',
              ].join(' ')}
              title={SUBTASK_STATUS_LABELS[s]}
            >
              {i + 1}
            </span>
            <span className={`text-xs ${current ? 'font-semibold' : 'text-text-muted'}`}>
              {SUBTASK_STATUS_LABELS[s] || s}
            </span>
            {i < route.length - 1 && <span className="text-text-muted text-xs">·</span>}
          </span>
        )
      })}
    </div>
  )
}

function SubtaskTrackBlock({ track, subtask, advance, onUpdated, canJump, logs, order }) {
  const [target, setTarget] = useState('')
  const [saving, setSaving] = useState(false)
  const status = subtask?.status
  // R9.5B (бриф 26.05): маршрут с учётом need_lam — у фонов нет 'laminating'
  // если ламинация не нужна.
  const route = getSubtaskRoute(track, order)
  const otherOptions = route.filter((s) => s !== status)
  const next = getNextSubtaskStatus(track, status, order)

  // Нельзя advance если для текущего status трека ещё нет ни одного production_log.
  // Кроме pending/ready/cancelled — там учёта не бывает (hasSubtaskLog возвращает true).
  const canAdvance = hasSubtaskLog(logs || [], track, status)
  const accent = track === 'backgrounds' ? 'bg-dept-print' : 'bg-dept-pouring'
  const tone = track === 'backgrounds' ? 'border-dept-print/30 bg-dept-print/5' : 'border-dept-pouring/30 bg-dept-pouring/5'

  async function complete() {
    if (!next) return
    if (!canAdvance) {
      toast.error(`Сначала внесите данные на этапе «${SUBTASK_STATUS_LABELS[status]}»`)
      return
    }
    setSaving(true)
    try {
      await advance(track, next)
      toast.success(`${TRACK_LABELS[track]} → ${SUBTASK_STATUS_LABELS[next]}`)
      onUpdated?.()
    } catch (err) {
      toast.error(translateError(err).message || err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleJump() {
    if (!target) return
    if (!canAdvance) {
      toast.error(`Сначала внесите данные на этапе «${SUBTASK_STATUS_LABELS[status]}»`)
      return
    }
    setSaving(true)
    try {
      await advance(track, target)
      toast.success(`${TRACK_LABELS[track]} → ${SUBTASK_STATUS_LABELS[target]}`)
      setTarget('')
      onUpdated?.()
    } catch (err) {
      toast.error(translateError(err).message || err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded ${accent} text-white`}>
          {TRACK_LABELS[track]}
        </span>
        <span className="text-sm font-medium text-text">{SUBTASK_STATUS_LABELS[status] || status}</span>
      </div>

      <MiniStepper route={route} status={status} accentClass={accent} />

      {status === 'drying' && (
        <DryingTimer startedAt={subtask?.drying_started_at} />
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {next ? (
          <button
            onClick={complete}
            disabled={saving || !canAdvance}
            title={!canAdvance ? `Сначала внесите данные на этапе «${SUBTASK_STATUS_LABELS[status]}»` : ''}
            className="bg-accent hover:bg-accent-hover text-on-accent font-medium rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-50 min-h-[40px] flex-1 sm:flex-none"
          >
            {saving ? '…' : `Завершить «${SUBTASK_STATUS_LABELS[status]}» → ${SUBTASK_STATUS_LABELS[next]}`}
          </button>
        ) : (
          <span className="text-xs text-text-muted px-2 py-1">Трек завершён</span>
        )}

        {canJump && (
          <div className="flex items-center gap-1 ml-auto">
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="rounded-md border border-border px-2 py-1 text-xs bg-surface focus:outline-none focus:ring-2 focus:ring-accent/50"
              aria-label={`Перейти на другой статус ${TRACK_LABELS[track]}`}
            >
              <option value="">↺ откат / переход</option>
              {otherOptions.map((s) => (
                <option key={s} value={s}>{SUBTASK_STATUS_LABELS[s] || s}</option>
              ))}
            </select>
            {target && (
              <button
                onClick={handleJump}
                disabled={saving}
                className="text-xs px-2.5 py-1 rounded-md bg-surface-dim border border-border font-medium disabled:opacity-50 hover:bg-surface-2 transition-colors"
              >
                {saving ? '…' : 'OK'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function VariantSubtaskBlock({ item, status, route, onAdvance, canJump }) {
  const [target, setTarget] = useState('')
  const [saving, setSaving] = useState(false)
  const currentIdx = route.indexOf(status)
  const next = currentIdx >= 0 && currentIdx < route.length - 1 ? route[currentIdx + 1] : null
  const otherOptions = route.filter((s) => s !== status)

  async function complete() {
    if (!next) return
    setSaving(true)
    try {
      await onAdvance(item.idx, next)
      toast.success(`Вид ${item.idx} → ${ORDER_STATUSES[next]?.label || next}`)
    } catch (err) {
      toast.error(translateError(err).message || err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleJump() {
    if (!target) return
    setSaving(true)
    try {
      await onAdvance(item.idx, target)
      toast.success(`Вид ${item.idx} → ${ORDER_STATUSES[target]?.label || target}`)
      setTarget('')
    } catch (err) {
      toast.error(translateError(err).message || err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <span className="text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-accent text-on-accent">
            Вид {item.idx}
          </span>
          <span className="text-xs text-text-muted ml-2">
            {Number(item.width_mm)}×{Number(item.height_mm)} мм · {Number(item.qty)} шт
          </span>
        </div>
        <span className="text-sm font-medium">{ORDER_STATUSES[status]?.label || status}</span>
      </div>

      {/* Mini-stepper по order.route */}
      <div className="flex items-center gap-1 flex-wrap text-xs">
        {route.map((s, i) => {
          const done = i < currentIdx
          const current = i === currentIdx
          return (
            <span key={s} className="flex items-center gap-1">
              <span
                className={[
                  'inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold',
                  done ? 'bg-accent text-on-accent' : current ? 'bg-accent text-on-accent ring-2 ring-offset-1 ring-offset-surface-2 ring-current' : 'bg-surface-dim text-text-muted border border-border',
                ].join(' ')}
                title={ORDER_STATUSES[s]?.label || s}
              >
                {i + 1}
              </span>
              {i < route.length - 1 && <span className="text-text-muted">·</span>}
            </span>
          )
        })}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {next ? (
          <button
            onClick={complete}
            disabled={saving}
            className="bg-accent hover:bg-accent-hover text-on-accent font-medium rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-50 min-h-[40px] flex-1 sm:flex-none"
          >
            {saving ? '…' : `Завершить «${ORDER_STATUSES[status]?.label || status}» → ${ORDER_STATUSES[next]?.label || next}`}
          </button>
        ) : (
          <span className="text-xs text-text-muted px-2 py-1">Вид завершён</span>
        )}

        {canJump && (
          <div className="flex items-center gap-1 ml-auto">
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="rounded-md border border-border px-2 py-1 text-xs bg-surface focus:outline-none focus:ring-2 focus:ring-accent/50"
              aria-label={`Перейти на другой статус вида ${item.idx}`}
            >
              <option value="">↺ откат / переход</option>
              {otherOptions.map((s) => (
                <option key={s} value={s}>{ORDER_STATUSES[s]?.label || s}</option>
              ))}
            </select>
            {target && (
              <button
                onClick={handleJump}
                disabled={saving}
                className="text-xs px-2.5 py-1 rounded-md bg-surface-dim border border-border font-medium disabled:opacity-50 hover:bg-surface-2 transition-colors"
              >
                {saving ? '…' : 'OK'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ExtraStickerBlock({ subtask, order, advanceById, onUpdated, logs }) {
  const [saving, setSaving] = useState(false)
  const status = subtask.status
  const route = getSubtaskRoute('extra_stickers', order)
  const next = getNextSubtaskStatus('extra_stickers', status, order)
  const accent = 'bg-warning'
  const tone = 'border-warning/30 bg-warning/5'

  const designsMap = subtask.extra_designs || {}
  const totalQty = Object.values(designsMap).reduce((s, v) => s + (Number(v) || 0), 0)
  const designsList = Object.entries(designsMap)
    .map(([idx, qty]) => `Вид ${idx}: ${qty}`)
    .join(' · ')

  // R14.5 (бриф 03.06): extra_stickers подзадача теперь проходит полный маршрут
  // с учётом работы. Без хотя бы одного лога с track='extra_stickers' на
  // соответствующем stage кнопка «Завершить» disabled.
  const canAdvance = hasSubtaskLog(logs || [], 'extra_stickers', status)

  async function complete() {
    if (!next) return
    if (!canAdvance) {
      toast.error(`Сначала внесите данные на этапе «${SUBTASK_STATUS_LABELS[status]}»`)
      return
    }
    setSaving(true)
    try {
      await advanceById(subtask.id, next)
      toast.success(`Доп. стикеры → ${SUBTASK_STATUS_LABELS[next]}`)
      onUpdated?.()
    } catch (err) {
      toast.error(translateError(err).message || err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded ${accent} text-white`}>
          Доп. стикеры #{subtask.item_idx}
        </span>
        <span className="text-sm font-medium text-text">{SUBTASK_STATUS_LABELS[status] || status}</span>
      </div>

      <p className="text-xs text-text-muted">{designsList || '—'} <span className="text-text">· итого {totalQty} шт</span></p>

      <MiniStepper route={route} status={status} accentClass={accent} />

      {status === 'drying' && (
        <DryingTimer startedAt={subtask?.drying_started_at} />
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {next ? (
          <button
            onClick={complete}
            disabled={saving || !canAdvance}
            title={!canAdvance ? `Сначала внесите данные на этапе «${SUBTASK_STATUS_LABELS[status]}»` : ''}
            className="bg-accent hover:bg-accent-hover text-on-accent font-medium rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-50 min-h-[40px] flex-1 sm:flex-none"
          >
            {saving ? '…' : `Завершить «${SUBTASK_STATUS_LABELS[status]}» → ${SUBTASK_STATUS_LABELS[next]}`}
          </button>
        ) : (
          <span className="text-xs text-text-muted px-2 py-1">Подзадача завершена</span>
        )}
      </div>
    </div>
  )
}

function SubtaskIndicator({ order, logs, onUpdated }) {
  const isPack3D = IS_3D_STICKERPACK(order.order_type)
  const { items } = useOrderItems(order.id)
  const isMultiVariant = items.length > 1
  const isMulti = isPack3D || isMultiVariant
  const { hasRole } = useAuth()
  // R11.3: грузим extras всегда (любой тип заказа может получить extra_stickers).
  const { subtasks, variants, extras, advance, advanceVariant, advanceById } = useOrderSubtasks(order.id, isMulti)
  const canJump = hasRole(['admin', 'manager'])

  // R14.3 (бриф 03.06): подзадачи появляются только начиная с препресса.
  // До prepress (new/design/sample_*/color_approval) — UI скрыт, чтобы не отвлекать
  // менеджера. Триггер k24_order_subtasks создаёт записи pending при INSERT
  // заказа — UI просто не рендерит их до prepress.
  const orderRoute = getOrderRoute(order)
  const orderIdx = orderRoute.indexOf(order.status)
  const prepressIdx = orderRoute.indexOf('prepress')
  if (orderIdx >= 0 && prepressIdx >= 0 && orderIdx < prepressIdx) return null

  // Блок «Доп. стикеры» отдельно от основных подзадач — показываем если есть extras.
  const extrasBlock = extras.length > 0 ? (
    <div className="bg-surface rounded-2xl border border-border shadow-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Доп. стикеры ({extras.length})</h3>
        <span className="text-xs text-text-muted">не блокируют основной маршрут</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {extras.map((s) => (
          <ExtraStickerBlock
            key={s.id}
            subtask={s}
            order={order}
            advanceById={advanceById}
            onUpdated={onUpdated}
            logs={logs}
          />
        ))}
      </div>
    </div>
  ) : null

  let mainBlock = null
  if (isMultiVariant && !isPack3D) {
    const route = getOrderRoute(order)
    mainBlock = (
      <div className="bg-surface rounded-2xl border border-border shadow-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Виды изделий ({items.length})</h3>
          <span className="text-xs text-text-muted">независимый таймлайн на каждый вид</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {items.map((it) => {
            const sub = variants.find((v) => v.item_idx === it.idx)
            if (!sub) return null
            return (
              <VariantSubtaskBlock
                key={it.idx}
                item={it}
                status={sub.status}
                route={route}
                onAdvance={advanceVariant}
                canJump={canJump}
              />
            )
          })}
        </div>
      </div>
    )
  } else if (isPack3D && subtasks.backgrounds && subtasks.stickers) {
    mainBlock = (
      <div className="bg-surface rounded-2xl border border-border shadow-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Подзадачи 3D-стикерпака</h3>
          <span className="text-xs text-text-muted">объединяются на «Сборка 3D»</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <SubtaskTrackBlock track="backgrounds" subtask={subtasks.backgrounds} advance={advance} onUpdated={onUpdated} canJump={canJump} logs={logs} order={order} />
          <SubtaskTrackBlock track="stickers" subtask={subtasks.stickers} advance={advance} onUpdated={onUpdated} canJump={canJump} logs={logs} order={order} />
        </div>
      </div>
    )
  }

  if (!mainBlock && !extrasBlock) return null
  return (
    <div className="space-y-4">
      {mainBlock}
      {extrasBlock}
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

      <SubtaskIndicator order={order} logs={logs} onUpdated={onUpdated} />

      <div className="flex justify-end">
        <CreateExtraStickersButton order={order} onCreated={onUpdated} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CurrentStageWidget order={order} logs={logs} refetch={refetch} onUpdated={onUpdated} />
        <ProgressLinesWidget order={order} logs={logs} />
      </div>

      <ActualCostSummary order={order} logs={logs} />

      <div className="flex justify-end">
        <ThreeDPouringExportButton order={order} logs={logs} />
      </div>

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
