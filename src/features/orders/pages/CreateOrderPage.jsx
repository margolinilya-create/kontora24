import { useState, useRef, useCallback, useEffect } from 'react'
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

const SELECT_CLASS = 'w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm min-h-[44px]'

function CollapsibleSection({ title, defaultOpen = false, hasError = false, children }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <fieldset className={`border border-border rounded-xl overflow-hidden transition-colors ${hasError ? 'border-danger/50' : ''}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface-dim hover:bg-surface-dim/80 transition-colors min-h-[48px]"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold uppercase tracking-wide flex items-center gap-2">
          {title}
          {hasError && <span className="w-2 h-2 rounded-full bg-danger" aria-label="Есть ошибки" />}
        </span>
        <svg
          className={`w-4 h-4 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="p-4 space-y-4">
          {children}
        </div>
      )}
    </fieldset>
  )
}

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
            className={`text-left px-3 py-3 rounded-xl border-2 text-sm font-medium transition-all min-h-[56px] ${
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

function SizePresetPicker({ activePreset, onSelect }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {Object.entries(SIZE_PRESETS).map(([key, { label, width, height }]) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          className={`px-3 py-2 text-xs rounded-lg font-medium transition-all min-h-[40px] ${
            activePreset === key
              ? 'bg-accent text-white'
              : 'border border-border bg-surface hover:bg-surface-dim text-text-muted'
          }`}
        >
          {label} ({width}x{height})
        </button>
      ))}
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`px-3 py-2 text-xs rounded-lg font-medium transition-all min-h-[40px] ${
          activePreset === null
            ? 'bg-accent text-white'
            : 'border border-border bg-surface hover:bg-surface-dim text-text-muted'
        }`}
      >
        Свой
      </button>
    </div>
  )
}

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
  const [activePreset, setActivePreset] = useState(null)
  const canSeeFinance = hasRole(['admin', 'manager'])

  const formRef = useRef(null)
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      order_type: '', qty: 1, width_mm: 100, height_mm: 100,
      lam_type: '', priority: 'normal', design_variants: 1,
      film_type: 'G', is_partner: false, payment_status: 'not_paid',
      design_status: 'provided', delivery_type: 'pickup',
    },
  })

  const errorCount = Object.keys(errors).length
  const coreErrors = ['order_type', 'qty', 'width_mm', 'height_mm'].some(k => errors[k])
  const extraErrors = ['film_type', 'lam_type', 'design_variants', 'design_status', 'mockup_path', 'stickers_per_pack', 'notes'].some(k => errors[k])
  const dealErrors = ['deal_name', 'bitrix_deal_id', 'price_final', 'is_partner', 'source', 'source_referrer', 'payment_status'].some(k => errors[k])
  const deliveryErrors = ['delivery_type', 'delivery_city', 'delivery_address', 'delivery_notes'].some(k => errors[k])

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
  const isStickerpack = orderType === 'stickerpack' || orderType === 'stickerpack3D'

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

      <form ref={formRef} onSubmit={handleSubmit(onSubmit, scrollToFirstError)} className="space-y-4">

        {/* === Основное (always open) === */}
        <CollapsibleSection title="Основное" defaultOpen hasError={coreErrors}>
          {/* Order type — visual cards */}
          <OrderTypeSelector
            value={orderType}
            onChange={(val) => setValue('order_type', val, { shouldValidate: true })}
            error={errors.order_type}
          />

          {/* Size: presets + inputs */}
          <div>
            <label className="block text-sm font-medium mb-2">Размер, мм <span className="text-danger">*</span></label>
            <SizePresetPicker activePreset={activePreset} onSelect={applyPreset} />
            <div className="grid grid-cols-2 gap-4 mt-2">
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

          {/* Qty + Deadline */}
          <div className="grid grid-cols-2 gap-4">
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

          {/* Client + Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Заказчик</label>
              <Input type="text" placeholder="Имя клиента" {...register('client_name')} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Приоритет</label>
              <select {...register('priority')} className={SELECT_CLASS}>
                {Object.entries(PRIORITIES).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        </CollapsibleSection>

        {/* === Дополнительно (collapsed) === */}
        <CollapsibleSection title="Дополнительно" hasError={extraErrors}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Материал (плёнка)</label>
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Видов дизайна</label>
              <Input type="number" inputMode="numeric" min="1" {...register('design_variants')} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Дизайн макета</label>
              <select {...register('design_status')} className={SELECT_CLASS}>
                {Object.entries(DESIGN_STATUSES).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Ссылка на макет</label>
            <Input type="text" placeholder="Путь к файлу на сервере" {...register('mockup_path')} />
          </div>

          {isStickerpack && (
            <div>
              <label className="block text-sm font-medium mb-1">Стикеров в паке</label>
              <Input type="number" inputMode="numeric" min="1" {...register('stickers_per_pack')} />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Комментарий</label>
            <textarea
              {...register('notes')}
              rows={3}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm resize-none"
              placeholder="Особенности заказа, доп. услуги..."
            />
          </div>
        </CollapsibleSection>

        {/* === Сделка (collapsed) === */}
        <CollapsibleSection title="Сделка" hasError={dealErrors}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                <input type="checkbox" {...register('is_partner')} className="w-5 h-5 rounded border-border text-accent focus:ring-accent" />
                <span className="text-sm">Партнёрский (-35%)</span>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Источник</label>
              <select {...register('source')} className={SELECT_CLASS}>
                <option value="">-- Не указан --</option>
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
        </CollapsibleSection>

        {/* === Отгрузка (collapsed) === */}
        <CollapsibleSection title="Отгрузка" hasError={deliveryErrors}>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        </CollapsibleSection>

        {/* Submit — sticky on mobile */}
        <div className="flex gap-3 pt-2 sticky bottom-0 bg-surface-dim/80 backdrop-blur-sm py-4 -mx-4 px-4 sm:static sm:bg-transparent sm:backdrop-blur-none sm:py-0 sm:mx-0 sm:px-0">
          <Button type="submit" loading={submitting} className="flex-1 sm:flex-none">Создать заказ</Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/orders')} className="flex-1 sm:flex-none">Отмена</Button>
        </div>
      </form>
    </div>
  )
}
