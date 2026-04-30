import { useState } from 'react'
import { createMaterial } from '../hooks/useMaterials'
import { MATERIAL_TYPES } from '@/shared/constants'
import { toast } from '@/shared/stores/toast-store'

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="bg-surface rounded-xl shadow-xl max-w-sm w-full">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-semibold">Новый материал</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text text-xl" aria-label="Закрыть">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label htmlFor="mat-type" className="block text-sm font-medium mb-1.5">Тип</label>
            <select
              id="mat-type"
              value={form.type}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              {Object.entries(MATERIAL_TYPES).map(([key, m]) => (
                <option key={key} value={key}>{m.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="mat-name" className="block text-sm font-medium mb-1.5">Название *</label>
            <input
              id="mat-name"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              required
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
              placeholder="Плёнка белая глянцевая"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="mat-stock" className="block text-sm font-medium mb-1.5">Остаток ({form.unit})</label>
              <input id="mat-stock" type="number" value={form.stockQty} onChange={(e) => update('stockQty', Number(e.target.value))} min="0" step="any" className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50" />
            </div>
            <div>
              <label htmlFor="mat-min" className="block text-sm font-medium mb-1.5">Минимум</label>
              <input id="mat-min" type="number" value={form.minQty} onChange={(e) => update('minQty', Number(e.target.value))} min="0" step="any" className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50" />
            </div>
          </div>

          <div>
            <label htmlFor="mat-price" className="block text-sm font-medium mb-1.5">Цена за ед. (₽)</label>
            <input id="mat-price" type="number" value={form.pricePerUnit} onChange={(e) => update('pricePerUnit', Number(e.target.value))} min="0" step="any" className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50" />
          </div>

          <button type="submit" disabled={loading} className="w-full bg-accent hover:bg-accent-hover text-white font-medium rounded-lg py-2.5 text-sm transition-colors disabled:opacity-50">
            {loading ? 'Создание...' : 'Добавить материал'}
          </button>
        </form>
      </div>
    </div>
  )
}
