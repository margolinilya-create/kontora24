import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createOrder } from '../hooks/useOrders'
import {
  ORDER_TYPES, PRIORITIES, LAMINATION_TYPES, FILM_TYPES,
  ORDER_SOURCES, PAYMENT_STATUSES, DELIVERY_TYPES, DESIGN_STATUSES, SIZE_PRESETS,
} from '@/shared/constants'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/stores/toast-store'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'

const SELECT_CLASS = 'w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm'

const schema = z.object({
  // Deal info
  deal_name: z.string().optional(),
  bitrix_deal_id: z.string().optional(),
  price_final: z.coerce.number().optional(),
  is_partner: z.boolean().default(false),
  source: z.string().optional(),
  source_referrer: z.string().optional(),
  payment_status: z.string().default('not_paid'),

  // Order info
  order_type: z.string().min(1, 'Выберите тип'),
  qty: z.coerce.number().min(1, 'Минимум 1'),
  width_mm: z.coerce.number().min(1, 'Укажите ширину'),
  height_mm: z.coerce.number().min(1, 'Укажите высоту'),
  film_type: z.string().default('G'),
  lam_type: z.string().optional(),
  design_variants: z.coerce.number().min(1).default(1),
  design_status: z.string().default('provided'),
  mockup_path: z.string().optional(),
  stickers_per_pack: z.coerce.number().optional(),
  client_name: z.string().optional(),
  deadline: z.string().optional(),
  priority: z.string().default('normal'),
  notes: z.string().optional(),

  // Delivery
  delivery_type: z.string().default('pickup'),
  delivery_city: z.string().optional(),
  delivery_address: z.string().optional(),
  delivery_notes: z.string().optional(),
})

