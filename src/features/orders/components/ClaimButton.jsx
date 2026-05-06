import { useState } from 'react'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { claimOrder } from '../hooks/useOrders'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import ConfirmDialog from '@/shared/components/ConfirmDialog'

export function ClaimButton({ order, onClaimed }) {
  const { profile } = useAuth()
  const [claiming, setClaiming] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  if (!profile) return null

  const isMine = order.assigned_to === profile.id
  const isAssigned = !!order.assigned_to

  if (isMine) {
    return <span className="text-xs text-success font-medium px-2 py-1 bg-success/10 rounded-full">Мой заказ</span>
  }

  async function handleClaim() {
    if (isAssigned) {
      setShowConfirm(true)
      return
    }
    await doClaim()
  }

  async function doClaim() {
    setShowConfirm(false)
    setClaiming(true)
    try {
      await claimOrder(order.id, profile.id, isAssigned ? order.assigned_to : null)
      toast.success(`Заказ #${order.number} взят в работу`)
      onClaimed?.()
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setClaiming(false)
    }
  }

  return (
    <>
    <button
      onClick={handleClaim}
      disabled={claiming}
      className="text-xs bg-accent/10 text-accent hover:bg-accent/20 font-medium rounded-full px-3 py-2.5 min-h-[44px] transition-colors disabled:opacity-50"
    >
      {claiming ? '...' : isAssigned ? 'Перенять' : 'Взять'}
    </button>
    {showConfirm && (
      <ConfirmDialog
        isOpen
        onClose={() => setShowConfirm(false)}
        onConfirm={doClaim}
        title="Перенять заказ?"
        message={`Перенять заказ #${order.number}?`}
        confirmText="Перенять"
        variant="primary"
      />
    )}
    </>
  )
}
