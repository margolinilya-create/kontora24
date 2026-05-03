import { useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { OPERATION_CHECKLISTS } from '@/shared/constants'

export function OperationChecklist({ order, compact = false }) {
  const operations = OPERATION_CHECKLISTS[order.order_type] || []
  const [checklist, setChecklist] = useState(order.checklist || {})

  if (operations.length === 0) return null

  const completedCount = operations.filter(op => checklist[op]).length

  async function toggle(operation) {
    const updated = { ...checklist, [operation]: !checklist[operation] }
    setChecklist(updated)
    await supabase.from('k24_orders').update({ checklist: updated }).eq('id', order.id)
  }

  if (compact) {
    return (
      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
        completedCount === operations.length
          ? 'bg-green-500/15 text-green-500'
          : 'bg-surface-dim text-text-muted'
      }`}>
        {completedCount}/{operations.length}
      </span>
    )
  }

  return (
    <div className="space-y-1.5">
      {operations.map(op => (
        <label key={op} className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={!!checklist[op]}
            onChange={() => toggle(op)}
            className="rounded border-border"
          />
          <span className={checklist[op] ? 'line-through text-text-muted' : ''}>{op}</span>
        </label>
      ))}
    </div>
  )
}
