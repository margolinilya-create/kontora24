import { useState } from 'react'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import { useRolePermissionsStore } from '@/features/auth/role-permissions-store'
import { updateOrderStatus, updateOrder } from '../hooks/useOrders'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import {
  ORDER_STATUSES, PAYMENT_STATUSES, DELIVERY_TYPES, canAdvanceFrom, getNextStatus, isOrderPaid,
  NO_PAYMENT_CONFIRM_MESSAGE,
} from '@/shared/constants'
import Button from '@/shared/components/Button'
import Modal from '@/shared/components/Modal'
import ConfirmDialog from '@/shared/components/ConfirmDialog'

/**
 * R25.1: карточки этапов отдела продаж на вкладке «Прогресс»:
 *  • «Ждёт оплаты» — способ оплаты + «Оплата получена → далее» / «Запустить без оплаты»
 *  • «Утверждение дизайна» — «Дизайн утверждён → далее» / «Вернуть в дизайн» (комментарий обязателен)
 *  • «Ждёт выдачи» — способ получения (смена пересчитывает маршрут), адрес,
 *    плашка «Заказ не оплачен», «Выдан клиенту» / «Передан в доставку»
 *  • «Доставка» — город, адрес, комментарий, «Доставлен»
 */
export function SalesStageCard({ order, onUpdated }) {
  const { profile } = useAuth()
  const canEdit = useCanDo('order:edit')
  const dynamicPerms = useRolePermissionsStore((s) => s.permissions)
  const dynamicLoaded = useRolePermissionsStore((s) => s.loaded)
  const [busy, setBusy] = useState(false)
  const [payment, setPayment] = useState(order.payment_status && order.payment_status !== 'not_paid' ? order.payment_status : '')
  const [noPayOpen, setNoPayOpen] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const [returnText, setReturnText] = useState('')

  if (!profile || !order) return null
  const stage = order.status
  const perms = dynamicLoaded ? dynamicPerms : null
  const canAdvance = canAdvanceFrom(profile.role, stage, perms)
  const next = getNextStatus(profile.role, stage, order, perms)
  const nextLabel = next ? ORDER_STATUSES[next]?.label || next : null

  async function run(fn, successMsg) {
    setBusy(true)
    try {
      await fn()
      if (successMsg) toast.success(successMsg)
      onUpdated?.()
    } catch (err) {
      toast.error(translateError(err).message || err.message)
    } finally {
      setBusy(false)
    }
  }

  // ── Ждёт оплаты ──
  function handlePaid() {
    if (!payment || payment === 'not_paid') {
      toast.error('Выберите способ оплаты')
      return
    }
    run(async () => {
      if (payment !== order.payment_status) await updateOrder(order.id, { payment_status: payment })
      await updateOrderStatus(order.id, stage, next, {
        kind: 'payment_received',
        note: `Оплата получена: ${PAYMENT_STATUSES[payment]?.label || payment}`,
      })
    }, `Оплата отмечена → ${nextLabel}`)
  }

  function handleNoPayment() {
    setNoPayOpen(false)
    run(() => updateOrderStatus(order.id, stage, next, { confirmNoPayment: true }), `Запущен без оплаты → ${nextLabel}`)
  }

  // ── Утверждение дизайна ──
  async function handleReturnSubmit(e) {
    e.preventDefault()
    const text = returnText.trim()
    if (text.length < 3) {
      toast.error('Опишите, что исправить')
      return
    }
    await run(async () => {
      const { error: commentErr } = await supabase.from('k24_order_comments').insert({
        order_id: order.id,
        author_id: profile.id,
        author_name: profile.display_name || profile.name,
        author_role: profile.role,
        text: `Дизайн не утверждён. Что исправить: ${text}`,
      })
      if (commentErr) throw commentErr
      await updateOrderStatus(order.id, stage, 'design', { isRollback: true, kind: 'design_return', note: text })
      setReturnOpen(false)
      setReturnText('')
    }, 'Заказ возвращён в «Дизайн»')
  }

  // ── Ждёт выдачи: смена способа получения пересчитывает маршрут ──
  function handleDeliveryType(value) {
    if (value === order.delivery_type) return
    run(() => updateOrder(order.id, { delivery_type: value }), 'Способ получения изменён')
  }

  const paid = isOrderPaid(order)
  const isDelivery = order.delivery_type === 'delivery'

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-card p-5 space-y-4">
      <h2 className="font-semibold">{ORDER_STATUSES[stage]?.label || stage}</h2>

      {stage === 'awaiting_payment' && (
        <>
          <label className="block">
            <span className="text-sm text-text-muted">Способ оплаты</span>
            <select
              value={payment}
              onChange={(e) => setPayment(e.target.value)}
              disabled={!canAdvance || busy}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2.5 text-sm bg-surface min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              <option value="">— выбрать —</option>
              {Object.entries(PAYMENT_STATUSES).filter(([k]) => k !== 'not_paid').map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </label>
          {canAdvance && next && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={handlePaid} loading={busy} disabled={!payment}>Оплата получена → далее</Button>
              <Button variant="secondary" onClick={() => setNoPayOpen(true)} disabled={busy}>Запустить без оплаты</Button>
            </div>
          )}
        </>
      )}

      {stage === 'design_approval' && canAdvance && (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => run(() => updateOrderStatus(order.id, stage, next), `Дизайн утверждён → ${nextLabel}`)}
            loading={busy}
            disabled={!next}
          >
            Дизайн утверждён → далее
          </Button>
          <Button variant="secondary" onClick={() => setReturnOpen(true)} disabled={busy}>Вернуть в дизайн</Button>
        </div>
      )}

      {(stage === 'awaiting_pickup' || stage === 'delivery') && (
        <div className="space-y-3">
          {!paid && (
            <div className="rounded-xl bg-danger/10 text-danger text-sm font-medium px-3 py-2">Заказ не оплачен</div>
          )}
          {stage === 'awaiting_pickup' && canEdit ? (
            <label className="block">
              <span className="text-sm text-text-muted">Способ получения</span>
              <select
                value={order.delivery_type || 'pickup'}
                onChange={(e) => handleDeliveryType(e.target.value)}
                disabled={busy}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2.5 text-sm bg-surface min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent/50"
              >
                {Object.entries(DELIVERY_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
          ) : (
            <p className="text-sm"><span className="text-text-muted">Способ получения: </span>{DELIVERY_TYPES[order.delivery_type || 'pickup']?.label}</p>
          )}
          {isDelivery && (
            <dl className="text-sm space-y-1">
              {order.delivery_city && <div><dt className="inline text-text-muted">Город: </dt><dd className="inline">{order.delivery_city}</dd></div>}
              <div><dt className="inline text-text-muted">Адрес: </dt><dd className="inline">{order.delivery_address || '—'}</dd></div>
              {stage === 'delivery' && order.delivery_notes && (
                <div><dt className="inline text-text-muted">Комментарий: </dt><dd className="inline">{order.delivery_notes}</dd></div>
              )}
            </dl>
          )}
          {canAdvance && next && (
            <Button
              onClick={() => run(() => updateOrderStatus(order.id, stage, next), `Заказ → ${nextLabel}`)}
              loading={busy}
            >
              {stage === 'delivery' ? 'Доставлен' : next === 'delivery' ? 'Передан в доставку' : 'Выдан клиенту'}
            </Button>
          )}
        </div>
      )}

      {!canAdvance && (
        <p className="text-sm text-text-muted">Этап продвигает менеджер.</p>
      )}

      <ConfirmDialog
        isOpen={noPayOpen}
        onClose={() => setNoPayOpen(false)}
        onConfirm={handleNoPayment}
        title="Запуск без оплаты"
        message={NO_PAYMENT_CONFIRM_MESSAGE}
        confirmText="Запустить"
        variant="primary"
      />

      <Modal isOpen={returnOpen} onClose={() => !busy && setReturnOpen(false)} title="Вернуть в дизайн">
        <form onSubmit={handleReturnSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-text">Что исправить <span className="text-danger">*</span></span>
            <p className="text-xs text-text-muted mt-1 mb-2">Комментарий попадёт в обсуждение заказа и в историю.</p>
            <textarea
              autoFocus
              value={returnText}
              onChange={(e) => setReturnText(e.target.value)}
              required
              rows={4}
              className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setReturnOpen(false)} disabled={busy}>Отмена</Button>
            <Button type="submit" loading={busy} disabled={returnText.trim().length < 3}>Вернуть в дизайн</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
