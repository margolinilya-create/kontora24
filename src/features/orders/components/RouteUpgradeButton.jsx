import { useState } from 'react'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { updateOrder } from '../hooks/useOrders'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { ORDER_STATUSES, getOrderRoute, isRouteV2 } from '@/shared/constants'
import Button from '@/shared/components/Button'
import ConfirmDialog from '@/shared/components/ConfirmDialog'

/**
 * R25.1 (ТЗ 17.11, «Версия маршрута»): для активного заказа версии 1 admin и
 * manager могут перевести его на маршрут v2. Кнопка доступна, только если
 * текущий этап есть в маршруте v2. Перевод пишется в аудит заказа.
 */
export function RouteUpgradeButton({ order, onUpdated }) {
  const { profile, hasRole } = useAuth()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!order || !profile || !hasRole(['admin', 'manager'])) return null
  if (isRouteV2(order) || order.status === 'done' || order.status === 'cancelled') return null
  const v2Route = getOrderRoute({ ...order, route_version: 2 })
  if (!v2Route.includes(order.status)) return null

  async function handleUpgrade() {
    setOpen(false)
    setBusy(true)
    try {
      await updateOrder(order.id, { route_version: 2 })
      const { error: auditErr } = await supabase.from('k24_order_audit').insert({
        order_id: order.id,
        field_name: 'route_version',
        old_value: String(order.route_version ?? 1),
        new_value: '2',
        changed_by: profile.id,
      })
      if (auditErr) throw auditErr
      toast.success('Заказ переведён на новый маршрут')
      onUpdated?.()
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setBusy(false)
    }
  }

  const added = v2Route.filter((s) => !getOrderRoute(order).includes(s))

  return (
    <>
      <Button variant="secondary" size="sm" loading={busy} onClick={() => setOpen(true)}>
        Перевести на новый маршрут
      </Button>
      <ConfirmDialog
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={handleUpgrade}
        title="Перевести на новый маршрут?"
        message={`Заказ останется на этапе «${ORDER_STATUSES[order.status]?.label || order.status}». ${
          added.length > 0 ? `В маршруте появятся этапы: ${added.map((s) => ORDER_STATUSES[s]?.label || s).join(', ')}.` : ''
        } Перевод будет записан в историю изменений заказа.`}
        confirmText="Перевести"
        variant="primary"
      />
    </>
  )
}
