import { useState } from 'react'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { updateOrderStatus } from '../hooks/useOrders'
import { CAN_CANCEL_ROLES, ORDER_STATUSES, getNextStatus } from '@/shared/constants'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import ConfirmDialog from '@/shared/components/ConfirmDialog'

export function StatusSwitcher({ order, onUpdated }) {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  if (!profile || !order) return null

  const role = profile.role
  const currentStatus = order.status

  const nextStatus = getNextStatus(role, currentStatus, order)
  const canCancel = CAN_CANCEL_ROLES.includes(role) && currentStatus !== 'done' && currentStatus !== 'cancelled'

  if (!nextStatus && !canCancel) return null

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
    <div className="flex items-center gap-2">
      {nextStatus && (
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
      )}
      {canCancel && (
        <>
          <button
            onClick={() => setConfirmCancel(true)}
            disabled={loading}
            className="border border-danger text-danger hover:bg-danger hover:text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors disabled:opacity-50 min-h-[44px]"
          >
            Отменить
          </button>
          <ConfirmDialog
            isOpen={confirmCancel}
            onClose={() => setConfirmCancel(false)}
            onConfirm={() => { setConfirmCancel(false); handleTransition('cancelled') }}
            title="Отменить заказ?"
            message={`Вы уверены, что хотите отменить заказ #${order.number}? Это действие нельзя отменить.`}
            confirmText="Отменить заказ"
            variant="danger"
          />
        </>
      )}
    </div>
  )
}
