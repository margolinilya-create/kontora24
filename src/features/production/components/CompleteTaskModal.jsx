import { useState, useEffect } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { updateOrderStatus } from '@/features/orders/hooks/useOrders'
import { getNextStatus } from '@/shared/constants'
import { toast } from '@/shared/stores/toast-store'
import Modal from '@/shared/components/Modal'
import Button from '@/shared/components/Button'

export function CompleteTaskModal({ order, isOpen, onClose, onCompleted }) {
  const { profile } = useAuth()
  const [materials, setMaterials] = useState([])
  const [consumption, setConsumption] = useState([]) // [{materialId, qty}]
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState('confirm') // 'confirm' | 'materials'

  const nextStatus = getNextStatus(profile?.role, order?.status, order)

  useEffect(() => {
    if (!isOpen) return
    // Load available materials
    supabase.from('k24_materials').select('*').order('name').then(({ data }) => {
      setMaterials(data || [])
    })
    setStep('confirm')
    setConsumption([])
  }, [isOpen])

  async function handleComplete() {
    if (!profile || !order || !nextStatus) return
    setSaving(true)
    try {
      // 1. Stop active timer (if any)
      const TIMER_KEY = 'kontora24_active_timer'
      const savedTimer = JSON.parse(localStorage.getItem(TIMER_KEY) || 'null')
      if (savedTimer && savedTimer.orderId === order.id) {
        const endedAt = new Date()
        await supabase.from('k24_time_entries')
          .update({ ended_at: endedAt.toISOString(), duration_minutes: Math.round((endedAt - new Date(savedTimer.startedAt || endedAt)) / 60000) })
          .eq('id', savedTimer.entryId)
          .is('ended_at', null)
        localStorage.removeItem(TIMER_KEY)
      }

      // 2. Record material consumption (if any)
      for (const item of consumption) {
        if (!item.materialId || !item.qty) continue
        await supabase.from('k24_material_transactions').insert({
          material_id: item.materialId,
          order_id: order.id,
          delta: -Math.abs(Number(item.qty)),
          reason: `Заказ #${order.number}`,
          created_by: profile.id,
        })
        await supabase.rpc('update_stock', { p_material_id: item.materialId, p_delta: -Math.abs(Number(item.qty)) })
      }

      // 3. Change status
      await updateOrderStatus(order.id, order.status, nextStatus)

      toast.success(`Заказ #${order.number} — ${nextStatus === 'done' ? 'готово' : 'передан дальше'}`)
      onCompleted?.()
      onClose()
    } catch (err) {
      toast.error('Ошибка: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  function addConsumptionRow() {
    setConsumption([...consumption, { materialId: '', qty: '' }])
  }

  function updateConsumptionRow(index, field, value) {
    const updated = [...consumption]
    updated[index] = { ...updated[index], [field]: value }
    setConsumption(updated)
  }

  function removeConsumptionRow(index) {
    setConsumption(consumption.filter((_, i) => i !== index))
  }

  if (!isOpen || !order) return null

  return (
    <Modal isOpen onClose={onClose} title={`Завершить задачу #${order.number}`} maxWidth="max-w-md">
      {step === 'confirm' && (
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Заказ будет переведён в статус: <span className="font-medium text-text">{nextStatus === 'done' ? 'Готово' : nextStatus}</span>
          </p>

          <div className="flex gap-2">
            <Button onClick={() => setStep('materials')} variant="secondary" className="flex-1">
              Записать расход
            </Button>
            <Button onClick={handleComplete} loading={saving} className="flex-1">
              Готово
            </Button>
          </div>
        </div>
      )}

      {step === 'materials' && (
        <div className="space-y-4">
          {consumption.map((item, i) => (
            <div key={i} className="flex gap-2 items-end">
              <div className="flex-1">
                <select
                  value={item.materialId}
                  onChange={(e) => updateConsumptionRow(i, 'materialId', e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text"
                >
                  <option value="">Материал</option>
                  {materials.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.stock_qty} {m.unit})</option>
                  ))}
                </select>
              </div>
              <input
                type="number"
                value={item.qty}
                onChange={(e) => updateConsumptionRow(i, 'qty', e.target.value)}
                placeholder="Кол-во"
                className="w-24 rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text"
                min="0"
                step="any"
              />
              <button onClick={() => removeConsumptionRow(i)} className="text-text-muted hover:text-danger text-lg px-1">&times;</button>
            </div>
          ))}

          <button onClick={addConsumptionRow} className="text-sm text-accent hover:underline">
            + Добавить материал
          </button>

          <div className="flex gap-2">
            <Button onClick={() => setStep('confirm')} variant="secondary" className="flex-1">
              Назад
            </Button>
            <Button onClick={handleComplete} loading={saving} className="flex-1">
              Записать и завершить
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
