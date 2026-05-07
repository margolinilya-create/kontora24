import { useState, useEffect } from 'react'
import { updateOrder } from '../hooks/useOrders'
import { OrderBasicFields } from './editor/OrderBasicFields'
import { OrderStatusFields } from './editor/OrderStatusFields'
import { OrderProductionFields } from './editor/OrderProductionFields'
import { OrderFinanceFields } from './editor/OrderFinanceFields'
import { supabase } from '@/shared/lib/supabase'
import Button from '@/shared/components/Button'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { captureError } from '@/shared/lib/sentry'

const INPUT_CLASS = 'w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/50'
const LABEL_CLASS = 'block text-xs text-text-muted uppercase mb-1'

export function AdminOrderEditor({ order, onSaved, onCancel }) {
  const [form, setForm] = useState({})
  const [clients, setClients] = useState([])
  const [profiles, setProfiles] = useState([])
  const [listsError, setListsError] = useState(null)
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
      film_type: order.film_type || 'G',
      design_variants: order.design_variants || '',
      deadline: order.deadline ? order.deadline.split('T')[0] : '',
      priority: order.priority || 'normal',
      notes: order.notes || '',
      client_id: order.client_id || '',
      assigned_to: order.assigned_to || '',
      status: order.status || 'new',
      bopp_bag: order.bopp_bag || false,
      deal_name: order.deal_name || '',
      bitrix_deal_id: order.bitrix_deal_id || '',
      is_partner: order.is_partner || false,
      source: order.source || '',
      source_referrer: order.source_referrer || '',
      payment_status: order.payment_status || 'not_paid',
      design_status: order.design_status || 'provided',
      mockup_path: order.mockup_path || '',
      stickers_per_pack: order.stickers_per_pack || '',
      delivery_type: order.delivery_type || 'pickup',
      delivery_city: order.delivery_city || '',
      delivery_address: order.delivery_address || '',
      delivery_notes: order.delivery_notes || '',
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
      try {
        const [clientsRes, profilesRes] = await Promise.all([
          supabase.from('k24_clients').select('id, name').order('name'),
          supabase.from('k24_profiles').select('id, display_name, role').order('display_name'),
        ])
        if (clientsRes.error) throw clientsRes.error
        if (profilesRes.error) throw profilesRes.error
        setClients(clientsRes.data || [])
        setProfiles(profilesRes.data || [])
        setListsError(null)
      } catch (err) {
        captureError(err, { tags: { source: 'AdminOrderEditor.fetchLists' } })
        setListsError(err)
        setClients([])
        setProfiles([])
      }
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
        film_type: form.film_type || null,
        design_variants: form.design_variants ? Number(form.design_variants) : null,
        deadline: form.deadline || null,
        priority: form.priority,
        notes: form.notes || null,
        client_id: form.client_id || null,
        assigned_to: form.assigned_to || null,
        status: form.status,
        bopp_bag: form.bopp_bag,
        deal_name: form.deal_name || null,
        bitrix_deal_id: form.bitrix_deal_id || null,
        is_partner: form.is_partner,
        source: form.source || null,
        source_referrer: form.source === 'referrer' ? (form.source_referrer || null) : null,
        payment_status: form.payment_status || 'not_paid',
        design_status: form.design_status || null,
        mockup_path: form.mockup_path || null,
        stickers_per_pack: form.stickers_per_pack ? Number(form.stickers_per_pack) : null,
        delivery_type: form.delivery_type || 'pickup',
        delivery_city: form.delivery_city || null,
        delivery_address: form.delivery_address || null,
        delivery_notes: form.delivery_notes || null,
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
      captureError(err, { tags: { source: 'AdminOrderEditor.save' }, extra: { orderId: order.id } })
      toast.error(translateError(err).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-surface rounded-xl border-2 border-accent/30 p-5 space-y-6">
      {listsError && (
        <div role="alert" className="bg-danger/10 border border-danger/30 text-danger rounded-lg px-3 py-2 text-sm">
          Не удалось загрузить списки клиентов и исполнителей. Изменения этих полей могут быть недоступны.
        </div>
      )}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
          </svg>
          Режим редактирования
        </h2>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>Отмена</Button>
          <Button size="sm" onClick={handleSave} loading={saving}>Сохранить</Button>
        </div>
      </div>

      <OrderBasicFields form={form} update={update} inputClass={INPUT_CLASS} labelClass={LABEL_CLASS} />
      <OrderStatusFields form={form} update={update} clients={clients} profiles={profiles} inputClass={INPUT_CLASS} labelClass={LABEL_CLASS} />
      <OrderProductionFields form={form} update={update} inputClass={INPUT_CLASS} labelClass={LABEL_CLASS} />
      <OrderFinanceFields form={form} update={update} inputClass={INPUT_CLASS} labelClass={LABEL_CLASS} />

      <div>
        <h3 className="font-medium text-sm mb-3 text-text-muted">Примечания</h3>
        <textarea
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
          rows={3}
          className={INPUT_CLASS + ' resize-y'}
          placeholder="Заметки к заказу..."
        />
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="secondary" onClick={onCancel}>Отмена</Button>
        <Button onClick={handleSave} loading={saving}>Сохранить изменения</Button>
      </div>
    </div>
  )
}
