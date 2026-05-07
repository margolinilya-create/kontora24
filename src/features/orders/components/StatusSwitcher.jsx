import { useState } from 'react'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { updateOrderStatus } from '../hooks/useOrders'
import { ORDER_STATUSES, getNextStatus } from '@/shared/constants'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'

// "Отменить" удалили по ТЗ 2026-05. Откат на пройденные этапы будет в R3.
export function StatusSwitcher({ order, onUpdated }) {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(false)

  if (!profile || !order) return null

  const role = profile.role
  const currentStatus = order.status
  const nextStatus = getNextStatus(role, currentStatus, order)

  if (!nextStatus) return null

  async function handleTransition(toStatus) {
    setLoading(true)
    try {
      await updateOrderStatus(order.id, currentStatus, toStatus)
      onUpdated?.()
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={() => handleTransition(nextStatus)}
      disabled={loading}
      className="bg-accent hover:bg-accent-hover text-on-accent font-medium rounded-lg px-4 py-2.5 text-sm transition-colors disabled:opacity-50 min-h-[44px]"
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <span className="animate-spin rounded-full border-2 border-white border-t-transparent h-3.5 w-3.5" aria-hidden="true" />
        </span>
      ) : `→ ${ORDER_STATUSES[nextStatus]?.label || nextStatus}`}
    </button>
  )
}
