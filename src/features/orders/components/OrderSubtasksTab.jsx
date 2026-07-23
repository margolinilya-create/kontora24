import { useState } from 'react'
import { useReprintSubtasks } from '../hooks/useReprintSubtasks'
import { usePackDesigns } from '@/features/production/hooks/usePackDesigns'
import { useOrderItems } from '../hooks/useOrderItems'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { SubtaskCard } from '@/features/production/components/SubtaskCard'
import { REPRINT_REASONS, REPRINT_STATUS_LABELS, SUBTASK_STATUS_LABELS, TRACK_LABELS } from '@/shared/constants'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'
import Modal from '@/shared/components/Modal'
import Spinner from '@/shared/components/Spinner'
import ConfirmDialog from '@/shared/components/ConfirmDialog'

/**
 * R22.1 (ТЗ 20.07 Фаза 1) — вкладка «Подзадачи» карточки заказа.
 * Инструмент контроля: список допечаток + создание. Ввод данных — на странице
 * подзадачи. Старая система (bg/stickers/extra_stickers) — read-only архив.
 */
export function OrderSubtasksTab({ order }) {
  const { reprints, legacy, loading, createReprint, deleteReprint } = useReprintSubtasks(order.id)
  const { hasRole } = useAuth()
  const canManage = hasRole(['admin', 'manager'])
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ qty: '', reason: '', comment: '', view: '' })
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null) // subtask | null

  // R23.5: селектор вида — какой вид доделывает допечатка. Источник зависит от
  // типа: stickerpack3D → k24_pack_designs (design_index), иначе → k24_order_items
  // (idx мульти-вида). Оба хука вызываем всегда (правила хуков), «лишнему» — null.
  const isPack3D = order.order_type === 'stickerpack3D'
  const { designs } = usePackDesigns(isPack3D ? order.id : null)
  const { items } = useOrderItems(isPack3D ? null : order.id)
  const viewOptions = isPack3D
    ? (designs || []).map((d) => ({
        value: d.design_index,
        label: `Вид #${d.design_index}${d.name ? ` · ${d.name}` : ''}`,
      }))
    : (items || []).map((it) => ({
        value: it.idx,
        label: `Размер #${it.idx} · ${Number(it.width_mm)}×${Number(it.height_mm)} мм`,
      }))
  const showViewSelect = viewOptions.length > 1

  async function handleCreate(e) {
    e.preventDefault()
    const qty = Number(form.qty)
    if (!qty || qty <= 0) { toast.error('Укажите количество к допечатке'); return }
    if (showViewSelect && form.view === '') { toast.error('Выберите вид, к которому относится допечатка'); return }
    setSaving(true)
    try {
      await createReprint(order, {
        qty,
        reason: form.reason || null,
        comment: form.comment || null,
        viewRef: showViewSelect ? Number(form.view) : null,
      })
      toast.success('Допечатка создана')
      setShowCreate(false)
      setForm({ qty: '', reason: '', comment: '', view: '' })
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    const st = pendingDelete
    setPendingDelete(null)
    if (!st) return
    try {
      await deleteReprint(st.id)
      toast.success('Допечатка удалена')
    } catch (err) {
      toast.error(translateError(err).message)
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
            <SubtaskCard
              key={r.id}
              subtask={r}
              order={order}
              overall={r.overall}
              uiStatus={r.uiStatus}
              onDelete={canManage && r.status !== 'done' ? () => setPendingDelete(r) : undefined}
            />
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
            {showViewSelect && (
              <div>
                <label htmlFor="reprint-view" className="block text-sm font-medium text-text mb-1">
                  {isPack3D ? 'Вид стикера' : 'Вид изделия'} <span className="text-danger">*</span>
                </label>
                <select
                  id="reprint-view"
                  value={form.view}
                  onChange={(e) => setForm((p) => ({ ...p, view: e.target.value }))}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent/50"
                >
                  <option value="">— выберите вид —</option>
                  {viewOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            )}
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

      <ConfirmDialog
        isOpen={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="Удалить допечатку?"
        message={pendingDelete
          ? `«${pendingDelete.title}» будет удалена. Действие доступно только пока по допечатке нет внесённых данных.`
          : ''}
        confirmText="Удалить"
        variant="danger"
      />
    </div>
  )
}
