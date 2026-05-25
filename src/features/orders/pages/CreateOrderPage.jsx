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
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'
import { findOrCreateClientByName } from '@/features/clients/hooks/useClients'
import { formatOrderNumber } from '@/shared/lib/utils'
import { uploadAttachment, validatePreviewFile } from '@/features/orders/lib/order-attachments'
import { captureError } from '@/shared/lib/sentry'
import { MaterialForecast } from '../components/MaterialForecast'

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
  price_final: z.coerce.number({ invalid_type_error: 'Укажите цену' }).positive('Цена должна быть больше 0'),
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
  film_type_stickers: z.string().optional().nullable(),
  lam_type: z.string().optional(),
  design_status: z.string().default('provided'),
  mockup_path: z.string().optional(),
  stickers_per_pack: z.coerce.number().optional(),
  client_name: z.string().trim().min(1, 'Укажите заказчика'),
  deadline: z.string().min(1, 'Укажите срок сдачи'),
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
  const { profile } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const [activePreset, setActivePreset] = useState(null)
  const [previewFile, setPreviewFile] = useState(null)
  const [previewBlobUrl, setPreviewBlobUrl] = useState(null)
  const [previewDragOver, setPreviewDragOver] = useState(false)
  const previewInputRef = useRef(null)
  const canSeeFinance = useCanDo('view:finance')

  function selectPreviewFile(file) {
    if (!file) return
    const err = validatePreviewFile(file)
    if (err) { toast.error(err); return }
    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl)
    setPreviewFile(file)
    setPreviewBlobUrl(URL.createObjectURL(file))
  }

  function clearPreviewFile(e) {
    e?.preventDefault?.()
    e?.stopPropagation?.()
    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl)
    setPreviewFile(null)
    setPreviewBlobUrl(null)
  }

  useEffect(() => () => { if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl) }, [previewBlobUrl])

  const formRef = useRef(null)
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      order_type: '', qty: 1, width_mm: 100, height_mm: 100,
      lam_type: '', is_urgent: false, bopp_bag: false,
      film_type: 'G', film_type_stickers: 'G',
      is_partner: false, payment_status: 'not_paid',
      design_status: 'provided', delivery_type: 'pickup',
      client_name: '',
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
  const widthMm = watch('width_mm')
  const heightMm = watch('height_mm')
  const qty = watch('qty')
  const filmType = watch('film_type')
  const boppBag = watch('bopp_bag')
  const isStickerpack = orderType === 'stickerpack' || orderType === 'stickerpack3D'
  const isStickerpack3D = orderType === 'stickerpack3D'
  const isMockupImage = mockupPath && IMAGE_RX.test(mockupPath)

  // Smart defaults: 3D-стикерпак → auto-BOPP; первый выбор 3D → плёнка G по дефолту.
  useEffect(() => {
    if (orderType === 'sticker3D' || orderType === 'stickerpack3D') {
      setValue('film_type', 'G')
    }
    if (orderType === 'stickerpack3D') {
      setValue('bopp_bag', true)
      setValue('film_type_stickers', 'G')
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
      // Свободный ввод имени заказчика — за кулисами ищем/создаём клиента.
      let clientId = null
      if (values.client_name?.trim()) {
        const client = await findOrCreateClientByName(values.client_name)
        clientId = client?.id || null
      }
      const order = await createOrder({
        order_type: values.order_type,
        qty: values.qty,
        width_mm: values.width_mm,
        height_mm: values.height_mm,
        need_lam: needLam,
        lam_type: needLam ? values.lam_type : null,
        film_type: values.film_type,
        film_type_stickers: isStickerpack3D ? (values.film_type_stickers || values.film_type) : null,
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

      // Загружаем превью после успешного создания заказа (нужен order.id).
      // Если падает — заказ всё равно создан, показываем мягкое предупреждение.
      if (previewFile) {
        try {
          await uploadAttachment(order.id, previewFile, profile?.id, { pathPrefix: 'tech-preview' })
        } catch (uploadErr) {
          captureError(uploadErr, {
            tags: { source: 'CreateOrderPage.uploadPreview' },
            extra: { orderId: order.id, fileName: previewFile.name },
          })
          toast.error('Заказ создан, но превью не загрузилось — добавьте на странице заказа')
        }
      }

      toast.success(`Заказ ${formatOrderNumber(order)} создан`)
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
                <label className="block text-sm font-medium mb-1">Срок сдачи <span className="text-danger">*</span></label>
                <Input type="date" aria-invalid={!!errors.deadline} className={errors.deadline ? 'border-danger ring-1 ring-danger/30' : ''} {...register('deadline')} />
                <FieldError error={errors.deadline} />
              </div>
            </div>

            {/* Стикеров в паке (только для пака) */}
            {isStickerpack && (
              <div>
                <label className="block text-sm font-medium mb-1">Стикеров в паке</label>
                <Input type="number" inputMode="numeric" min="1" {...register('stickers_per_pack')} />
              </div>
            )}

            {/* Плёнка(и) + Ламинация */}
            {isStickerpack3D ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Плёнка фонов</label>
                  <select {...register('film_type')} className={SELECT_CLASS}>
                    {Object.entries(FILM_TYPES).map(([key, { label }]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Плёнка стикеров</label>
                  <select {...register('film_type_stickers')} className={SELECT_CLASS}>
                    {Object.entries(FILM_TYPES).map(([key, { label }]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              {!isStickerpack3D && (
                <div>
                  <label className="block text-sm font-medium mb-1">Плёнка</label>
                  <select {...register('film_type')} className={SELECT_CLASS}>
                    {Object.entries(FILM_TYPES).map(([key, { label }]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
              )}
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
                <label className="block text-sm font-medium mb-1">Заказчик <span className="text-danger">*</span></label>
                <Input
                  type="text"
                  placeholder="Имя или название компании"
                  aria-invalid={!!errors.client_name}
                  className={errors.client_name ? 'border-danger ring-1 ring-danger/30' : ''}
                  {...register('client_name')}
                />
                <FieldError error={errors.client_name} />
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
              <label className={`flex items-center gap-2 min-h-[44px] px-3 rounded-lg border border-border ${isStickerpack3D ? 'opacity-70' : 'cursor-pointer hover:bg-surface-2'}`}>
                <input
                  type="checkbox"
                  {...register('bopp_bag')}
                  disabled={isStickerpack3D}
                  className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
                />
                <span className="text-sm">
                  Упаковка в БОПП-пакет
                  {isStickerpack3D && <span className="text-text-muted ml-1">(обязательно для 3D-пака)</span>}
                </span>
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
              <span className="text-sm">Партнёрский (-25%)</span>
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

        {/* === RIGHT: Цена + Расход материалов + Макет + Комментарий === */}
        <div className="space-y-4">
          {canSeeFinance && (
            <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
              <label className="block text-sm font-medium mb-1">Стоимость (бюджет), руб. <span className="text-danger">*</span></label>
              <Input
                type="number"
                step="0.01"
                placeholder="0"
                aria-invalid={!!errors.price_final}
                className={errors.price_final ? 'border-danger ring-1 ring-danger/30' : ''}
                {...register('price_final')}
              />
              <FieldError error={errors.price_final} />
            </div>
          )}

          <MaterialForecast
            orderType={orderType}
            widthMm={widthMm}
            heightMm={heightMm}
            qty={qty}
            filmType={filmType}
            lamType={lamType}
            boppBag={boppBag}
          />

          <div className="bg-surface rounded-2xl border border-border shadow-card p-5 space-y-3">
            <div>
              <label className="block text-sm font-medium mb-2">Ссылка на макет</label>
              <Input type="text" placeholder="https://... или путь на сервере" {...register('mockup_path')} />
              {mockupPath && !isMockupImage && (
                <p className="text-xs text-text-muted mt-1">Ссылка не на изображение — будет открыта по клику в карточке.</p>
              )}
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Превью макета</p>
              <div
                onClick={() => !previewFile && previewInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setPreviewDragOver(true) }}
                onDragLeave={() => setPreviewDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setPreviewDragOver(false)
                  selectPreviewFile(e.dataTransfer?.files?.[0])
                }}
                className={`relative rounded-xl flex items-center justify-center transition-all overflow-hidden ${
                  previewBlobUrl
                    ? 'bg-surface-dim border border-border'
                    : `border-2 border-dashed cursor-pointer ${previewDragOver ? 'border-info bg-info/5' : 'border-border bg-surface-dim hover:border-info/60'}`
                }`}
                style={{ minHeight: 180, maxHeight: 320 }}
              >
                {previewBlobUrl ? (
                  <>
                    <img
                      src={previewBlobUrl}
                      alt="Превью макета"
                      className="w-full max-h-[300px] object-contain"
                    />
                    <div className="absolute top-2 right-2 flex gap-2">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); previewInputRef.current?.click() }}
                        className="text-xs px-3 py-1.5 rounded-lg bg-surface/95 border border-border hover:bg-surface shadow-sm"
                      >
                        Заменить
                      </button>
                      <button
                        type="button"
                        onClick={clearPreviewFile}
                        className="text-xs px-3 py-1.5 rounded-lg bg-surface/95 border border-danger/40 text-danger hover:bg-danger/10 shadow-sm"
                      >
                        × Удалить
                      </button>
                    </div>
                  </>
                ) : isMockupImage ? (
                  <img
                    src={mockupPath}
                    alt="Превью макета"
                    loading="lazy"
                    className="w-full max-h-[300px] object-contain"
                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-text-muted p-6 text-center">
                    <div className="text-3xl mb-2">📎</div>
                    <div className="text-sm font-medium">Перетащите файл сюда</div>
                    <div className="text-xs mt-1">или кликните для выбора</div>
                    <div className="text-xs mt-2 opacity-70">JPG / PNG / WEBP · до 2 МБ</div>
                  </div>
                )}
              </div>
              <input
                ref={previewInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => {
                  selectPreviewFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              {previewFile && (
                <p className="text-xs text-text-muted mt-2">
                  Загрузится после создания заказа: {previewFile.name}
                </p>
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
