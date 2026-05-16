import { useState } from 'react'
import { updateOrderStatus } from '@/features/orders/hooks/useOrders'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { ORDER_STATUSES, getOrderRoute } from '@/shared/constants'
import Button from '@/shared/components/Button'

/**
 * Stage jumper для admin/manager — продвинуть заказ на другой этап маршрута
 * или откатить на пройденный. Используется на NO_INPUT этапах (new/design/
 * prepress/otk) и как ручной возврат при недостаче (фидбэк менеджера 17.05).
 *
 * Маркировка:
 *   ↑ — продвижение (force: true, пропускает check_stage_completion)
 *   ↓ — откат (isRollback: true, пропускает completion check)
 */
export function StageJumper({ order, onUpdated }) {
  const { hasRole } = useAuth()
  const [target, setTarget] = useState('')
  const [saving, setSaving] = useState(false)

  if (!hasRole(['admin', 'manager'])) return null

  const route = getOrderRoute(order)
  const currentIdx = route.indexOf(order.status)
  if (currentIdx < 0) return null

  // Опции маршрута, кроме текущего статуса
  const options = route
    .map((s, i) => ({ status: s, direction: i < currentIdx ? 'back' : i > currentIdx ? 'forward' : null }))
    .filter((o) => o.direction)

  if (options.length === 0) return null

  async function handleJump() {
    if (!target) return
    const optEntry = options.find((o) => o.status === target)
    if (!optEntry) return
    setSaving(true)
    try {
      await updateOrderStatus(order.id, order.status, target, {
        isRollback: optEntry.direction === 'back',
        force: optEntry.direction === 'forward',
      })
      toast.success(optEntry.direction === 'back' ? 'Заказ возвращён' : 'Заказ продвинут')
      setTarget('')
      onUpdated?.()
    } catch (err) {
      toast.error(translateError(err).message || err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-end gap-2">
      <label className="flex-1 min-w-0">
        <span className="block text-xs text-text-muted mb-1">Перейти на этап</span>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/50"
        >
          <option value="">— выбрать —</option>
          {options.map((o) => (
            <option key={o.status} value={o.status}>
              {o.direction === 'back' ? '↓' : '↑'} {ORDER_STATUSES[o.status]?.label || o.status}
            </option>
          ))}
        </select>
      </label>
      <Button size="sm" disabled={!target} loading={saving} onClick={handleJump}>
        Перейти
      </Button>
    </div>
  )
}
