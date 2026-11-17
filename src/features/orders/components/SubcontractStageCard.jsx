import { useState } from 'react'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import { useRolePermissionsStore } from '@/features/auth/role-permissions-store'
import { updateOrderStatus } from '../hooks/useOrders'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { canAdvanceFrom, getNextStatus, getStatusMeta } from '@/shared/constants'
import { formatPrice } from '@/shared/lib/utils'
import Button from '@/shared/components/Button'

/**
 * R25.4 (ТЗ 4.2): карточка этапа «Субподряд» на вкладке «Прогресс» —
 * подрядчик, его контакты, что заказано, стоимость (только с правом на
 * финансы) и кнопка «Получено от подрядчика → Упаковка».
 */
export function SubcontractStageCard({ order, onUpdated }) {
  const { profile } = useAuth()
  const canSeeFinance = useCanDo('view:finance')
  const dynamicPerms = useRolePermissionsStore((s) => s.permissions)
  const dynamicLoaded = useRolePermissionsStore((s) => s.loaded)
  const [busy, setBusy] = useState(false)

  if (!profile || !order) return null
  const perms = dynamicLoaded ? dynamicPerms : null
  const canAdvance = canAdvanceFrom(profile.role, 'subcontract', perms)
  const next = getNextStatus(profile.role, 'subcontract', order, perms)
  const nextLabel = next ? getStatusMeta(next)?.label || next : null
  const c = order.contractor

  async function handleReceived() {
    setBusy(true)
    try {
      await updateOrderStatus(order.id, 'subcontract', next)
      toast.success(`Получено от подрядчика → ${nextLabel}`)
      onUpdated?.()
    } catch (err) {
      toast.error(translateError(err).message || err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-card p-5 space-y-4">
      <h2 className="font-semibold">Субподряд</h2>
      <dl className="text-sm space-y-1.5">
        <div>
          <dt className="inline text-text-muted">Подрядчик: </dt>
          <dd className="inline font-medium">
            {c?.name || '—'}
            {c?.archived_at && <span className="text-text-muted font-normal"> (архив)</span>}
          </dd>
        </div>
        {c?.specialization && (
          <div><dt className="inline text-text-muted">Специализация: </dt><dd className="inline">{c.specialization}</dd></div>
        )}
        {(c?.contact_person || c?.phone || c?.contact) && (
          <div>
            <dt className="inline text-text-muted">Контакты: </dt>
            <dd className="inline break-words">
              {c.contact_person}
              {c.phone && <>{c.contact_person ? ' · ' : ''}<a href={`tel:${c.phone}`} className="underline decoration-text-muted/40 hover:decoration-accent">{c.phone}</a></>}
              {c.contact && <>{(c.contact_person || c.phone) ? ' · ' : ''}{c.contact}</>}
            </dd>
          </div>
        )}
        <div>
          <dt className="inline text-text-muted">Что заказано: </dt>
          <dd className="inline whitespace-pre-wrap break-words">{order.contractor_notes || '—'}</dd>
        </div>
        {canSeeFinance && (
          <div>
            <dt className="inline text-text-muted">Стоимость работ: </dt>
            <dd className="inline font-medium">{order.contractor_cost != null ? formatPrice(order.contractor_cost) : '—'}</dd>
          </div>
        )}
      </dl>

      {canAdvance && next ? (
        <Button onClick={handleReceived} loading={busy}>
          Получено от подрядчика → {nextLabel}
        </Button>
      ) : (
        <p className="text-sm text-text-muted">Этап продвигает менеджер.</p>
      )}
    </div>
  )
}
