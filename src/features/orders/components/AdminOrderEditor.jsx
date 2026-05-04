import { useState, useEffect } from 'react'
import { updateOrder } from '../hooks/useOrders'
import { ORDER_TYPES, ORDER_STATUSES, PRIORITIES } from '@/shared/constants'
import { supabase } from '@/shared/lib/supabase'
import Button from '@/shared/components/Button'
import { toast } from '@/shared/stores/toast-store'

export function AdminOrderEditor({ order, onSaved, onCancel }) {
  const [form, setForm] = useState({})
  const [clients, setClients] = useState([])
  const [profiles, setProfiles] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!order) return
    setForm({
      order_type: order.order_type || '',
      width_mm: order.width_mm || '',
      height_mm: order.height_mm || '',
      qty: order.qty || '',
      need_lam: order.need_lam || false,
      lam_type: order.lam_type || 'glossy',
      design_variants: order.design_variants || '',
      deadline: order.deadline ? order.deadline.split('T')[0] : '',
      priority: order.priority || 'normal',
      notes: order.notes || '',
      client_id: order.client_id || '',
      assigned_to: order.assigned_to || '',
      status: order.status || 'new',
      bopp_bag: order.bopp_bag || false,
      price_final: order.price_final || '',
      cost_materials: order.cost_materials || '',
      cost_labor: order.cost_labor || '',
      cost_total: order.cost_total || '',
      price_per_unit: order.price_per_unit || '',
      markup: order.markup || '',
      discount_pct: order.discount_pct || '',
      printed_meters: order.printed_meters || '',
      resin_used: order.resin_used || '',
      rejected_qty: order.rejected_qty || '',
      printed_qty: order.printed_qty || '',
    })
  }, [order])

  useEffect(() => {
    async function fetchLists() {
      const [clientsRes, profilesRes] = await Promise.all([
        supabase.from('k24_clients').select('id, name').order('name'),
        supabase.from('k24_profiles').select('id, display_name, role').order('display_name'),
      ])
      setClients(clientsRes.data || [])
      setProfiles(profilesRes.data || [])
    }
    fetchLists()
  }, [])

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const updates = {
        order_type: form.order_type || null,
        width_mm: form.width_mm ? Number(form.width_mm) : null,
        height_mm: form.height_mm ? Number(form.height_mm) : null,
        qty: form.qty ? Number(form.qty) : null,
        need_lam: form.need_lam,
        lam_type: form.need_lam ? form.lam_type : null,
        design_variants: form.design_variants ? Number(form.design_variants) : null,
        deadline: form.deadline || null,
        priority: form.priority,
        notes: form.notes || null,
        client_id: form.client_id || null,
        assigned_to: form.assigned_to || null,
        status: form.status,
        bopp_bag: form.bopp_bag,
        price_final: form.price_final ? Number(form.price_final) : null,
        cost_materials: form.cost_materials ? Number(form.cost_materials) : null,
        cost_labor: form.cost_labor ? Number(form.cost_labor) : null,
        cost_total: form.cost_total ? Number(form.cost_total) : null,
        price_per_unit: form.price_per_unit ? Number(form.price_per_unit) : null,
        markup: form.markup ? Number(form.markup) : null,
        discount_pct: form.discount_pct ? Number(form.discount_pct) : null,
        printed_meters: form.printed_meters ? Number(form.printed_meters) : null,
        resin_used: form.resin_used ? Number(form.resin_used) : null,
        rejected_qty: form.rejected_qty ? Number(form.rejected_qty) : null,
        printed_qty: form.printed_qty ? Number(form.printed_qty) : null,
      }

      await updateOrder(order.id, updates)
      toast.success('Заказ обновлён')
      onSaved()
    } catch (err) {
      toast.error('Ошибка: ' + (err.message || 'Не удалось сохранить'))
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/50'
  const labelClass = 'block text-xs text-text-muted uppercase mb-1'

  return (
    <div className="bg-surface rounded-xl border-2 border-accent/30 p-5 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
          </svg>
          Режим редактирования
        </h2>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Отмена
          </Button>
          <Button size="sm" onClick={handleSave} loading={saving}>
            Сохранить
          </Button>
        </div>
      </div>

      {/* Basic info */}
      <div>
        <h3 className="font-medium text-sm mb-3 text-text-muted">Основная информация</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <div>
            <label className={labelClass}>Тип заказа</label>
            <select
              value={form.order_type}
              onChange={(e) => update('order_type', e.target.value)}
              className={inputClass}
            >
              <option value="">—</option>
              {Object.entries(ORDER_TYPES).map(([key, t]) => (
                <option key={key} value={key}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Ширина (мм)</label>
            <input
              type="number"
              value={form.width_mm}
              onChange={(e) => update('width_mm', e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Высота (мм)</label>
            <input
              type="number"
              value={form.height_mm}
              onChange={(e) => update('height_mm', e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Тираж (шт)</label>
            <input
              type="number"
              value={form.qty}
              onChange={(e) => update('qty', e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Кол-во видов</label>
            <input
              type="number"
              value={form.design_variants}
              onChange={(e) => update('design_variants', e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Ламинация</label>
            <div className="flex items-center gap-3 h-[38px]">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.need_lam}
                  onChange={(e) => update('need_lam', e.target.checked)}
                  className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                />
                <span className="text-sm">Да</span>
              </label>
              {form.need_lam && (
                <select
                  value={form.lam_type}
                  onChange={(e) => update('lam_type', e.target.value)}
                  className="border border-border rounded px-2 py-1 text-sm bg-surface"
                >
                  <option value="glossy">Глянцевая</option>
                  <option value="matte">Матовая</option>
                </select>
              )}
            </div>
          </div>

          <div>
            <label className={labelClass}>БОПП пакет</label>
            <label className="flex items-center gap-2 cursor-pointer h-[38px]">
              <input
                type="checkbox"
                checked={form.bopp_bag}
                onChange={(e) => update('bopp_bag', e.target.checked)}
                className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
              />
              <span className="text-sm">Да</span>
            </label>
          </div>

          <div>
            <label className={labelClass}>Срок сдачи</label>
            <input
              type="date"
              value={form.deadline}
              onChange={(e) => update('deadline', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Assignment & Status */}
      <div>
        <h3 className="font-medium text-sm mb-3 text-text-muted">Статус и назначение</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <div>
            <label className={labelClass}>Статус</label>
            <select
              value={form.status}
              onChange={(e) => update('status', e.target.value)}
              className={inputClass}
            >
              {Object.entries(ORDER_STATUSES).map(([key, s]) => (
                <option key={key} value={key}>{s.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Приоритет</label>
            <select
              value={form.priority}
              onChange={(e) => update('priority', e.target.value)}
              className={inputClass}
            >
              {Object.entries(PRIORITIES).map(([key, p]) => (
                <option key={key} value={key}>{p.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Клиент</label>
            <select
              value={form.client_id}
              onChange={(e) => update('client_id', e.target.value)}
              className={inputClass}
            >
              <option value="">— Не выбран —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Исполнитель</label>
            <select
              value={form.assigned_to}
              onChange={(e) => update('assigned_to', e.target.value)}
              className={inputClass}
            >
              <option value="">— Не назначен —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.display_name} ({p.role})</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Production data */}
      <div>
        <h3 className="font-medium text-sm mb-3 text-text-muted">Производственные данные</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className={labelClass}>Напечатано (м)</label>
            <input
              type="number"
              step="0.01"
              value={form.printed_meters}
              onChange={(e) => update('printed_meters', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Потрачено смеси</label>
            <input
              type="number"
              step="0.01"
              value={form.resin_used}
              onChange={(e) => update('resin_used', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Брак (шт)</label>
            <input
              type="number"
              value={form.rejected_qty}
              onChange={(e) => update('rejected_qty', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Напечатано (шт)</label>
            <input
              type="number"
              value={form.printed_qty}
              onChange={(e) => update('printed_qty', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Finance */}
      <div>
        <h3 className="font-medium text-sm mb-3 text-text-muted">Финансы</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className={labelClass}>Итого (руб)</label>
            <input
              type="number"
              value={form.price_final}
              onChange={(e) => update('price_final', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Материалы</label>
            <input
              type="number"
              value={form.cost_materials}
              onChange={(e) => update('cost_materials', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Труд</label>
            <input
              type="number"
              value={form.cost_labor}
              onChange={(e) => update('cost_labor', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Себестоимость</label>
            <input
              type="number"
              value={form.cost_total}
              onChange={(e) => update('cost_total', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>За штуку</label>
            <input
              type="number"
              value={form.price_per_unit}
              onChange={(e) => update('price_per_unit', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Наценка (x)</label>
            <input
              type="number"
              step="0.1"
              value={form.markup}
              onChange={(e) => update('markup', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Скидка (0-1)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={form.discount_pct}
              onChange={(e) => update('discount_pct', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <h3 className="font-medium text-sm mb-3 text-text-muted">Примечания</h3>
        <textarea
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
          rows={3}
          className={inputClass + ' resize-y'}
          placeholder="Заметки к заказу..."
        />
      </div>

      {/* Save bar */}
      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="secondary" onClick={onCancel}>
          Отмена
        </Button>
        <Button onClick={handleSave} loading={saving}>
          Сохранить изменения
        </Button>
      </div>
    </div>
  )
}
