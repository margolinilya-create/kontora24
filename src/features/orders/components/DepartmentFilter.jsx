import { useState } from 'react'
import { DEPARTMENTS } from '@/shared/lib/department-mapping'

export function DepartmentFilter({ selectedStatuses, onChange }) {
  const [open, setOpen] = useState(false)

  function toggleStatus(status) {
    const next = new Set(selectedStatuses)
    if (next.has(status)) {
      next.delete(status)
    } else {
      next.add(status)
    }
    onChange([...next])
  }

  function toggleDepartment(dept) {
    const deptStatuses = [...new Set(dept.stages.map(s => s.status))]
    const allSelected = deptStatuses.every(s => selectedStatuses.includes(s))
    const next = new Set(selectedStatuses)
    if (allSelected) {
      deptStatuses.forEach(s => next.delete(s))
    } else {
      deptStatuses.forEach(s => next.add(s))
    }
    onChange([...next])
  }

  function clearAll() {
    onChange([])
  }

  const activeCount = selectedStatuses.length

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`px-4 py-2.5 min-h-[44px] rounded-lg text-sm border transition-colors ${
          activeCount > 0
            ? 'border-accent bg-accent/10 text-accent font-medium'
            : 'border-border text-text-muted hover:bg-surface-dim'
        }`}
      >
        Фильтр{activeCount > 0 ? ` (${activeCount})` : ''}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-2 z-50 bg-surface border border-border rounded-xl shadow-lg p-4 w-[320px] max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Фильтр по отделам</h3>
              {activeCount > 0 && (
                <button onClick={clearAll} className="text-xs text-accent hover:underline">
                  Сбросить
                </button>
              )}
            </div>

            <div className="space-y-4">
              {DEPARTMENTS.map((dept) => {
                const deptStatuses = [...new Set(dept.stages.map(s => s.status))]
                const allSelected = deptStatuses.every(s => selectedStatuses.includes(s))
                const someSelected = deptStatuses.some(s => selectedStatuses.includes(s))

                return (
                  <div key={dept.id}>
                    <label className="flex items-center gap-2 cursor-pointer mb-1.5">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected }}
                        onChange={() => toggleDepartment(dept)}
                        className="w-4 h-4 rounded border-border"
                      />
                      <span className="text-sm font-medium">{dept.label}</span>
                    </label>
                    <div className="ml-6 space-y-1">
                      {dept.stages.map((stage, i) => (
                        <label key={`${dept.id}-${i}`} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedStatuses.includes(stage.status)}
                            onChange={() => toggleStatus(stage.status)}
                            className="w-3.5 h-3.5 rounded border-border"
                          />
                          <span className="text-sm text-text-muted">{stage.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
