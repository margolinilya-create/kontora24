import { useState } from 'react'
import { createMaterial } from '../hooks/useMaterials'
import { MATERIAL_TYPES } from '@/shared/constants'
import { toast } from '@/shared/stores/toast-store'
import Modal from '@/shared/components/Modal'
import Input from '@/shared/components/Input'
import Button from '@/shared/components/Button'

export function MaterialForm({ onClose, onCreated }) {
  const [form, setForm] = useState({ type: 'film', name: '', unit: 'm2', stockQty: 0, minQty: 0, pricePerUnit: 0 })
  const [loading, setLoading] = useState(false)

  function update(k, v) { setForm((p) => ({ ...p, [k]: v })) }

  // Auto-set unit when type changes
  function handleTypeChange(type) {
    const unitMap = { film: 'm2', ink: 'ml', lam_film: 'm2', resin: 'g' }
    update('type', type)
    update('unit', unitMap[type] || 'm2')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setLoading(true)
    try {
      await createMaterial(form)
      toast.success('Материал добавлен')
      onCreated()
    } catch (err) {
      toast.error('Ошибка: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={true} onClose={onClose} title="Новый материал" maxWidth="max-w-sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="mat-type" className="block text-sm font-medium text-text mb-1">Тип</label>
          <select
            id="mat-type"
            value={form.type}
            onChange={(e) => handleTypeChange(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent/50"
          >
            {Object.entries(MATERIAL_TYPES).map(([key, m]) => (
              <option key={key} value={key}>{m.label}</option>
            ))}
          </select>
        </div>

        <Input
          label="Название *"
          id="mat-name"
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          required
          placeholder="Плёнка белая глянцевая"
          autoFocus
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label={`Остаток (${form.unit})`}
            id="mat-stock"
            type="number"
            value={form.stockQty}
            onChange={(e) => update('stockQty', Number(e.target.value))}
            min="0"
            step="any"
          />
          <Input
            label="Минимум"
            id="mat-min"
            type="number"
            value={form.minQty}
            onChange={(e) => update('minQty', Number(e.target.value))}
            min="0"
            step="any"
          />
        </div>

        <Input
          label="Цена за ед. (₽)"
          id="mat-price"
          type="number"
          value={form.pricePerUnit}
          onChange={(e) => update('pricePerUnit', Number(e.target.value))}
          min="0"
          step="any"
        />

        <Button type="submit" loading={loading} className="w-full">
          Добавить материал
        </Button>
      </form>
    </Modal>
  )
}
