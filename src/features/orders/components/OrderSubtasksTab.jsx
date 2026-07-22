import { useState } from 'react'
import { useReprintSubtasks } from '../hooks/useReprintSubtasks'
import { SubtaskCard } from '@/features/production/components/SubtaskCard'
import { REPRINT_REASONS, REPRINT_STATUS_LABELS, SUBTASK_STATUS_LABELS, TRACK_LABELS } from '@/shared/constants'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'
import Modal from '@/shared/components/Modal'
import Spinner from '@/shared/components/Spinner'

/**
 * R22.1 (ТЗ 20.07 Фаза 1) — вкладка «Подзадачи» карточки заказа.
 * Инструмент контроля: список допечаток + создание. Ввод данных — на странице
 * подзадачи. Старая система (bg/stickers/extra_stickers) — read-only архив.
 */
export function OrderSubtasksTab({ order }) {
  const { reprints, legacy, loading, createReprint } = useReprintSubtasks(order.id)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ qty: '', reason: '', comment: '' })
  const [saving, setSaving] = useState(false)

  async function handleCreate(e) {
    e.preventDefault()
    const qty = Number(form.qty)
    if (!qty || qty <= 0) { toast.error('Укажите количество к допечатке'); return }
    setSaving(true)
    try {
      await createReprint(order, { qty, reason: form.reason || null, comment: form.comment || null })
      toast.success('Допечатка создана')
      setShowCreate(false)
      setForm({ qty: '', reason: '', comment: '' })
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setSaving(false)
    }
  }

  // Итог с учётом допечаток: производство сверх тиража (может быть >100%).
  const producedExtra = reprints
    .filter((r) => r.status === 'done')
    .reduce((s, r) => s + (r.qty || 0), 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold">Подзадачи (допечатки)</h2>
          <p className="text-sm text-text-muted">
            Допечатка проходит полный маршрут от печати. Заказ нельзя завершить, пока есть незавершённые допечатки.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setShowCreate(true)}>+ Создать допечатку</Button>
      </div>

      {producedExtra > 0 && (
        <div className="bg-surface rounded-xl border border-border p-4 text-sm">
          <span className="text-text-muted">Допечатано сверх тиража: </span>
          <span className="font-medium">{producedExtra} шт</span>
          <span className="text-text-muted"> (тираж заказа {order.qty} шт)</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : reprints.length === 0 ? (
        <p className="text-sm text-text-muted">Допечаток нет.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {reprints.map((r) => (
            <SubtaskCard key={r.id} subtask={r} order={order} overall={r.overall} uiStatus={r.uiStatus} />
          ))}
        </div>
      )}

      {/* Архив старой системы (read-only) */}
      {legacy.length > 0 && (
        <details className="bg-surface rounded-xl border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium text-text-muted">
            Архив (старая система подзадач) — {legacy.length}
          </summary>
          <div className="mt-3 space-y-2">
            {legacy.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                <span>{TRACK_LABELS[s.track] || s.track}{s.item_idx ? ` #${s.item_idx}` : ''}</span>
                <span className="text-xs text-text-muted">{SUBTASK_STATUS_LABELS[s.status] || REPRINT_STATUS_LABELS[s.status] || s.status}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {showCreate && (
        <Modal isOpen onClose={() => setShowCreate(false)} title="Создать допечатку" maxWidth="max-w-sm">
          <form onSubmit={handleCreate} className="space-y-4">
            <Input
              id="reprint-qty"
              label="Количество к допечатке (шт)"
              type="number"
              inputMode="numeric"
              min="1"
              value={form.qty}
              onChange={(e) => setForm((p) => ({ ...p, qty: e.target.value }))}
              required
              placeholder="0"
            />
            <div>
              <label htmlFor="reprint-reason" className="block text-sm font-medium text-text mb-1">Причина</label>
              <select
                id="reprint-reason"
                value={form.reason}
                onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent/50"
              >
                <option value="">Не указана</option>
                {Object.entries(REPRINT_REASONS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </div>
            <Input
              id="reprint-comment"
              label="Комментарий"
              value={form.comment}
              onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
              placeholder="Необязательно"
            />
            <Button type="submit" loading={saving} className="w-full">Создать</Button>
          </form>
        </Modal>
      )}
    </div>
  )
}
