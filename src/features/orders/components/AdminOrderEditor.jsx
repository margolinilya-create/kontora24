import { useState, useEffect } from 'react'
import { updateOrder } from '../hooks/useOrders'
import { ClientCombobox } from '@/features/clients/components/ClientCombobox'
import { supabase } from '@/shared/lib/supabase'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { captureError } from '@/shared/lib/sentry'
import {
  ORDER_STATUSES, ORDER_TYPES, FILM_TYPES, LAMINATION_TYPES,
  DESIGN_STATUSES, ORDER_SOURCES, PAYMENT_STATUSES, DELIVERY_TYPES,
  PRIORITIES, SIZE_PRESETS,
} from '@/shared/constants'

const SECTION_TITLE = 'text-xs uppercase tracking-wide text-text-muted font-medium'
const FIELD_LABEL = 'block text-sm font-medium text-text mb-1.5'
const SELECT_CLASS = 'w-full rounded-xl border border-border bg-surface text-text px-3.5 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent/60 focus:border-accent transition-colors'
const CHECKBOX_BOX = 'flex items-center gap-2 min-h-[44px] px-3 rounded-xl border border-border cursor-pointer hover:bg-surface-2 transition-colors'

function Field({ label, children, className = '' }) {
  return (
    <div className={className}>
      <label className={FIELD_LABEL}>{label}</label>
      {children}
    </div>
  )
}

