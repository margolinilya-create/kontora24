import { useState } from 'react'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { isRouteV2 } from '@/shared/constants'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { captureError } from '@/shared/lib/sentry'
import ConfirmDialog from '@/shared/components/ConfirmDialog'
import { applyTypeRouteToOrder } from '../lib/order-types-api'

/**
 * R25.7C (ТЗ 7.2): «Применить текущий маршрут типа» — переводит один
 * активный заказ v2 на текущий маршрут и ставки его типа (RPC
 * apply_type_route_to_order: только admin/manager, текущий этап должен быть
 * в новом маршруте, запись в аудит). Остальные заказы не меняются.
 */
export function ApplyTypeRouteButton({ order, onApplied }) {
  const { hasRole } = useAuth()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!order || !hasRole(['admin', 'manager'])) return null
  if (!isRouteV2(order) || order.is_subcontract || ['done', 'cancelled'].includes(order.status)) return null

  async function apply() {
    setConfirm(false)
    setBusy(true)
    try {
      const snap = await applyTypeRouteToOrder(order.id)
      toast.success('Маршрут типа применён к заказу')
      onApplied?.({ route_snapshot: snap })
    } catch (err) {
      captureError(err, { tags: { source: 'ApplyTypeRouteButton.apply' }, extra: { orderId: order.id } })
      toast.error(translateError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirm(true)}
        disabled={busy}
        className="text-xs text-accent hover:underline min-h-[36px] disabled:opacity-50"
      >
        {busy ? 'Применяем…' : 'Применить текущий маршрут типа'}
      </button>
      <ConfirmDialog
        isOpen={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={apply}
        title="Применить текущий маршрут типа?"
        message="Заказ получит маршрут и сдельные ставки типа в их текущем виде (из настроек). Другие заказы не изменятся. Действие пишется в аудит."
        confirmText="Применить"
        variant="primary"
      />
    </>
  )
}
