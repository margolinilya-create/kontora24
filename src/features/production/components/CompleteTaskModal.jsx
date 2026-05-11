import { useState, useEffect } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useRolePermissionsStore } from '@/features/auth/role-permissions-store'
import { updateOrderStatus } from '@/features/orders/hooks/useOrders'
import { getNextStatus, MS_PER_MINUTE } from '@/shared/constants'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import Modal from '@/shared/components/Modal'
import Button from '@/shared/components/Button'

export function CompleteTaskModal({ order, isOpen, onClose, onCompleted }) {
  const { profile } = useAuth()
  const dynamicPerms = useRolePermissionsStore((s) => s.permissions)
  const dynamicLoaded = useRolePermissionsStore((s) => s.loaded)
  const [materials, setMaterials] = useState([])
  const [consumption, setConsumption] = useState([]) // [{materialId, qty}]
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState('confirm') // 'confirm' | 'materials'

  const nextStatus = getNextStatus(profile?.role, order?.status, order, dynamicLoaded ? dynamicPerms : null)

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
      const TIMER_KEY = profile?.id ? `kontora24_active_timer_${profile.id}` : 'kontora24_active_timer'
      const savedTimer = JSON.parse(localStorage.getItem(TIMER_KEY) || 'null')
      if (savedTimer && savedTimer.orderId === order.id && savedTimer.entryId) {
        const endedAt = new Date()
        // Fetch started_at from DB since localStorage only stores orderId + entryId
        const { data: timerEntry } = await supabase
          .from('k24_time_entries')
          .select('started_at')
          .eq('id', savedTimer.entryId)
          .is('ended_at', null)
          .single()
        if (timerEntry) {
          const durationMinutes = Math.max(1, Math.round((endedAt - new Date(timerEntry.started_at)) / MS_PER_MINUTE))
          const { error: timerError } = await supabase.from('k24_time_entries')
            .update({ ended_at: endedAt.toISOString(), duration_minutes: durationMinutes })
            .eq('id', savedTimer.entryId)
          if (timerError) throw timerError
        }
        localStorage.removeItem(TIMER_KEY)
      }

      // 2. Record material consumption (if any)
      for (const item of consumption) {
        const qty = Number(item.qty)
        if (!item.materialId || !qty || qty <= 0) continue
        const { error: txError } = await supabase.from('k24_material_transactions').insert({
          material_id: item.materialId,
          order_id: order.id,
          delta: -qty,
          reason: `Заказ #${order.number}`,
          created_by: profile.id,
        })
        if (txError) throw txError
        const { error: stockError } = await supabase.rpc('update_stock', {
          p_material_id: item.materialId,
          p_delta: -qty,
        })
        if (stockError) throw stockError
      }

      // 3. Change status
      await updateOrderStatus(order.id, order.status, nextStatus)

      // Haptic feedback on successful completion
      if (navigator.vibrate) navigator.vibrate(10)
      toast.success(`Заказ #${order.number} — ${nextStatus === 'done' ? 'готово' : 'передан дальше'}`)
      onCompleted?.()
      onClose()
    } catch (err) {
      toast.error(translateError(err).message)
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
                  aria-label="Выбор материала"
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
                inputMode="decimal"
                value={item.qty}
                onChange={(e) => updateConsumptionRow(i, 'qty', e.target.value)}
                placeholder="Кол-во"
                aria-label="Количество"
                className="w-24 rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text"
                min="0"
                step="any"
              />
              <button onClick={() => removeConsumptionRow(i)} aria-label="Удалить строку расхода" className="text-text-muted hover:text-danger text-lg px-2 min-w-[44px] min-h-[44px] flex items-center justify-center">&times;</button>
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