export default function CreateOrderPage() {
  const navigate = useNavigate()
  const { hasRole } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const canSeeFinance = hasRole(['admin', 'manager'])

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      order_type: '', qty: 1, width_mm: 100, height_mm: 100,
      lam_type: '', priority: 'normal', design_variants: 1,
      film_type: 'G', is_partner: false, payment_status: 'not_paid',
      design_status: 'provided', delivery_type: 'pickup',
    },
  })

  const lamType = watch('lam_type')
  const needLam = lamType === 'matte' || lamType === 'glossy'
  const orderType = watch('order_type')
  const source = watch('source')
  const deliveryType = watch('delivery_type')
  const isStickerpack = orderType === 'stickerpack' || orderType === 'stickerpack3D'

  function applyPreset(key) {
    const preset = SIZE_PRESETS[key]
    if (!preset) return
    setValue('width_mm', preset.width)
    setValue('height_mm', preset.height)
  }

  async function onSubmit(values) {
    setSubmitting(true)
    try {
      // Find or create client
      let clientId = null
      if (values.client_name?.trim()) {
        const { data: existing } = await supabase
          .from('k24_clients')
          .select('id')
          .eq('name', values.client_name.trim())
          .limit(1)
          .single()

        if (existing) {
          clientId = existing.id
        } else {
          const { data: newClient } = await supabase
            .from('k24_clients')
            .insert({ name: values.client_name.trim() })
            .select('id')
            .single()
          if (newClient) clientId = newClient.id
        }
      }

      const order = await createOrder({
        order_type: values.order_type,
        qty: values.qty,
        width_mm: values.width_mm,
        height_mm: values.height_mm,
        need_lam: needLam,
        lam_type: needLam ? values.lam_type : null,
        film_type: values.film_type,
        client_id: clientId,
        deadline: values.deadline || null,
        priority: values.priority,
        notes: values.notes || null,
        design_variants: values.design_variants,
        deal_name: values.deal_name || null,
        bitrix_deal_id: values.bitrix_deal_id || null,
        price_final: canSeeFinance && values.price_final ? values.price_final : null,
        is_partner: values.is_partner,
        source: values.source || null,
        source_referrer: values.source === 'referrer' ? (values.source_referrer || null) : null,
        payment_status: values.payment_status,
        design_status: values.design_status,
        mockup_path: values.mockup_path || null,
        stickers_per_pack: isStickerpack && values.stickers_per_pack ? values.stickers_per_pack : null,
        delivery_type: values.delivery_type,
        delivery_city: values.delivery_city || null,
        delivery_address: values.delivery_address || null,
        delivery_notes: values.delivery_notes || null,
      })

      toast.success(`Заказ ORD-${String(order.number).padStart(4, '0')} создан`)
      navigate(`/orders/${order.id}`)
    } catch (err) {
      toast.error('Ошибка: ' + (err.message || 'Не удалось создать заказ'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Новый заказ</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

        {/* === По сделке === */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-text-muted uppercase tracking-wide">Сделка</legend>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Название сделки</label>
              <Input type="text" placeholder="Название заказа" {...register('deal_name')} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Номер сделки (Bitrix)</label>
              <Input type="text" placeholder="ID сделки" {...register('bitrix_deal_id')} />
            </div>
          </div>

          {canSeeFinance && (
            <div>
              <label className="block text-sm font-medium mb-1">Стоимость (бюджет), руб.</label>
              <Input type="number" step="0.01" placeholder="0" {...register('price_final')} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Тип заказа</label>
              <div className="flex items-center gap-3 h-[42px]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" {...register('is_partner')} className="w-4 h-4 rounded border-border text-accent focus:ring-accent" />
                  <span className="text-sm">Партнёрский (-35%)</span>
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Источник</label>
              <select {...register('source')} className={SELECT_CLASS}>
                <option value="">— Не указан —</option>
                {Object.entries(ORDER_SOURCES).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {source === 'referrer' && (
            <div>
              <label className="block text-sm font-medium mb-1">Имя референта</label>
              <Input type="text" placeholder="Кто привёл клиента" {...register('source_referrer')} />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Оплата</label>
            <select {...register('payment_status')} className={SELECT_CLASS}>
              {Object.entries(PAYMENT_STATUSES).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
        </fieldset>

        <hr className="border-border" />

        {/* === По заказу === */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-text-muted uppercase tracking-wide">Заказ</legend>

          {/* Order type */}
          <div>
            <label className="block text-sm font-medium mb-1">Тип продукции *</label>
            <select {...register('order_type')} className={SELECT_CLASS}>
              <option value="">Выберите тип</option>
              {Object.entries(ORDER_TYPES).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            {errors.order_type && <p className="text-red-400 text-xs mt-1">{errors.order_type.message}</p>}
          </div>

          {/* Film type */}
          <div>
            <label className="block text-sm font-medium mb-1">Материал (плёнка)</label>
            <select {...register('film_type')} className={SELECT_CLASS}>
              {Object.entries(FILM_TYPES).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* Dimensions + quick sizes */}
          <div>
            <label className="block text-sm font-medium mb-1">Размер, мм *</label>
            <div className="flex gap-2 mb-2">
              {Object.entries(SIZE_PRESETS).map(([key, { label }]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyPreset(key)}
                  className="px-3 py-1 text-xs rounded-md border border-border bg-surface hover:bg-hover transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Input type="number" placeholder="Ширина" {...register('width_mm')} />
                {errors.width_mm && <p className="text-red-400 text-xs mt-1">{errors.width_mm.message}</p>}
              </div>
              <div>
                <Input type="number" placeholder="Высота" {...register('height_mm')} />
                {errors.height_mm && <p className="text-red-400 text-xs mt-1">{errors.height_mm.message}</p>}
              </div>
            </div>
          </div>

          {/* Qty */}
          <div>
            <label className="block text-sm font-medium mb-1">Тираж, шт *</label>
            <Input type="number" {...register('qty')} />
            {errors.qty && <p className="text-red-400 text-xs mt-1">{errors.qty.message}</p>}
          </div>

          {/* Stickers per pack (conditional) */}
          {isStickerpack && (
            <div>
              <label className="block text-sm font-medium mb-1">Стикеров в паке</label>
              <Input type="number" min="1" {...register('stickers_per_pack')} />
            </div>
          )}

          {/* Design variants */}
          <div>
            <label className="block text-sm font-medium mb-1">Видов дизайна</label>
            <Input type="number" min="1" {...register('design_variants')} />
          </div>

          {/* Lamination */}
          <div>
            <label className="block text-sm font-medium mb-1">Ламинация</label>
            <select {...register('lam_type')} className={SELECT_CLASS}>
              <option value="">Без ламинации</option>
              {Object.entries(LAMINATION_TYPES).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* Design status */}
          <div>
            <label className="block text-sm font-medium mb-1">Дизайн макета</label>
            <select {...register('design_status')} className={SELECT_CLASS}>
              {Object.entries(DESIGN_STATUSES).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* Mockup link */}
          <div>
            <label className="block text-sm font-medium mb-1">Ссылка на макет</label>
            <Input type="text" placeholder="Путь к файлу на сервере" {...register('mockup_path')} />
          </div>

          {/* Client */}
          <div>
            <label className="block text-sm font-medium mb-1">Заказчик</label>
            <Input type="text" placeholder="Имя клиента" {...register('client_name')} />
          </div>

          {/* Deadline */}
          <div>
            <label className="block text-sm font-medium mb-1">Срок сдачи</label>
            <Input type="date" {...register('deadline')} />
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium mb-1">Приоритет</label>
            <select {...register('priority')} className={SELECT_CLASS}>
              {Object.entries(PRIORITIES).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium mb-1">Комментарий</label>
            <textarea
              {...register('notes')}
              rows={3}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm resize-none"
              placeholder="Особенности заказа, доп. услуги..."
            />
          </div>
        </fieldset>

        <hr className="border-border" />

        {/* === Отгрузка === */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-text-muted uppercase tracking-wide">Отгрузка</legend>

          <div>
            <label className="block text-sm font-medium mb-1">Получение</label>
            <select {...register('delivery_type')} className={SELECT_CLASS}>
              {Object.entries(DELIVERY_TYPES).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {deliveryType === 'delivery' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Город</label>
                  <Input type="text" placeholder="Город отгрузки" {...register('delivery_city')} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Адрес</label>
                  <Input type="text" placeholder="Адрес доставки" {...register('delivery_address')} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Комментарий к доставке</label>
                <textarea
                  {...register('delivery_notes')}
                  rows={2}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm resize-none"
                  placeholder="Детали доставки..."
                />
              </div>
            </>
          )}
        </fieldset>

        {/* Submit */}
        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={submitting}>Создать заказ</Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/orders')}>Отмена</Button>
        </div>
      </form>
    </div>
  )
}
