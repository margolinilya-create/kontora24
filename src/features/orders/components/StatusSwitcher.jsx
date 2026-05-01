import { useState } from 'react'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { updateOrderStatus } from '../hooks/useOrders'
import { STATUS_TRANSITIONS, CAN_CANCEL_ROLES, ORDER_STATUSES, getNextStatus } from '@/shared/constants'
import { toast } from '@/shared/stores/toast-store'

export function StatusSwitcher({ order, onUpdated }) {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(false)

  if (!profile || !order) return null

  const role = profile.role
  const currentStatus = order.status

  // What's the next status this role can set?
  const nextStatus = getNextStatus(role, currentStatus, order)
  const canCancel = CAN_CANCEL_ROLES.includes(role) && currentStatus !== 'done' && currentStatus !== 'cancelled'

  if (!nextStatus && !canCancel) return null

  async function handleTransition(toStatus) {
    setLoading(true)
    try {
      await updateOrderStatus(order.id, currentStatus, toStatus)
      onUpdated?.()
    } catch (err) {
      toast.error('Ошибка: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {nextStatus && (
        <button
          onClick={() => handleTransition(nextStatus)}
          disabled={loading}
          className="bg-accent hover:bg-accent-hover text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50"
        >
          {loading ? '...' : `→ ${ORDER_STATUSES[nextStatus]?.label || nextStatus}`}
        </button>
      )}
      {canCancel && (
        <button
          onClick={() => {
            if (confirm('Отменить заказ?')) handleTransition('cancelled')
          }}
          disabled={loading}
          className="border border-danger text-danger hover:bg-danger hover:text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50"
        >
          Отменить
        </button>
      )}
    </div>
  )
}
