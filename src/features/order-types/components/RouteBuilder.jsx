import { useMemo, useState } from 'react'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { getStatusMeta } from '@/shared/constants'
import {
  BUILTIN_PRODUCTION_STAGES, ROUTE_V2_HEAD_START, ROUTE_V2_TAIL_WITH_PACKAGING,
} from '@/shared/lib/route-registry'
import { stageDotClass } from '@/shared/lib/department-mapping'
import {
  toRouteUnits, fromRouteUnits, routeUnitLabel, validateTypeRoute, typeRouteWarnings,
} from '../lib/validate-type-route'

const label = (s) => getStatusMeta(s)?.label || s

function LockIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path strokeLinecap="round" d="M8 11V7a4 4 0 118 0v4" />
    </svg>
  )
}

function SortableUnit({ unit, onRemove, onMove, index, count, disabled }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: unit.id, disabled })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 bg-surface text-sm min-h-[44px]
        ${unit.locked ? 'border-warning/50 bg-warning/5' : 'border-border'}
        ${isDragging ? 'shadow-lg ring-2 ring-accent/40 z-10 relative' : ''}`}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-text-muted px-1 min-h-[36px] disabled:cursor-default"
        aria-label={`Перетащить: ${routeUnitLabel(unit)}`}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      <span className={`w-2 h-2 rounded-full shrink-0 ${stageDotClass(unit.stages[0])}`} aria-hidden="true" />
      <span className="flex-1 min-w-0 truncate">{routeUnitLabel(unit)}</span>
      {unit.locked && (
        <span className="inline-flex items-center gap-1 text-[11px] text-warning" title="Закреплённые этапы встроенного типа — нельзя убрать или разделить">
          <LockIcon /> закреплено
        </span>
      )}
      <button type="button" className="px-1.5 text-text-muted hover:text-text disabled:opacity-30 min-h-[36px]" aria-label="Выше" disabled={disabled || index === 0} onClick={() => onMove(index, index - 1)}>↑</button>
      <button type="button" className="px-1.5 text-text-muted hover:text-text disabled:opacity-30 min-h-[36px]" aria-label="Ниже" disabled={disabled || index === count - 1} onClick={() => onMove(index, index + 1)}>↓</button>
      {!unit.locked && (
        <button type="button" className="px-1.5 text-text-muted hover:text-danger min-h-[36px] disabled:opacity-30" aria-label={`Убрать «${routeUnitLabel(unit)}»`} disabled={disabled} onClick={() => onRemove(index)}>✕</button>
      )}
    </li>
  )
}

/**
 * R25.7C (ТЗ 7.2): конструктор маршрута типа.
 * Голова — две галочки («Образец», «Препресс»); производственная часть —
 * сортируемый список (закреплённые блоки встроенных типов — одним элементом
 * с замком); хвост (упаковка → ТК → выдача → доставка → готово) — только
 * для чтения. Изменения — через onChange({ head, production }).
 *
 * @param {object} props
 * @param {{ sample: boolean, prepress: boolean }} props.head
 * @param {string[]} props.production
 * @param {string[][]} [props.lockedBlocks]
 * @param {boolean} [props.isBuiltin]
 * @param {object[]} props.stageDefs — свои этапы каталога (неархивные)
 * @param {(next: { head, production }) => void} props.onChange
 * @param {boolean} [props.disabled]
 */
export function RouteBuilder({ head, production, lockedBlocks = [], isBuiltin = false, stageDefs = [], onChange, disabled = false }) {
  const [adding, setAdding] = useState('')
  const units = useMemo(() => toRouteUnits(production, lockedBlocks), [production, lockedBlocks])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const error = validateTypeRoute({
    production, lockedBlocks, isBuiltin,
    stageExists: (k) => stageDefs.some((d) => d.key === k),
  })
  const warnings = typeRouteWarnings(production)

  const catalog = [
    ...BUILTIN_PRODUCTION_STAGES.map((s) => ({ key: s, name: label(s) })),
    ...stageDefs.map((d) => ({ key: d.key, name: d.name })),
  ].filter((c) => !production.includes(c.key))

  function setUnits(next) {
    onChange({ head, production: fromRouteUnits(next) })
  }
  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    const from = units.findIndex((u) => u.id === active.id)
    const to = units.findIndex((u) => u.id === over.id)
    if (from < 0 || to < 0) return
    setUnits(arrayMove(units, from, to))
  }
  function move(from, to) {
    if (to < 0 || to >= units.length) return
    setUnits(arrayMove(units, from, to))
  }
  function remove(index) {
    if (units[index]?.locked) return
    setUnits(units.filter((_, i) => i !== index))
  }
  function add() {
    if (!adding) return
    onChange({ head, production: [...production, adding] })
    setAdding('')
  }

  const chip = (s) => (
    <span key={s} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-text-muted">
      <span className={`w-1.5 h-1.5 rounded-full ${stageDotClass(s)}`} aria-hidden="true" />{label(s)}
    </span>
  )

  return (
    <div className="space-y-4">
      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">Голова</h4>
        <div className="flex flex-wrap gap-1 mb-2">{ROUTE_V2_HEAD_START.map(chip)}</div>
        <div className="flex flex-wrap gap-4">
          <label className="inline-flex items-center gap-2 text-sm min-h-[44px]">
            <input type="checkbox" checked={head.sample !== false} disabled={disabled}
              onChange={(e) => onChange({ head: { ...head, sample: e.target.checked }, production })} />
            Образец <span className="text-xs text-text-muted">(вёрстка, печать, утверждение цвета)</span>
          </label>
          <label className="inline-flex items-center gap-2 text-sm min-h-[44px]">
            <input type="checkbox" checked={head.prepress !== false} disabled={disabled}
              onChange={(e) => onChange({ head: { ...head, prepress: e.target.checked }, production })} />
            Препресс
          </label>
        </div>
      </section>

      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">Производство</h4>
        {units.length === 0 ? (
          <p className="text-sm text-text-muted border border-dashed border-border rounded-lg px-3 py-3">Этапов цеха нет</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={units.map((u) => u.id)} strategy={verticalListSortingStrategy}>
              <ol className="space-y-1.5">
                {units.map((u, i) => (
                  <SortableUnit key={u.id} unit={u} index={i} count={units.length} onMove={move} onRemove={remove} disabled={disabled} />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}
        {!disabled && (
          <div className="flex gap-2 mt-2">
            <select
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              aria-label="Этап из каталога"
              className="flex-1 rounded-lg border border-border px-3 py-2 text-sm bg-surface min-h-[44px]"
            >
              <option value="">— этап из каталога —</option>
              {catalog.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
            </select>
            <button type="button" onClick={add} disabled={!adding}
              className="px-3 rounded-lg border border-border text-sm min-h-[44px] hover:bg-surface-2 disabled:opacity-40">
              Добавить этап
            </button>
          </div>
        )}
      </section>

      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">Хвост (не настраивается)</h4>
        <div className="flex flex-wrap gap-1">{ROUTE_V2_TAIL_WITH_PACKAGING.map(chip)}</div>
      </section>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {!error && warnings.map((w) => <p key={w} className="text-sm text-warning">{w}</p>)}
    </div>
  )
}
