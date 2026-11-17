import { useState } from 'react'
import { usePackDesigns } from '@/features/production/hooks/usePackDesigns'
import { useOrderItems } from '../hooks/useOrderItems'
import { REPRINT_REASONS } from '@/shared/constants'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'
import Modal from '@/shared/components/Modal'

/**
 * Окно «Создать допечатку» (R22.1 / R23.5). Вынесено из OrderSubtasksTab в
 * R25.2, чтобы форма ТК открывала ТО ЖЕ окно с предзаполнением (ТЗ 2.1):
 * initial = { qty, reason, comment, view } — любые поля необязательны.
 *
 * @param {object} order
 * @param {Function} createReprint — из useReprintSubtasks(order.id)
 * @param {object} [initial]
 * @param {Function} onClose
 * @param {Function} [onCreated]
 */
export function CreateReprintModal({ order, createReprint, initial, onClose, onCreated }) {
  const [form, setForm] = useState(() => ({
    qty: initial?.qty ? String(initial.qty) : '',
    reason: initial?.reason || '',
    comment: initial?.comment || '',
    view: initial?.view != null ? String(initial.view) : '',
  }))
  const [saving, setSaving] = useState(false)

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
      onCreated?.()
      onClose()
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Создать допечатку" maxWidth="max-w-sm">
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
  )
}
