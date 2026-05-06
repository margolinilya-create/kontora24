import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { MATERIAL_TYPES } from '@/shared/constants'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'
import Modal from '@/shared/components/Modal'

export function MaterialConsumption({ order }) {
  const { profile } = useAuth()
  const [materials, setMaterials] = useState([])
  const [consumed, setConsumed] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ materialId: '', qty: '' })
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    const [matRes, txRes] = await Promise.all([
      supabase.from('k24_materials').select('*').order('name'),
      supabase.from('k24_material_transactions')
        .select('*, material:k24_materials(name, unit, type)')
        .eq('order_id', order.id)
        .lt('delta', 0)
        .order('created_at', { ascending: false }),
    ])
    setMaterials(matRes.data || [])
    setConsumed(txRes.data || [])
  }, [order.id])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!formData.materialId || !formData.qty) return
    setSaving(true)
    try {
      const qty = Number(formData.qty)

      const { error } = await supabase.from('k24_material_transactions').insert({
        material_id: formData.materialId,
        order_id: order.id,
        delta: -Math.abs(qty),
        reason: `Заказ #${order.number}`,
        created_by: profile.id,
      })
      if (error) throw error

      const { error: rpcError } = await supabase.rpc('update_stock', {
        p_material_id: formData.materialId,
        p_delta: -Math.abs(qty),
      })
      if (rpcError) throw rpcError

      toast.success('Расход записан')
      setShowForm(false)
      setFormData({ materialId: '', qty: '' })
      await loadData()
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setSaving(false)
    }
  }

  const selectedMaterial = materials.find(m => m.id === formData.materialId)

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Расход материалов</h2>
        <Button variant="secondary" size="sm" onClick={() => setShowForm(true)}>
          Записать расход
        </Button>
      </div>

      {consumed.length === 0 ? (
        <p className="text-sm text-text-muted">Расход не записан</p>
      ) : (
        <div className="space-y-2">
          {consumed.map(tx => (
            <div key={tx.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
              <div>
                <span className="font-medium">{tx.material?.name}</span>
                <span className="text-text-muted ml-2">{Math.abs(tx.delta)} {tx.material?.unit}</span>
              </div>
              <span className="text-xs text-text-muted">
                {new Date(tx.created_at).toLocaleDateString('ru-RU')}
              </span>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal isOpen onClose={() => setShowForm(false)} title="Записать расход" maxWidth="max-w-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="mat-select" className="block text-sm font-medium text-text mb-1">Материал</label>
              <select
                id="mat-select"
                value={formData.materialId}
                onChange={(e) => setFormData({ ...formData, materialId: e.target.value })}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent/50"
                required
              >
                <option value="">Выберите материал</option>
                {materials.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({MATERIAL_TYPES[m.type]?.label || m.type}) — остаток: {m.stock_qty} {m.unit}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label={`Количество${selectedMaterial ? ` (${selectedMaterial.unit})` : ''}`}
              id="mat-qty"
              type="number"
              value={formData.qty}
              onChange={(e) => setFormData({ ...formData, qty: e.target.value })}
              min="0.01"
              step="any"
              required
              placeholder="0"
            />

            {selectedMaterial && Number(formData.qty) > selectedMaterial.stock_qty && (
              <p className="text-xs text-danger">Внимание: на складе {selectedMaterial.stock_qty} {selectedMaterial.unit}</p>
            )}

            <Button type="submit" loading={saving} className="w-full">
              Записать
            </Button>
          </form>
        </Modal>
      )}
    </div>
  )
}
