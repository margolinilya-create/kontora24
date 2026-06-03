import { useState } from 'react'
import { updateMaterial } from '../hooks/useMaterials'
import { MATERIAL_TYPES } from '@/shared/constants'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import Modal from '@/shared/components/Modal'
import Input from '@/shared/components/Input'
import Button from '@/shared/components/Button'

// R13.1 (бриф 02.06): менеджер может править любое поле позиции склада.
// Список допустимых единиц вынесен в общую константу — используется тут
// и в MaterialForm.
export const UNIT_OPTIONS = ['m', 'm2', 'ml', 'g', 'kg', 'шт', 'рулон', 'упаковка', 'литр']

export function MaterialEditModal({ material, onClose, onUpdated }) {
  const [form, setForm] = useState({
    name: material.name || '',
    type: material.type || 'film',
    unit: material.unit || 'm2',
    minQty: Number(material.min_qty) || 0,
  })
  const [loading, setLoading] = useState(false)

  function update(k, v) { setForm((p) => ({ ...p, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setLoading(true)
    try {
      await updateMaterial(material.id, {
        name: form.name.trim(),
        type: form.type,
        unit: form.unit,
        min_qty: form.minQty,
      })
      toast.success('Позиция сохранена')
      onUpdated()
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={true} onClose={onClose} title="Редактировать позицию" maxWidth="max-w-sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Название *"
          id="medit-name"
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          required
          autoFocus
        />

        <div>
          <label htmlFor="medit-type" className="block text-sm font-medium text-text mb-1">Тип</label>
          <select
            id="medit-type"
            value={form.type}
            onChange={(e) => update('type', e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent/50"
          >
            {Object.entries(MATERIAL_TYPES).map(([key, m]) => (
              <option key={key} value={key}>{m.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="medit-unit" className="block text-sm font-medium text-text mb-1">Единица измерения</label>
          <select
            id="medit-unit"
            value={form.unit}
            onChange={(e) => update('unit', e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent/50"
          >
            {UNIT_OPTIONS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>

        <Input
          label={`Минимум (${form.unit})`}
          id="medit-min"
          type="number"
          value={form.minQty}
          onChange={(e) => update('minQty', Number(e.target.value))}
          min="0"
          step="any"
        />

        <Button type="submit" loading={loading} className="w-full">
          Сохранить
        </Button>
      </form>
    </Modal>
  )
}
