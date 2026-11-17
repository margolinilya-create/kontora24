import { useState } from 'react'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useRolePermissionsStore } from '@/features/auth/role-permissions-store'
import { updateOrderStatus, PAYMENT_CONFIRM_REQUIRED } from '../hooks/useOrders'
import { ORDER_STATUSES, getNextStatus, needsNoPaymentConfirm, NO_PAYMENT_CONFIRM_MESSAGE } from '@/shared/constants'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import ConfirmDialog from '@/shared/components/ConfirmDialog'

// "Отменить" удалили по ТЗ 2026-05. Откат на пройденные этапы будет в R3.
// R25.1 (ТЗ 1.3): выход из «Ждёт оплаты» без оплаты — через подтверждение.
export function StatusSwitcher({ order, onUpdated }) {
  const { profile } = useAuth()
  const dynamicPerms = useRolePermissionsStore((s) => s.permissions)
  const dynamicLoaded = useRolePermissionsStore((s) => s.loaded)
  const [loading, setLoading] = useState(false)
  const [confirmTo, setConfirmTo] = useState(null)

  if (!profile || !order) return null

  const role = profile.role
  const currentStatus = order.status
  const nextStatus = getNextStatus(role, currentStatus, order, dynamicLoaded ? dynamicPerms : null)

  if (!nextStatus) return null

  async function handleTransition(toStatus, opts = {}) {
    setLoading(true)
    try {
      await updateOrderStatus(order.id, currentStatus, toStatus, opts)
      onUpdated?.()
    } catch (err) {
      // Данные списка могли устареть (оплату сняли) — сервер просит подтверждение.
      if (err?.code === PAYMENT_CONFIRM_REQUIRED) setConfirmTo(toStatus)
      else toast.error(translateError(err).message)
    } finally {
      setLoading(false)
    }
  }

  function handleClick() {
    if (needsNoPaymentConfirm(order, currentStatus, nextStatus)) {
      setConfirmTo(nextStatus)
      return
    }
    handleTransition(nextStatus)
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        className="bg-accent hover:bg-accent-hover text-on-accent font-medium rounded-lg px-4 py-2.5 text-sm transition-colors disabled:opacity-50 min-h-[44px]"
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="animate-spin rounded-full border-2 border-white border-t-transparent h-3.5 w-3.5" aria-hidden="true" />
          </span>
        ) : `→ ${ORDER_STATUSES[nextStatus]?.label || nextStatus}`}
      </button>
      <ConfirmDialog
        isOpen={!!confirmTo}
        onClose={() => setConfirmTo(null)}
        onConfirm={() => {
          const to = confirmTo
          setConfirmTo(null)
          handleTransition(to, { confirmNoPayment: true })
        }}
        title="Запуск без оплаты"
        message={NO_PAYMENT_CONFIRM_MESSAGE}
        confirmText="Запустить"
        variant="primary"
      />
    </>
  )
}
