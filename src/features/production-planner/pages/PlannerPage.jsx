// R12.3 → R12.5 — полная страница планировщика с DnD-корректировкой.
// DnD-валидация: перетащить чип можно только в ячейку того же бакета
// (нельзя двинуть `print` в `oprl_cut` — это была бы смена отдела).
// Два режима DnD из §9 ТЗ: «Каскад» (default) — всё после сдвинутого
// этапа автопересчитается; «Только этап» — фиксируем хвост на текущих
// днях, чтобы двинутый этап точечно встал в новый день.

import { useEffect, useState } from 'react'
import {
  DndContext, DragOverlay, closestCorners,
  PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import { ORDER_TYPES } from '@/shared/constants'
import Spinner from '@/shared/components/Spinner'
import ConfirmDialog from '@/shared/components/ConfirmDialog'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { toast } from '@/shared/stores/toast-store'
import { usePlannerData } from '../hooks/usePlannerData'
import { useScheduleResult } from '../hooks/useScheduleResult'
import { usePlanStore } from '../store/plan-store'
import { OrderList } from '../components/OrderList'
import { OrderDetailsPanel } from '../components/OrderDetailsPanel'
import { PlannerCalendar, DragOverlayChip } from '../components/PlannerCalendar'
import { parseDragId, parseDropId } from '../lib/dnd-ids'
import { STAGE_TO_BUCKET } from '../lib/buckets'
import { pinStage, pinStageWithFreeze, unpinAll } from '../lib/plan-overrides'

export default function PlannerPage() {
  usePlannerData()
  const { profile } = useAuth()
  const loading = usePlanStore((s) => s.loading)
  const error = usePlanStore((s) => s.error)
  const filterType = usePlanStore((s) => s.filterType)
  const setFilterType = usePlanStore((s) => s.setFilterType)
  const dragMode = usePlanStore((s) => s.dragMode)
  const setDragMode = usePlanStore((s) => s.setDragMode)
  const overrides = usePlanStore((s) => s.overrides)
  const result = useScheduleResult()

  const [dragging, setDragging] = useState(null) // { orderId, stage, hours }
  const [autoplanConfirm, setAutoplanConfirm] = useState(false)

  useEffect(() => {
    usePlanStore.getState().setSelectedOrderId(null)
    return () => { usePlanStore.getState().setSelectedOrderId(null) }
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  )

  function handleDragStart(evt) {
    const parsed = parseDragId(evt.active.id)
    if (!parsed) return
    const r = result.byOrder[parsed.orderId]
    const stage = r?.plannedStages?.find((s) => s.stage === parsed.stage)
    setDragging({ orderId: parsed.orderId, stage: parsed.stage, hours: stage?.hours || 0 })
  }

  async function handleDragEnd(evt) {
    setDragging(null)
    const dropped = parseDragId(evt.active?.id)
    const cell = parseDropId(evt.over?.id)
    if (!dropped || !cell) return
    const expectedBucket = STAGE_TO_BUCKET[dropped.stage]
    if (expectedBucket !== cell.bucket) {
      toast.info('Этап нельзя перенести в другой отдел. Можно двигать только по своему бакету.')
      return
    }
    const r = result.byOrder[dropped.orderId]
    if (dragMode === 'cascade') {
      await pinStage({
        orderId: dropped.orderId,
        stage: dropped.stage,
        pinnedDate: cell.date,
        userId: profile?.id,
      })
    } else {
      // 'this_only': фиксируем все остальные этапы на их первых днях
      const others = {}
      for (const ps of r?.plannedStages || []) {
        if (ps.stage === dropped.stage) continue
        if (!ps.days || ps.days.length === 0) continue
        if (ps.pinned) continue // уже закреплён, не трогаем
        others[ps.stage] = ps.days[0]
      }
      await pinStageWithFreeze({
        orderId: dropped.orderId,
        droppedStage: dropped.stage,
        droppedDate: cell.date,
        otherStages: others,
        userId: profile?.id,
      })
    }
  }

  async function confirmAutoplan() {
    setAutoplanConfirm(false)
    const res = await unpinAll()
    if (res.ok) toast.success(`План сброшен (снято ${res.removed || 0} закреплений)`)
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem)]">
      {/* Шапка */}
      <div className="flex items-center gap-3 px-4 md:px-6 py-3 border-b border-border bg-surface">
        <h1 className="text-lg md:text-xl font-bold uppercase tracking-tight">
          Планирование производства
        </h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide bg-warning/15 text-warning border border-warning/40">
          бета
        </span>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-text-muted">
          <Legend />
        </div>
      </div>

      {/* Тулбар */}
      <div className="flex items-center flex-wrap gap-3 px-4 md:px-6 py-2 border-b border-border bg-surface-dim">
        <label className="text-[11px] uppercase text-text-muted font-semibold">Тип:</label>
        <select
          value={filterType || ''}
          onChange={(e) => setFilterType(e.target.value || null)}
          className="text-sm px-2 py-1 rounded border border-border bg-surface"
        >
          <option value="">все типы</option>
          {Object.entries(ORDER_TYPES).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        <div className="flex items-center gap-1 ml-2 border border-border rounded p-0.5 bg-surface">
          <button
            type="button"
            onClick={() => setDragMode('cascade')}
            className={`px-2 py-1 text-[11px] font-semibold rounded transition
              ${dragMode === 'cascade' ? 'bg-accent text-text' : 'text-text-muted hover:text-text'}`}
            title="Сдвинутый этап тянет за собой все последующие этапы"
          >
            Каскад
          </button>
          <button
            type="button"
            onClick={() => setDragMode('this_only')}
            className={`px-2 py-1 text-[11px] font-semibold rounded transition
              ${dragMode === 'this_only' ? 'bg-accent text-text' : 'text-text-muted hover:text-text'}`}
            title="Двигается только этот этап, остальные фиксируются на местах"
          >
            Только этап
          </button>
        </div>

        <button
          type="button"
          onClick={() => setAutoplanConfirm(true)}
          disabled={overrides.length === 0}
          className="ml-auto px-3 py-1 text-[11px] font-semibold rounded border border-border bg-surface text-text hover:bg-surface-dim disabled:opacity-40 disabled:cursor-not-allowed"
          title="Снять все ручные закрепления и перейти к автоматическому плану"
        >
          ↺ Автоплан ({overrides.length})
        </button>
      </div>

      {/* Тело */}
      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <Spinner />
        </div>
      ) : error ? (
        <div className="flex items-center justify-center flex-1 p-6">
          <div className="text-sm text-danger">
            Ошибка загрузки: {error.message || String(error)}
          </div>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDragging(null)}
        >
          <div className="grid flex-1 overflow-hidden md:grid-cols-[340px_1fr] grid-rows-[40vh_1fr] md:grid-rows-1">
            <div className="overflow-auto border-b md:border-b-0 md:border-r border-border">
              <OrderList />
            </div>
            <div className="overflow-auto">
              <PlannerCalendar />
            </div>
          </div>
          <DragOverlay dropAnimation={null}>
            {dragging ? (
              <DragOverlayChip
                orderId={dragging.orderId}
                stage={dragging.stage}
                hours={dragging.hours}
                ordersById={Object.fromEntries(
                  usePlanStore.getState().orders.map((o) => [o.id, o])
                )}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <ConfirmDialog
        isOpen={autoplanConfirm}
        title="Сбросить ручной план?"
        message={`Будет снято ${overrides.length} закреплений. Расписание пересчитается с нуля.`}
        confirmText="Сбросить"
        onConfirm={confirmAutoplan}
        onClose={() => setAutoplanConfirm(false)}
      />

      <OrderDetailsPanel />
    </div>
  )
}

function Legend() {
  return (
    <div className="flex items-center gap-2">
      <LegendItem className="bg-success/15 border border-success/40 text-success">≤85%</LegendItem>
      <LegendItem className="bg-warning/15 border border-warning/40 text-warning">≤100%</LegendItem>
      <LegendItem className="bg-danger/15 border border-danger/40 text-danger">&gt;100%</LegendItem>
      <span className="opacity-50">·</span>
      <span>🚩 срок</span>
      <span>📌 закреплено</span>
    </div>
  )
}

function LegendItem({ children, className }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${className}`}>{children}</span>
  )
}
