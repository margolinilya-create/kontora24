import { useState, useEffect, useRef } from 'react'
import { ORDER_STATUSES, getOrderRoute } from '@/shared/constants'
import { updateOrderStatus } from '../hooks/useOrders'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'

/**
 * Dropdown с пройденными этапами для отката статуса заказа.
 * По ТЗ: откат разрешён всем (логи не удаляются — только меняется status).
 */
export function StatusOverride({ order, onUpdated }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  if (!order || order.status === 'cancelled') return null

  const route = getOrderRoute(order)
  const currentIdx = route.indexOf(order.status)
  // Все пройденные этапы (без текущего)
  const pastStages = currentIdx > 0 ? route.slice(0, currentIdx) : []

  if (pastStages.length === 0) return null

  async function handleRollback(toStatus) {
    setBusy(true)
    setOpen(false)
    try {
      await updateOrderStatus(order.id, order.status, toStatus, { isRollback: true })
      toast.success(`Заказ возвращён на «${ORDER_STATUSES[toStatus]?.label}»`)
      onUpdated?.()
    } catch (err) {
      toast.error(translateError(err).message || err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="text-sm border border-border text-text-muted hover:text-text hover:bg-surface-2 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
        title="Откатить статус назад"
      >
        ← Откат
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-20 w-56 bg-surface border border-border rounded-xl shadow-modal py-1 max-h-72 overflow-y-auto">
          <p className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-text-muted">Вернуть на этап</p>
          {pastStages.map((s) => (
            <button
              key={s}
              onClick={() => handleRollback(s)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 transition-colors"
            >
              {ORDER_STATUSES[s]?.label || s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
