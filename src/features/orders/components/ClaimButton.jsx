import { useState } from 'react'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { updateOrder } from '../hooks/useOrders'
import { toast } from '@/shared/stores/toast-store'

export function ClaimButton({ order, onClaimed }) {
  const { profile } = useAuth()
  const [claiming, setClaiming] = useState(false)

  if (!profile) return null

  const isMine = order.assigned_to === profile.id
  const isAssigned = !!order.assigned_to

  if (isMine) {
    return <span className="text-xs text-success font-medium px-2 py-1 bg-success/10 rounded-full">Мой заказ</span>
  }

  async function handleClaim() {
    setClaiming(true)
    try {
      await updateOrder(order.id, { assigned_to: profile.id })
      toast.success(`Заказ #${order.number} взят в работу`)
      onClaimed?.()
    } catch (err) {
      toast.error('Ошибка: ' + err.message)
    } finally {
      setClaiming(false)
    }
  }

  return (
    <button
      onClick={handleClaim}
      disabled={claiming}
      className="text-xs bg-accent/10 text-accent hover:bg-accent/20 font-medium rounded-full px-3 py-1 transition-colors disabled:opacity-50"
    >
      {claiming ? '...' : isAssigned ? 'Перенять' : 'Взять'}
    </button>
  )
}
