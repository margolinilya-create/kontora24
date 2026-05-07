import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createOrder } from '../hooks/useOrders'
import {
  ORDER_TYPES, LAMINATION_TYPES, FILM_TYPES,
  ORDER_SOURCES, PAYMENT_STATUSES, DELIVERY_TYPES, DESIGN_STATUSES, SIZE_PRESETS,
} from '@/shared/constants'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'

const SELECT_CLASS = 'w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm min-h-[44px]'
const IMAGE_RX = /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i

function FieldError({ error }) {
  if (!error) return null
  return <p className="text-danger text-xs mt-1 font-medium">{error.message}</p>
}

function OrderTypeSelector({ value, onChange, error }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2">Тип продукции <span className="text-danger">*</span></label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {Object.entries(ORDER_TYPES).map(([key, { label }]) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`text-left px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all min-h-[48px] ${
              value === key
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border bg-surface hover:border-accent/30 text-text'
            } ${error && !value ? 'border-danger/50' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>
      <FieldError error={error} />
    </div>
  )
}

function SizePresetPicker({ activePreset, onSelect, isPack }) {
  // Для стикерпаков квадратные пресеты не имеют смысла (размер всего пака)
  const presets = Object.entries(SIZE_PRESETS).filter(([, p]) => isPack ? p.kind !== 'square' : true)
  return (
    <div className="flex gap-1.5 flex-wrap">
      {presets.map(([key, { label, width, height, kind }]) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          className={`px-3 py-2 text-xs rounded-lg font-medium transition-all min-h-[40px] ${
            activePreset === key
              ? 'bg-accent text-on-accent'
              : 'border border-border bg-surface hover:bg-surface-dim text-text-muted'
          }`}
        >
          {kind === 'square' ? `${label}×${label}` : `${label} (${width}×${height})`}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`px-3 py-2 text-xs rounded-lg font-medium transition-all min-h-[40px] ${
          activePreset === null
            ? 'bg-accent text-on-accent'
            : 'border border-border bg-surface hover:bg-surface-dim text-text-muted'
        }`}
      >
        Свой
      </button>
    </div>
  )
}

const schema = z.object({
  // Deal
  deal_name: z.string().optional(),
  bitrix_deal_id: z.string().optional(),
  price_final: z.coerce.number().optional(),
  is_partner: z.boolean().default(false),
  source: z.string().optional(),
  source_referrer: z.string().optional(),
  payment_status: z.string().default('not_paid'),

  // Order
  order_type: z.string().min(1, 'Выберите тип'),
  qty: z.coerce.number().min(1, 'Минимум 1'),
  width_mm: z.coerce.number().min(1, 'Укажите ширину'),
  height_mm: z.coerce.number().min(1, 'Укажите высоту'),
  film_type: z.string().default('G'),
  lam_type: z.string().optional(),
  design_status: z.string().default('provided'),
  mockup_path: z.string().optional(),
  stickers_per_pack: z.coerce.number().optional(),
  client_name: z.string().optional(),
  deadline: z.string().optional(),
  is_urgent: z.boolean().default(false),
  notes: z.string().optional(),
  bopp_bag: z.boolean().default(false),

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
  const [activePreset, setActivePreset] = useState(null)
  const canSeeFinance = hasRole(['admin', 'manager'])

  const formRef = useRef(null)
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      order_type: '', qty: 1, width_mm: 100, height_mm: 100,
      lam_type: '', is_urgent: false, bopp_bag: false,
      film_type: 'G', is_partner: false, payment_status: 'not_paid',
      design_status: 'provided', delivery_type: 'pickup',
    },
  })

  const errorCount = Object.keys(errors).length

  const scrollToFirstError = useCallback(() => {
    setTimeout(() => {
      const firstError = formRef.current?.querySelector('[aria-invalid="true"], .border-danger')
      if (firstError) {
        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' })
        firstError.focus?.()
      }
    }, 100)
  }, [])

  const lamType = watch('lam_type')
  const needLam = lamType === 'matte' || lamType === 'glossy'
  const orderType = watch('order_type')
  const source = watch('source')
  const deliveryType = watch('delivery_type')
  const mockupPath = watch('mockup_path')
  const isStickerpack = orderType === 'stickerpack' || orderType === 'stickerpack3D'
  const isMockupImage = mockupPath && IMAGE_RX.test(mockupPath)

  // Smart defaults for 3D types
  useEffect(() => {
    if (orderType === 'sticker3D' || orderType === 'stickerpack3D') {
      setValue('film_type', 'G')
    }
  }, [orderType, setValue])

  function applyPreset(key) {
    if (key === null) {
      setActivePreset(null)
      return
    }
    const preset = SIZE_PRESETS[key]
    if (!preset) return
    setValue('width_mm', preset.width)
    setValue('height_mm', preset.height)
    setActivePreset(key)
  }

  async function onSubmit(values) {
    setSubmitting(true)
    try {
      // Find or create client
      let clientId = null
      if (values.client_name?.trim()) {
        const { data: existing, error: findError } = await supabase
          .from('k24_clients')
          .select('id')
          .eq('name', values.client_name.trim())
          .limit(1)
          .single()

        if (findError && findError.code !== 'PGRST116') throw findError

        if (existing) {
          clientId = existing.id
        } else {
          const { data: newClient, error: createError } = await supabase
            .from('k24_clients')
            .insert({ name: values.client_name.trim() })
            .select('id')
            .single()
          if (createError) throw createError
          clientId = newClient.id
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
        priority: values.is_urgent ? 'urgent' : 'normal',
        notes: values.notes || null,
        bopp_bag: values.bopp_bag,
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
      toast.error(translateError(err).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight">Новый заказ</h1>
          <p className="text-text-muted text-sm">Заполните параметры и создайте заказ</p>
        </div>
        <button
          type="button"
          disabled
          title="Bitrix24 пока не подключён"
          className="border border-border bg-surface text-text-muted/60 rounded-lg px-3 py-2 text-sm cursor-not-allowed"
        >
          Заполнить из Bitrix
        </button>
      </div>

      {/* Error summary */}
      {errorCount > 0 && (
        <div className="bg-danger/10 border border-danger/30 text-danger rounded-xl p-4 text-sm mb-6" role="alert">
          <p className="font-medium">Заполните обязательные поля ({errorCount})</p>
          <ul className="mt-1 list-disc list-inside text-xs">
            {Object.entries(errors).map(([key, err]) => (
              <li key={key}>{err.message}</li>
            ))}
          </ul>
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit(onSubmit, scrollToFirstError)} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* === LEFT: Основное + Дополнительное === */}
        <div className="bg-surface rounded-2xl border border-border shadow-card p-5 space-y-5">
          {/* Основное */}
          <div className="space-y-4">
            <OrderTypeSelector
              value={orderType}
              onChange={(val) => setValue('order_type', val, { shouldValidate: true })}
              error={errors.order_type}
            />

            {/* Размер */}
            <div>
              <label className="block text-sm font-medium mb-2">Размер, мм <span className="text-danger">*</span></label>
              <SizePresetPicker activePreset={activePreset} onSelect={applyPreset} isPack={isStickerpack} />
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <Input type="number" placeholder="Ширина" inputMode="numeric" aria-invalid={!!errors.width_mm} className={errors.width_mm ? 'border-danger ring-1 ring-danger/30' : ''} {...register('width_mm', { onChange: () => setActivePreset(null) })} />
                  <FieldError error={errors.width_mm} />
                </div>
                <div>
                  <Input type="number" placeholder="Высота" inputMode="numeric" aria-invalid={!!errors.height_mm} className={errors.height_mm ? 'border-danger ring-1 ring-danger/30' : ''} {...register('height_mm', { onChange: () => setActivePreset(null) })} />
                  <FieldError error={errors.height_mm} />
                </div>
              </div>
            </div>

            {/* Тираж + Дедлайн */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Тираж, шт <span className="text-danger">*</span></label>
                <Input type="number" inputMode="numeric" aria-invalid={!!errors.qty} className={errors.qty ? 'border-danger ring-1 ring-danger/30' : ''} {...register('qty')} />
                <FieldError error={errors.qty} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Срок сдачи</label>
                <Input type="date" {...register('deadline')} />
              </div>
            </div>

            {/* Стикеров в паке (только для пака) */}
            {isStickerpack && (
              <div>
                <label className="block text-sm font-medium mb-1">Стикеров в паке</label>
                <Input type="number" inputMode="numeric" min="1" {...register('stickers_per_pack')} />
              </div>
            )}

            {/* Плёнка + Ламинация */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Плёнка</label>
                <select {...register('film_type')} className={SELECT_CLASS}>
                  {Object.entries(FILM_TYPES).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Ламинация</label>
                <select {...register('lam_type')} className={SELECT_CLASS}>
                  <option value="">Без ламинации</option>
                  {Object.entries(LAMINATION_TYPES).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Заказчик + Срочность */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Заказчик</label>
                <Input type="text" placeholder="Имя клиента" {...register('client_name')} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Срочность</label>
                <label className="flex items-center gap-2 min-h-[44px] px-3 rounded-lg border border-border cursor-pointer hover:bg-surface-2">
                  <input type="checkbox" {...register('is_urgent')} className="w-5 h-5 rounded border-border text-accent focus:ring-accent accent-danger" />
                  <span className="text-sm">Срочный заказ</span>
                </label>
              </div>
            </div>

            {/* БОПП + Дизайн макета */}
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 min-h-[44px] px-3 rounded-lg border border-border cursor-pointer hover:bg-surface-2">
                <input type="checkbox" {...register('bopp_bag')} className="w-5 h-5 rounded border-border text-accent focus:ring-accent" />
                <span className="text-sm">Упаковка в БОПП-пакет</span>
              </label>
              <div>
                <label className="block text-sm font-medium mb-1">Дизайн макета</label>
                <select {...register('design_status')} className={SELECT_CLASS}>
                  {Object.entries(DESIGN_STATUSES).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <hr className="border-border" />

          {/* Дополнительное */}
          <div className="space-y-4">
            <h2 className="text-xs uppercase tracking-wide text-text-muted">Дополнительно</h2>

            {/* Сделка */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Название сделки</label>
                <Input type="text" placeholder="Название заказа" {...register('deal_name')} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Bitrix ID</label>
                <Input type="text" placeholder="ID сделки" {...register('bitrix_deal_id')} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Источник</label>
                <select {...register('source')} className={SELECT_CLASS}>
                  <option value="">— не указан —</option>
                  {Object.entries(ORDER_SOURCES).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Оплата</label>
                <select {...register('payment_status')} className={SELECT_CLASS}>
                  {Object.entries(PAYMENT_STATUSES).map(([key, { label }]) => (
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

            <label className="flex items-center gap-2 min-h-[44px] px-3 rounded-lg border border-border cursor-pointer hover:bg-surface-2">
              <input type="checkbox" {...register('is_partner')} className="w-5 h-5 rounded border-border text-accent focus:ring-accent" />
              <span className="text-sm">Партнёрский (-35%)</span>
            </label>

            {/* Отгрузка */}
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
                <div className="grid grid-cols-2 gap-3">
                  <Input type="text" placeholder="Город" {...register('delivery_city')} />
                  <Input type="text" placeholder="Адрес" {...register('delivery_address')} />
                </div>
                <textarea
                  {...register('delivery_notes')}
                  rows={2}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm resize-none"
                  placeholder="Комментарий к доставке..."
                />
              </>
            )}
          </div>
        </div>

        {/* === RIGHT: Цена + Макет + Комментарий === */}
        <div className="space-y-4">
          {canSeeFinance && (
            <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
              <label className="block text-sm font-medium mb-1">Стоимость (бюджет), руб.</label>
              <Input type="number" step="0.01" placeholder="0" {...register('price_final')} />
            </div>
          )}

          <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
            <label className="block text-sm font-medium mb-2">Ссылка на макет</label>
            <Input type="text" placeholder="https://... или путь на сервере" {...register('mockup_path')} />
            <div className="mt-3">
              {isMockupImage ? (
                <img
                  src={mockupPath}
                  alt="Превью макета"
                  loading="lazy"
                  className="w-full max-h-[280px] object-contain rounded-xl border border-border bg-surface-dim"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              ) : mockupPath ? (
                <p className="text-xs text-text-muted">Ссылка не на изображение — будет открыта по клику в карточке.</p>
              ) : (
                <div className="h-[180px] flex items-center justify-center text-text-muted text-sm bg-surface-dim rounded-xl border border-dashed border-border">
                  Превью появится при вводе ссылки на JPEG/PNG
                </div>
              )}
            </div>
          </div>

          <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
            <label className="block text-sm font-medium mb-1">Комментарий заказчика</label>
            <textarea
              {...register('notes')}
              rows={5}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm resize-none"
              placeholder="Особенности заказа, доп. услуги..."
            />
          </div>
        </div>

        {/* Submit — sticky on mobile, spans both columns */}
        <div className="lg:col-span-2 flex gap-3 pt-2 sticky bottom-0 bg-surface-dim/80 backdrop-blur-sm py-4 -mx-4 px-4 sm:static sm:bg-transparent sm:backdrop-blur-none sm:py-0 sm:mx-0 sm:px-0">
          <Button type="submit" loading={submitting} className="flex-1 sm:flex-none">Создать заказ</Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/orders')} className="flex-1 sm:flex-none">Отмена</Button>
        </div>
      </form>
    </div>
  )
}
