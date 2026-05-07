import { memo } from 'react'
import { ORDER_STATUSES } from '@/shared/constants'
import { stageDotClass } from '@/shared/lib/department-mapping'

const COLS = ['new', 'design', 'prepress', 'print', 'lamination', 'cutting', 'selection_pouring', 'pouring', 'assembly_3d', 'packaging', 'otk']

/**
 * Pipeline summary strip — shows all production stages with counts.
 * @param {Object} columns - { status: orders[] } map
 * @param {string} [activeStatus] - highlight current stage (for queue pages)
 * @param {React.RefObject} [scrollRef] - scroll container ref (for board page click-to-scroll)
 */
export const PipelineSummary = memo(function PipelineSummary({ columns, activeStatus, scrollRef }) {
  function handleClick(status) {
    if (scrollRef) {
      const el = scrollRef.current?.querySelector(`[data-col="${status}"]`)
      el?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
    }
  }

  const total = COLS.reduce((sum, s) => sum + (columns[s]?.length || 0), 0)

  return (
    <div className="flex items-center gap-1 flex-wrap bg-surface rounded-2xl border border-border shadow-card px-4 py-2.5">
      {COLS.map((status) => {
        const count = columns[status]?.length || 0
        const isActive = activeStatus === status

        return (
          <button
            key={status}
            onClick={() => handleClick(status)}
            aria-label={`${ORDER_STATUSES[status]?.label}: ${count}`}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs transition-colors shrink-0 min-h-[44px]
              ${isActive
                ? 'bg-accent/15 ring-1 ring-accent/40'
                : 'hover:bg-surface-2'
              }`}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${stageDotClass(status)}`} aria-hidden="true" />
            <span className={`hidden sm:inline ${isActive ? 'text-text font-medium' : 'text-text-muted'}`}>
              {ORDER_STATUSES[status]?.label}
            </span>
            <span className="sr-only sm:hidden">{ORDER_STATUSES[status]?.label}</span>
            <span className={`font-semibold ${count > 0 ? 'text-text' : 'text-text-muted/40'}`}>{count}</span>
          </button>
        )
      })}
      <span className="ml-auto text-xs text-text-muted shrink-0 pl-2 border-l border-border">
        {total}
      </span>
    </div>
  )
})

export { COLS }
