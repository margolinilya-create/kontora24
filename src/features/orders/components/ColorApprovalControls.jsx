import { useState } from 'react'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { updateOrderStatus } from '../hooks/useOrders'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import Modal from '@/shared/components/Modal'

/**
 * R11.1: специальный контрол для этапа color_approval — менеджер показывает
 * напечатанный образец заказчику и фиксирует ответ.
 *
 *  • Утверждено  → updateOrderStatus(..., 'prepress')
 *    (R14.5: batch_layout удалён, заменён prepress — этапы дублирующие.)
 *  • Не утверждено → модалка с обязательным комментарием (мин 5 символов)
 *    → INSERT k24_order_comments + rollback на 'sample_print' (цикл «печать
 *    нового образца → согласование» повторяется до утверждения).
 *
 * Заменяет StatusSwitcher для status='color_approval' в OrderDetailPage.
 */
export function ColorApprovalControls({ order, onUpdated }) {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectText, setRejectText] = useState('')
  const [rejectSubmitting, setRejectSubmitting] = useState(false)

  if (!profile || !order) return null

  async function handleApprove() {
    setLoading(true)
    try {
      await updateOrderStatus(order.id, 'color_approval', 'prepress')
      toast.success('Цвет утверждён → Препресс')
      onUpdated?.()
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleRejectSubmit(e) {
    e.preventDefault()
    const text = rejectText.trim()
    if (text.length < 5) {
      toast.error('Комментарий обязателен, минимум 5 символов')
      return
    }
    setRejectSubmitting(true)
    try {
      const { error: commentErr } = await supabase.from('k24_order_comments').insert({
        order_id: order.id,
        author_id: profile.id,
        author_name: profile.display_name || profile.name,
        author_role: profile.role,
        text: `Цвет не утверждён: ${text}`,
      })
      if (commentErr) throw commentErr
      await updateOrderStatus(order.id, 'color_approval', 'sample_print', { isRollback: true })
      toast.success('Заказ возвращён на «Печать образца»')
      setRejectOpen(false)
      setRejectText('')
      onUpdated?.()
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setRejectSubmitting(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setRejectOpen(true)}
          disabled={loading}
          className="bg-warning/15 hover:bg-warning/25 text-warning font-medium rounded-lg px-3 py-2.5 text-sm transition-colors disabled:opacity-50 min-h-[44px] whitespace-nowrap"
        >
          Не утверждён
        </button>
        <button
          onClick={handleApprove}
          disabled={loading}
          className="bg-success hover:bg-success/85 text-on-accent font-medium rounded-lg px-4 py-2.5 text-sm transition-colors disabled:opacity-50 min-h-[44px] whitespace-nowrap"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin rounded-full border-2 border-white border-t-transparent h-3.5 w-3.5" aria-hidden="true" />
            </span>
          ) : 'Цвет утверждён →'}
        </button>
      </div>

      <Modal
        isOpen={rejectOpen}
        onClose={() => !rejectSubmitting && setRejectOpen(false)}
        title="Заказчик не утвердил цвет"
      >
        <form onSubmit={handleRejectSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-text">
              Что нужно изменить? <span className="text-danger">*</span>
            </span>
            <p className="text-xs text-text-muted mt-1 mb-2">
              Комментарий сохранится в обсуждение заказа. Заказ вернётся на
              этап «Печать образца» для повторной печати.
            </p>
            <textarea
              autoFocus
              value={rejectText}
              onChange={(e) => setRejectText(e.target.value)}
              required
              minLength={5}
              rows={4}
              placeholder="Например: насыщеннее красный, белый темнее"
              className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setRejectOpen(false)}
              disabled={rejectSubmitting}
              className="px-3 py-2 rounded-lg text-sm border border-border hover:bg-surface-2 disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={rejectSubmitting || rejectText.trim().length < 5}
              className="px-4 py-2 rounded-lg text-sm bg-warning hover:opacity-90 text-on-accent disabled:opacity-50"
            >
              {rejectSubmitting ? 'Сохраняем…' : 'Вернуть на «Печать образца»'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  )
}
