import { useState, useEffect } from 'react'
import { ORDER_TYPES } from '@/shared/constants'
import { formatPrice } from '@/shared/lib/utils'
import { loadCalcHistory, clearCalcHistory } from '../lib/calc-history'

export function CalcHistory({ onRestore }) {
  const [history, setHistory] = useState([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setHistory(loadCalcHistory())
  }, [open])

  if (history.length === 0) return null

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full text-sm font-semibold"
      >
        <span>История расчётов ({history.length})</span>
        <span className="text-text-muted">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {history.map((h) => (
            <button
              key={h.id}
              onClick={() => onRestore({
                orderType: h.orderType, width: h.width, height: h.height,
                qty: h.qty, needLam: h.needLam, designVariants: h.designVariants,
              })}
              className="flex items-center justify-between w-full text-sm py-2 px-2 -mx-2 rounded hover:bg-surface-dim transition-colors text-left"
            >
              <div>
                <span className="font-medium">{ORDER_TYPES[h.orderType]?.label}</span>
                <span className="text-text-muted ml-2">{h.width}×{h.height} · {h.qty} шт</span>
              </div>
              <span className="font-semibold text-accent">{formatPrice(h.priceFinal)}</span>
            </button>
          ))}
          <button
            onClick={() => { clearCalcHistory(); setHistory([]) }}
            className="text-xs text-text-muted hover:text-danger py-2 px-2"
          >
            Очистить историю
          </button>
        </div>
      )}
    </div>
  )
}