export function AdminOrderEditor({ order, onSaved, onCancel }) {
  const [form, setForm] = useState({})
  const [profiles, setProfiles] = useState([])
  const [profilesError, setProfilesError] = useState(null)
  const [currentClient, setCurrentClient] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!order) return
    setForm({
      order_type: order.order_type || '',
      width_mm: order.width_mm ?? '',
      height_mm: order.height_mm ?? '',
      qty: order.qty ?? '',
      need_lam: !!order.need_lam,
      lam_type: order.lam_type || 'glossy',
      film_type: order.film_type || 'G',
      film_type_stickers: order.film_type_stickers || order.film_type || 'G',
      custom_number: order.custom_number || '',
      design_variants: order.design_variants ?? '',
      deadline: order.deadline ? order.deadline.split('T')[0] : '',
      priority: order.priority || 'normal',
      notes: order.notes || '',
      client_id: order.client_id || '',
      assigned_to: order.assigned_to || '',
      status: order.status || 'new',
      bopp_bag: !!order.bopp_bag,
      is_urgent: !!order.is_urgent,
      needs_montage_film: !!order.needs_montage_film,
      needs_individual_cut: !!order.needs_individual_cut,
      deal_name: order.deal_name || '',
      bitrix_deal_id: order.bitrix_deal_id || '',
      is_partner: !!order.is_partner,
      source: order.source || '',
      source_referrer: order.source_referrer || '',
      payment_status: order.payment_status || 'not_paid',
      design_status: order.design_status || 'provided',
      mockup_path: order.mockup_path || '',
      stickers_per_pack: order.stickers_per_pack ?? '',
      delivery_type: order.delivery_type || 'pickup',
      delivery_city: order.delivery_city || '',
      delivery_address: order.delivery_address || '',
      delivery_notes: order.delivery_notes || '',
      price_final: order.price_final ?? '',
      cost_materials: order.cost_materials ?? '',
      cost_labor: order.cost_labor ?? '',
      cost_total: order.cost_total ?? '',
      price_per_unit: order.price_per_unit ?? '',
      markup: order.markup ?? '',
      discount_pct: order.discount_pct ?? '',
      printed_meters: order.printed_meters ?? '',
      resin_used: order.resin_used ?? '',
      rejected_qty: order.rejected_qty ?? '',
      printed_qty: order.printed_qty ?? '',
    })
    setCurrentClient(order.client || null)
  }, [order])

  useEffect(() => {
    let cancelled = false
    async function fetchProfiles() {
      try {
        const { data, error } = await supabase
          .from('k24_profiles')
          .select('id, display_name, role')
          .order('display_name')
        if (cancelled) return
        if (error) throw error
        setProfiles(data || [])
      } catch (err) {
        captureError(err, { tags: { source: 'AdminOrderEditor.fetchProfiles' } })
        if (!cancelled) setProfilesError(err)
      }
    }
    fetchProfiles()
    return () => { cancelled = true }
  }, [])

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleClientChange(clientId, client) {
    setCurrentClient(client)
    update('client_id', clientId || '')
  }

  function applyPreset(key) {
    const preset = SIZE_PRESETS[key]
    if (!preset) return
    update('width_mm', preset.width)
    update('height_mm', preset.height)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const updates = {
        order_type: form.order_type || null,
        width_mm: form.width_mm !== '' ? Number(form.width_mm) : null,
        height_mm: form.height_mm !== '' ? Number(form.height_mm) : null,
        qty: form.qty !== '' ? Number(form.qty) : null,
        need_lam: form.need_lam,
        lam_type: form.need_lam ? form.lam_type : null,
        film_type: form.film_type || null,
        film_type_stickers: form.order_type === 'stickerpack3D'
          ? (form.film_type_stickers || form.film_type || null)
          : null,
        custom_number: form.custom_number?.trim() || null,
        design_variants: form.design_variants !== '' ? Number(form.design_variants) : null,
        deadline: form.deadline || null,
        priority: form.priority,
        notes: form.notes || null,
        client_id: form.client_id || null,
        assigned_to: form.assigned_to || null,
        status: form.status,
        bopp_bag: form.bopp_bag,
        is_urgent: form.is_urgent,
        needs_montage_film: form.needs_montage_film,
        needs_individual_cut: form.needs_individual_cut,
        deal_name: form.deal_name || null,
        bitrix_deal_id: form.bitrix_deal_id || null,
        is_partner: form.is_partner,
        source: form.source || null,
        source_referrer: form.source === 'referrer' ? (form.source_referrer || null) : null,
        payment_status: form.payment_status || 'not_paid',
        design_status: form.design_status || null,
        mockup_path: form.mockup_path || null,
        stickers_per_pack: form.stickers_per_pack !== '' ? Number(form.stickers_per_pack) : null,
        delivery_type: form.delivery_type || 'pickup',
        delivery_city: form.delivery_city || null,
        delivery_address: form.delivery_address || null,
        delivery_notes: form.delivery_notes || null,
        price_final: form.price_final !== '' ? Number(form.price_final) : null,
        cost_materials: form.cost_materials !== '' ? Number(form.cost_materials) : null,
        cost_labor: form.cost_labor !== '' ? Number(form.cost_labor) : null,
        cost_total: form.cost_total !== '' ? Number(form.cost_total) : null,
        price_per_unit: form.price_per_unit !== '' ? Number(form.price_per_unit) : null,
        markup: form.markup !== '' ? Number(form.markup) : null,
        discount_pct: form.discount_pct !== '' ? Number(form.discount_pct) : null,
        printed_meters: form.printed_meters !== '' ? Number(form.printed_meters) : null,
        resin_used: form.resin_used !== '' ? Number(form.resin_used) : null,
        rejected_qty: form.rejected_qty !== '' ? Number(form.rejected_qty) : null,
        printed_qty: form.printed_qty !== '' ? Number(form.printed_qty) : null,
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

  const isStickerpack = form.order_type === 'stickerpack' || form.order_type === 'stickerpack3D'
  const isStickerpack3D = form.order_type === 'stickerpack3D'

  // 3D-стикерпак → BOPP обязателен
  useEffect(() => {
    if (isStickerpack3D && !form.bopp_bag) {
      setForm((prev) => ({ ...prev, bopp_bag: true }))
    }
  }, [isStickerpack3D, form.bopp_bag])

  return (
    <div className="space-y-6">
      {profilesError && (
        <div role="alert" className="bg-warning/10 border border-warning/30 text-text rounded-xl px-3 py-2 text-sm">
          Не удалось загрузить список исполнителей. Поле «Исполнитель» может быть недоступно.
        </div>
      )}

      {/* === Сделка === */}
      <section className="space-y-4">
        <h3 className={SECTION_TITLE}>Сделка</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Название сделки" className="lg:col-span-2">
            <Input value={form.deal_name || ''} onChange={(e) => update('deal_name', e.target.value)} placeholder="Тематика заказа" />
          </Field>
          <Field label="Номер сделки (Bitrix)">
            <Input value={form.bitrix_deal_id || ''} onChange={(e) => update('bitrix_deal_id', e.target.value)} />
          </Field>
          <Field label="Срок сдачи">
            <Input type="date" value={form.deadline || ''} onChange={(e) => update('deadline', e.target.value)} />
          </Field>
          <Field label="Стоимость (бюджет), руб.">
            <Input type="number" step="0.01" value={form.price_final ?? ''} onChange={(e) => update('price_final', e.target.value)} />
          </Field>
          <Field label="Источник">
            <select value={form.source || ''} onChange={(e) => update('source', e.target.value)} className={SELECT_CLASS}>
              <option value="">— Не указан —</option>
              {Object.entries(ORDER_SOURCES).map(([k, { label }]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </Field>
          {form.source === 'referrer' && (
            <Field label="Имя референта">
              <Input value={form.source_referrer || ''} onChange={(e) => update('source_referrer', e.target.value)} />
            </Field>
          )}
          <Field label="Оплата">
            <select value={form.payment_status || 'not_paid'} onChange={(e) => update('payment_status', e.target.value)} className={SELECT_CLASS}>
              {Object.entries(PAYMENT_STATUSES).map(([k, { label }]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <label className={CHECKBOX_BOX + ' w-full'}>
              <input type="checkbox" checked={!!form.is_partner} onChange={(e) => update('is_partner', e.target.checked)} className="w-5 h-5 rounded border-border text-accent focus:ring-accent" />
              <span className="text-sm">Партнёрский (-25%)</span>
            </label>
          </div>
        </div>
      </section>

      <hr className="border-border" />

      {/* === Заказчик и назначение === */}
      <section className="space-y-4">
        <h3 className={SECTION_TITLE}>Заказчик и назначение</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="Клиент" className="sm:col-span-2">
            <ClientCombobox
              currentClient={currentClient}
              onChange={handleClientChange}
            />
          </Field>
          <Field label="Исполнитель">
            <select value={form.assigned_to || ''} onChange={(e) => update('assigned_to', e.target.value)} className={SELECT_CLASS}>
              <option value="">— Не назначен —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.display_name} ({p.role})</option>
              ))}
            </select>
          </Field>
          <Field label="Приоритет">
            <select value={form.priority || 'normal'} onChange={(e) => update('priority', e.target.value)} className={SELECT_CLASS}>
              {Object.entries(PRIORITIES).map(([k, { label }]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </Field>
          <Field label="Статус">
            <select value={form.status || 'new'} onChange={(e) => update('status', e.target.value)} className={SELECT_CLASS}>
              {Object.entries(ORDER_STATUSES).map(([k, { label }]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <hr className="border-border" />

      {/* === Продукт === */}
      <section className="space-y-4">
        <h3 className={SECTION_TITLE}>Продукт</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Тип заказа">
            <select value={form.order_type || ''} onChange={(e) => update('order_type', e.target.value)} className={SELECT_CLASS}>
              <option value="">—</option>
              {Object.entries(ORDER_TYPES).map(([k, { label }]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </Field>
          <Field label={isStickerpack3D ? 'Плёнка фонов' : 'Плёнка'}>
            <select value={form.film_type || 'G'} onChange={(e) => update('film_type', e.target.value)} className={SELECT_CLASS}>
              {Object.entries(FILM_TYPES).map(([k, { label }]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </Field>
          {isStickerpack3D && (
            <Field label="Плёнка стикеров">
              <select value={form.film_type_stickers || form.film_type || 'G'} onChange={(e) => update('film_type_stickers', e.target.value)} className={SELECT_CLASS}>
                {Object.entries(FILM_TYPES).map(([k, { label }]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Дизайн макета">
            <select value={form.design_status || 'provided'} onChange={(e) => update('design_status', e.target.value)} className={SELECT_CLASS}>
              {Object.entries(DESIGN_STATUSES).map(([k, { label }]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </Field>

          <div className="sm:col-span-2 lg:col-span-3">
            <label className={FIELD_LABEL}>Размер, мм</label>
            <div className="flex gap-1.5 flex-wrap mb-2">
              {Object.entries(SIZE_PRESETS).map(([k, { label, kind, width, height }]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => applyPreset(k)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-border bg-surface hover:bg-surface-2 transition-colors"
                >
                  {kind === 'square' ? `${label}×${label}` : `${label} (${width}×${height})`}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input type="number" placeholder="Ширина" value={form.width_mm ?? ''} onChange={(e) => update('width_mm', e.target.value)} />
              <Input type="number" placeholder="Высота" value={form.height_mm ?? ''} onChange={(e) => update('height_mm', e.target.value)} />
            </div>
          </div>

          <Field label="Тираж, шт">
            <Input type="number" value={form.qty ?? ''} onChange={(e) => update('qty', e.target.value)} />
          </Field>
          <Field label="Видов дизайна">
            <Input type="number" value={form.design_variants ?? ''} onChange={(e) => update('design_variants', e.target.value)} />
          </Field>
          {isStickerpack && (
            <Field label="Стикеров в паке">
              <Input type="number" value={form.stickers_per_pack ?? ''} onChange={(e) => update('stickers_per_pack', e.target.value)} />
            </Field>
          )}
          <Field label="Ламинация" className={isStickerpack ? '' : 'sm:col-span-2 lg:col-span-1'}>
            <div className="flex items-center gap-2 min-h-[44px]">
              <label className={CHECKBOX_BOX + ' flex-shrink-0'}>
                <input type="checkbox" checked={!!form.need_lam} onChange={(e) => update('need_lam', e.target.checked)} className="w-5 h-5 rounded border-border text-accent focus:ring-accent" />
                <span className="text-sm">Да</span>
              </label>
              {form.need_lam && (
                <select value={form.lam_type || 'glossy'} onChange={(e) => update('lam_type', e.target.value)} className={SELECT_CLASS}>
                  {Object.entries(LAMINATION_TYPES).map(([k, { label }]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </select>
              )}
            </div>
          </Field>
          <Field label="Ссылка на макет" className="sm:col-span-2 lg:col-span-3">
            <Input value={form.mockup_path || ''} onChange={(e) => update('mockup_path', e.target.value)} placeholder="https://… или путь на сервере" />
          </Field>

          <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <label className={CHECKBOX_BOX + (isStickerpack3D ? ' opacity-70 cursor-not-allowed' : '')}>
              <input
                type="checkbox"
                checked={!!form.bopp_bag}
                disabled={isStickerpack3D}
                onChange={(e) => update('bopp_bag', e.target.checked)}
                className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
              />
              <span className="text-sm">БОПП пакет{isStickerpack3D ? ' (обязательно)' : ''}</span>
            </label>
            <label className={CHECKBOX_BOX}>
              <input type="checkbox" checked={!!form.is_urgent} onChange={(e) => update('is_urgent', e.target.checked)} className="w-5 h-5 rounded border-border text-danger focus:ring-danger accent-danger" />
              <span className="text-sm">Срочный заказ</span>
            </label>
            <label className={CHECKBOX_BOX}>
              <input type="checkbox" checked={!!form.needs_montage_film} onChange={(e) => update('needs_montage_film', e.target.checked)} className="w-5 h-5 rounded border-border text-accent focus:ring-accent" />
              <span className="text-sm">Монтажная плёнка</span>
            </label>
            <label className={CHECKBOX_BOX}>
              <input type="checkbox" checked={!!form.needs_individual_cut} onChange={(e) => update('needs_individual_cut', e.target.checked)} className="w-5 h-5 rounded border-border text-accent focus:ring-accent" />
              <span className="text-sm">Индивидуальная резка</span>
            </label>
          </div>
        </div>
      </section>

      <hr className="border-border" />

      {/* === Отгрузка === */}
      <section className="space-y-4">
        <h3 className={SECTION_TITLE}>Отгрузка</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Получение">
            <select value={form.delivery_type || 'pickup'} onChange={(e) => update('delivery_type', e.target.value)} className={SELECT_CLASS}>
              {Object.entries(DELIVERY_TYPES).map(([k, { label }]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </Field>
          {form.delivery_type === 'delivery' && (
            <>
              <Field label="Город" className="sm:col-span-2 lg:col-span-2">
                <Input value={form.delivery_city || ''} onChange={(e) => update('delivery_city', e.target.value)} />
              </Field>
              <Field label="Адрес" className="sm:col-span-2 lg:col-span-3">
                <Input value={form.delivery_address || ''} onChange={(e) => update('delivery_address', e.target.value)} />
              </Field>
              <Field label="Комментарий к доставке" className="sm:col-span-2 lg:col-span-3">
                <Input value={form.delivery_notes || ''} onChange={(e) => update('delivery_notes', e.target.value)} />
              </Field>
            </>
          )}
        </div>
      </section>

      <hr className="border-border" />

      {/* === Производство (факт) === */}
      <section className="space-y-4">
        <h3 className={SECTION_TITLE}>Производство (факт)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Field label="Напечатано (м)">
            <Input type="number" step="0.01" value={form.printed_meters ?? ''} onChange={(e) => update('printed_meters', e.target.value)} />
          </Field>
          <Field label="Потрачено смолы (г)">
            <Input type="number" step="0.01" value={form.resin_used ?? ''} onChange={(e) => update('resin_used', e.target.value)} />
          </Field>
          <Field label="Напечатано (шт)">
            <Input type="number" value={form.printed_qty ?? ''} onChange={(e) => update('printed_qty', e.target.value)} />
          </Field>
          <Field label="Брак (шт)">
            <Input type="number" value={form.rejected_qty ?? ''} onChange={(e) => update('rejected_qty', e.target.value)} />
          </Field>
        </div>
      </section>

      <hr className="border-border" />

      {/* === Финансы === */}
      <section className="space-y-4">
        <h3 className={SECTION_TITLE}>Финансы (расчёт)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <Field label="Материалы">
            <Input type="number" step="0.01" value={form.cost_materials ?? ''} onChange={(e) => update('cost_materials', e.target.value)} />
          </Field>
          <Field label="Труд">
            <Input type="number" step="0.01" value={form.cost_labor ?? ''} onChange={(e) => update('cost_labor', e.target.value)} />
          </Field>
          <Field label="Себестоимость">
            <Input type="number" step="0.01" value={form.cost_total ?? ''} onChange={(e) => update('cost_total', e.target.value)} />
          </Field>
          <Field label="Цена за штуку">
            <Input type="number" step="0.01" value={form.price_per_unit ?? ''} onChange={(e) => update('price_per_unit', e.target.value)} />
          </Field>
          <Field label="Наценка (×)">
            <Input type="number" step="0.1" value={form.markup ?? ''} onChange={(e) => update('markup', e.target.value)} />
          </Field>
          <Field label="Скидка (0–1)">
            <Input type="number" step="0.01" min="0" max="1" value={form.discount_pct ?? ''} onChange={(e) => update('discount_pct', e.target.value)} />
          </Field>
        </div>
      </section>

      <hr className="border-border" />

      {/* === Примечания === */}
      <section className="space-y-4">
        <h3 className={SECTION_TITLE}>Примечания</h3>
        <textarea
          value={form.notes || ''}
          onChange={(e) => update('notes', e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-border bg-surface text-text px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/60 focus:border-accent transition-colors resize-y"
          placeholder="Заметки к заказу…"
        />
      </section>

      {/* Sticky footer */}
      <div className="sticky bottom-0 -mx-5 -mb-5 px-5 py-4 bg-surface border-t border-border flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Отмена</Button>
        <Button onClick={handleSave} loading={saving}>Сохранить</Button>
      </div>
    </div>
  )
}
