import { useState, useMemo } from 'react'
import Modal from '@/shared/components/Modal'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'

/**
 * R11.3: модалка ввода qty по видам для подзадачи «Стикеры дополнительно».
 *
 * Список видов определяется автоматически по типу заказа:
 *   • stickerpack3D с pack_designs — берём из designs (passed prop)
 *   • sticker3D / другие с design_variants > 1 — синтетические 1..N
 *   • single-design — одна строка с индексом 1
 *
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {object} props.order
 * @param {Array<{ design_index: number, name?: string }>} [props.designs] — из usePackDesigns (для 3D-pack)
 * @param {(designsByIdx: object) => Promise<any>} props.onCreate — RPC createExtraStickers
 */
export function ExtraStickersModal({ isOpen, onClose, order, designs = [], onCreate }) {
  const items = useMemo(() => buildDesignsList(order, designs), [order, designs])
  const [qtyByIdx, setQtyByIdx] = useState({})
  const [submitting, setSubmitting] = useState(false)

  function setQty(idx, value) {
    setQtyByIdx((prev) => ({ ...prev, [idx]: value }))
  }

  const total = Object.values(qtyByIdx).reduce((s, v) => s + (Number(v) || 0), 0)

  async function handleSubmit(e) {
    e.preventDefault()
    // Собираем только положительные qty
    const payload = {}
    for (const [idx, v] of Object.entries(qtyByIdx)) {
      const n = Number(v) || 0
      if (n > 0) payload[idx] = n
    }
    if (Object.keys(payload).length === 0) {
      toast.error('Введите количество хотя бы по одному виду')
      return
    }
    setSubmitting(true)
    try {
      await onCreate(payload)
      toast.success('Подзадача доп. стикеров создана')
      setQtyByIdx({})
      onClose()
    } catch (err) {
      toast.error(translateError(err).message || err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !submitting && onClose()}
      title="Стикеры дополнительно"
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-text-muted">
          Укажите сколько стикеров каждого вида нужно допечатать. Создастся параллельная
          подзадача, которая пройдёт {is3D(order) ? 'печать → резку → заливку → сушку 36ч' : 'печать → резку'}.
        </p>

        <div className="space-y-2">
          {items.map((it) => (
            <label key={it.design_index} className="flex items-center gap-3 text-sm">
              <span className="flex-1 truncate">
                {it.name || `Вид ${it.design_index}`}
              </span>
              <input
                type="number"
                min="0"
                value={qtyByIdx[it.design_index] || ''}
                onChange={(e) => setQty(it.design_index, e.target.value)}
                placeholder="0"
                className="w-24 px-3 py-2 bg-bg border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 tabular-nums"
              />
              <span className="text-xs text-text-muted w-8">шт</span>
            </label>
          ))}
        </div>

        {total > 0 && (
          <p className="text-xs text-text-muted">
            Итого: <span className="font-medium text-text">{total}</span> шт
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-2 rounded-lg text-sm border border-border hover:bg-surface-2 disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={submitting || total === 0}
            className="px-4 py-2 rounded-lg text-sm bg-accent hover:bg-accent-hover text-on-accent disabled:opacity-50"
          >
            {submitting ? 'Создаём…' : 'Создать подзадачу'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function is3D(order) {
  return order?.order_type === 'sticker3D' || order?.order_type === 'stickerpack3D'
}

function buildDesignsList(order, designs) {
  // Для stickerpack3D — берём из pack_designs (более информативно — есть имена)
  if (order?.order_type === 'stickerpack3D' && designs.length > 0) {
    return designs.map((d) => ({ design_index: d.design_index, name: d.name }))
  }
  // Для остальных с design_variants > 1 — синтетические индексы
  const variants = Number(order?.design_variants) || 1
  if (variants > 1) {
    return Array.from({ length: variants }, (_, i) => ({
      design_index: i + 1,
      name: `Вид ${i + 1}`,
    }))
  }
  // Single-design — одна строка
  return [{ design_index: 1, name: 'Стикеры' }]
}
