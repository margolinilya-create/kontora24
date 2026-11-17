import { useState } from 'react'
import { DEPARTMENTS } from '@/shared/lib/department-mapping'
import { ORDER_STATUSES, getOrderRoute } from '@/shared/constants'

export function DepartmentTimeline({ order }) {
  const [hoveredDept, setHoveredDept] = useState(null)
  const orderRoute = getOrderRoute(order)
  const routeSet = new Set(orderRoute)

  // Filter departments to only show those with stages on this order's route
  const departments = DEPARTMENTS.filter(d => {
    return d.stages.some(s => routeSet.has(s.status))
  })

  // Determine each department's state.
  // R25.1: по позиции в маршруте заказа, а не по ORDER_STATUSES.order — в v2
  // отдел продаж стоит и в голове, и в хвосте маршрута (диапазон по .order
  // накрывал бы весь маршрут).
  const currentIdx = orderRoute.indexOf(order.status)

  function getDeptState(dept) {
    const idxs = dept.stages.map(s => orderRoute.indexOf(s.status)).filter(i => i >= 0)
    if (idxs.length === 0 || currentIdx < 0) return 'pending'
    if (dept.stages.some(s => s.status === order.status)) return 'active'
    if (Math.max(...idxs) < currentIdx) return 'completed'
    return 'pending'
  }

  // Get the current stage label within the active department
  function getCurrentStageLabel(dept) {
    const stage = dept.stages.find(s => s.status === order.status)
    return stage?.label || ORDER_STATUSES[order.status]?.label || order.status
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-4">
      {/* Desktop: horizontal */}
      <div className="hidden sm:flex items-center gap-1">
        {departments.map((dept, i) => {
          const state = getDeptState(dept)
          return (
            <div key={dept.id} className="flex items-center flex-1 min-w-0">
              <div
                className="relative flex-1"
                onMouseEnter={() => setHoveredDept(dept.id)}
                onMouseLeave={() => setHoveredDept(null)}
              >
                <div className={`rounded-lg px-3 py-2.5 text-center text-xs font-medium transition-colors cursor-default ${
                  state === 'completed' ? 'bg-green-500/15 text-green-500' :
                  state === 'active' ? `${dept.color} ring-2 ring-current/20` :
                  'bg-surface-dim text-text-muted'
                }`}>
                  {dept.label}
                </div>
                {/* Tooltip */}
                {hoveredDept === dept.id && state === 'active' && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-primary text-white text-xs rounded-lg whitespace-nowrap z-10 shadow-lg">
                    {getCurrentStageLabel(dept)}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-primary rotate-45" />
                  </div>
                )}
              </div>
              {i < departments.length - 1 && (
                <div className={`w-4 h-0.5 flex-shrink-0 ${state === 'completed' ? 'bg-green-500' : 'bg-border'}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Mobile: vertical */}
      <div className="sm:hidden space-y-2">
        {departments.map((dept) => {
          const state = getDeptState(dept)
          return (
            <div key={dept.id} className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                state === 'completed' ? 'bg-green-500' :
                state === 'active' ? 'bg-accent ring-2 ring-accent/30' :
                'bg-border'
              }`} />
              <div className="flex-1 min-w-0">
                <span className={`text-sm ${state === 'active' ? 'font-semibold' : state === 'completed' ? 'text-green-500' : 'text-text-muted'}`}>
                  {dept.label}
                </span>
                {state === 'active' && (
                  <span className="text-xs text-text-muted ml-2">{getCurrentStageLabel(dept)}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
