// R25.6 (ТЗ 17.11, Фаза 6.1): общая форма создания заказа. Используется на
// странице /orders/create (CreateOrderPage) и в попапе «Создать заказ» калькулятора
// (CreateOrderModal) — проверки полей, проверка остатков склада, загрузка превью
// и сохранение одинаковы.
//
// Props:
//   initialValues   — значения поверх дефолтов формы; ключ `variants` (массив
//                     { width_mm, height_mm, qty }) задаёт виды изделий при N > 1
//   prefilledKeys   — поля с серой меткой «из расчёта» (остаются редактируемыми)
//   onCreated(order)— вызывается после успешного создания (навигация / тост — у родителя)
//   onCancel()      — кнопка «Отмена»
//   buildExtraOrderData(values, payload) — доп. колонки заказа (снимок расчёта и т.п.)
//   onDirtyChange(bool) — форма изменена пользователем (подтверждение закрытия)
//   variant         — 'page' | 'modal' (панель кнопок закреплена всегда в попапе)
//
// Цена: без права view:finance поле скрыто. Если цена пришла из расчёта
// (prefilledKeys содержит price_final) — она пишется в заказ и без права на
// финансы (ТЗ 6.2). Ручное создание без права — как раньше.

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import ConfirmDialog from '@/shared/components/ConfirmDialog'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createOrder } from '../hooks/useOrders'
import {
  ORDER_SOURCES, PAYMENT_STATUSES, DELIVERY_TYPES, DESIGN_STATUSES, SIZE_PRESETS,
  needsLamination, STICKER_SHAPES,
  PRODUCT_NAME_MAX, MAX_ORDER_ITEMS, LAMINATION_FORM_EXCLUDE_CODES,
  isIndividualCutHidden, individualCutForOrderType, orderTypeForIndividualCut,
  getOrderRoute,
} from '@/shared/constants'
import { applyPackShapes } from '@/features/production/hooks/usePackDesigns'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import { useOrderTypeOptions } from '@/features/order-types/hooks/useOrderTypeOptions'
import { getTypeDef } from '@/shared/lib/route-registry'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'
import { findOrCreateClientByName } from '@/features/clients/hooks/useClients'
import { uploadAttachment, validatePreviewFile } from '@/features/orders/lib/order-attachments'
import { captureError } from '@/shared/lib/sentry'
import { MaterialForecast } from './MaterialForecast'
import { FilmSelect } from './FilmSelect'
import { LaminationSelect } from './LaminationSelect'
import { MontageFilmSelect } from './MontageFilmSelect'
import { ContractorSelect } from '@/features/contractors/components/ContractorSelect'
import { buildVariantRows, variantsTotalQty, resizeVariants } from '../lib/order-variants'
import { replaceOrderItems } from '../hooks/useOrderItems'
import { forecastMaterials } from '../lib/material-forecast'
import { useMaterials } from '@/features/warehouse/hooks/useMaterials'
import { useWarehouseCategories } from '@/features/warehouse/hooks/useWarehouseCategories'
import { extraCategoriesForRoute, forecastExtraMaterials } from '@/features/warehouse/lib/order-material-categories'
import { saveOrderMaterials } from '../hooks/useOrderMaterials'
import { ExtraMaterialsFields } from './ExtraMaterialsFields'

const SELECT_CLASS = 'w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm min-h-[44px]'
const IMAGE_RX = /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i

function FieldError({ error }) {
  if (!error) return null
  return <p className="text-danger text-xs mt-1 font-medium">{error.message}</p>
}

/** R25.6: серая метка у поля, заполненного из калькулятора. */
function FromCalc({ show }) {
  if (!show) return null
  return (
    <span className="ml-1.5 inline-block align-middle rounded-full bg-surface-2 border border-border px-2 py-0.5 text-[10px] font-medium text-text-muted whitespace-nowrap">
      из расчёта
    </span>
  )
}

const DEFAULT_VALUES = {
  order_type: '', qty: 1, width_mm: 100, height_mm: 100,
  lam_type: '', is_urgent: false, bopp_bag: false,
  film_type: 'G', film_type_stickers: 'G',
  film_material_id: null, film_stickers_material_id: null, lam_material_id: null,
  is_partner: false, payment_status: 'not_paid',
  design_status: 'provided', delivery_type: 'pickup',
  client_name: '',
  product_name: '', needs_individual_cut: false,
  needs_montage_film: false, montage_material_id: null,
  is_subcontract: false, contractor_id: null, contractor_notes: '', contractor_cost: '',
}

function OrderTypeSelector({ value, onChange, error, prefilled }) {
  // R25.7C: активные типы реестра (встроенные + свои), фолбэк — ORDER_TYPES.
  const options = useOrderTypeOptions(value)
  return (
    <div>
      <label className="block text-sm font-medium mb-2">Тип продукции <span className="text-danger">*</span><FromCalc show={prefilled} /></label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {options.map(({ key, label }) => (
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
  film_material_id: z.string().optional().nullable(),
  film_stickers_material_id: z.string().optional().nullable(),
  lam_type: z.string().optional(),
  lam_material_id: z.string().optional().nullable(),
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

  // R25.4 (ТЗ Фаза 4)
  product_name: z.string().optional(),
  needs_individual_cut: z.boolean().default(false),
  needs_montage_film: z.boolean().default(false),
  montage_material_id: z.string().optional().nullable(),
  is_subcontract: z.boolean().default(false),
  contractor_id: z.string().optional().nullable(),
  contractor_notes: z.string().optional(),
  contractor_cost: z.union([z.literal(''), z.coerce.number().min(0, 'Стоимость не может быть отрицательной')]).optional(),
}).superRefine((v, ctx) => {
  // «Прочее» требует название продукции (ТЗ 4.1).
  if (v.order_type === 'other') {
    const name = (v.product_name || '').trim()
    if (!name) ctx.addIssue({ code: 'custom', path: ['product_name'], message: 'Укажите название продукции' })
    else if (name.length > PRODUCT_NAME_MAX) ctx.addIssue({ code: 'custom', path: ['product_name'], message: `Название — до ${PRODUCT_NAME_MAX} символов` })
  }
  // Субподряд: подрядчик обязателен (ТЗ 4.2).
  if (v.is_subcontract && !v.contractor_id) {
    ctx.addIssue({ code: 'custom', path: ['contractor_id'], message: 'Выберите подрядчика' })
  }
})

export function CreateOrderForm({
  initialValues,
  prefilledKeys,
  onCreated,
  onCancel,
  buildExtraOrderData,
  onDirtyChange,
  variant = 'page',
}) {
  const { profile } = useAuth()
  // Начальные значения фиксируются при монтировании: попап калькулятора берёт
  // расчёт на момент открытия и не меняется вслед за калькулятором (ТЗ 6.1).
  const [initial] = useState(() => {
    const { variants: initVariants, ...rest } = initialValues || {}
    const vs = Array.isArray(initVariants) && initVariants.length > 1
      ? initVariants.slice(0, MAX_ORDER_ITEMS).map((v) => ({
        width_mm: v.width_mm ?? '', height_mm: v.height_mm ?? '', qty: v.qty != null ? String(v.qty) : '',
      }))
      : []
    return { values: { ...DEFAULT_VALUES, ...rest }, variants: vs }
  })
  const prefilled = useMemo(() => new Set(prefilledKeys || []), [prefilledKeys])
  const isPrefilled = (key) => prefilled.has(key)
  const [submitting, setSubmitting] = useState(false)
  // R9.5A (бриф 26.05): отдельный state для submit-ошибок (после прохождения
  // Zod-валидации). Показываем полный err.message в баннере, чтобы менеджер
  // мог переслать точный текст вместо общего toast.
  const [submitError, setSubmitError] = useState(null)
  const [activePreset, setActivePreset] = useState(null)
  const [previewFile, setPreviewFile] = useState(null)
  const [previewBlobUrl, setPreviewBlobUrl] = useState(null)
  const [previewDragOver, setPreviewDragOver] = useState(false)
  // Multi-variant (R8.3 → R25.4 ТЗ 4.6): до 9 видов. У каждого вида — размер
  // (пусто = общий размер заказа) и тираж. Тираж заказа = сумма видов.
  const [itemsCount, setItemsCount] = useState(() => Math.max(1, initial.variants.length))
  const [variants, setVariants] = useState(() => initial.variants)
  // Изменения вне react-hook-form (виды, типы стикеров, превью) — для onDirtyChange.
  const [extraDirty, setExtraDirty] = useState(false)

  function updateItemsCount(n) {
    const next = Math.max(1, Math.min(MAX_ORDER_ITEMS, Number(n) || 1))
    setItemsCount(next)
    setVariants((prev) => resizeVariants(prev, next, getValues('qty')))
    setExtraDirty(true)
  }

  function updateVariant(idx, field, value) {
    setVariants((prev) => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
    setExtraDirty(true)
  }

  // R19: типы (формы) стикеров в 3D-паке — {shape, number}. Итого стикеров в
  // паке = стандартные (поле stickers_per_pack) + эти строки. number = design_index.
  const [stickerTypes, setStickerTypes] = useState([])
  function addStickerType(std) {
    // Авто-номер = стандартные + уже добавленные + 1 (спецы идут после стандартных).
    const nextNum = (Number(std) || 0) + stickerTypes.length + 1
    setStickerTypes((prev) => [...prev, { shape: 'complex', number: String(nextNum) }])
    setExtraDirty(true)
  }
  function updateStickerType(idx, field, value) {
    setStickerTypes((prev) => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
    setExtraDirty(true)
  }
  function removeStickerType(idx) {
    setStickerTypes((prev) => prev.filter((_, i) => i !== idx))
    setExtraDirty(true)
  }
  // R19.2: форма одиночного 3D-стикера (order-level).
  const [stickerShape, setStickerShape] = useState('standard')
  const previewInputRef = useRef(null)
  const canSeeFinance = useCanDo('view:finance')
  // ТЗ 6.2: цена из расчёта пишется и без права на финансы (поле скрыто, но заполнено).
  const pricePrefilled = prefilled.has('price_final')
  const canWritePrice = canSeeFinance || pricePrefilled

  function selectPreviewFile(file) {
    if (!file) return
    const err = validatePreviewFile(file)
    if (err) { toast.error(err); return }
    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl)
    setPreviewFile(file)
    setPreviewBlobUrl(URL.createObjectURL(file))
    setExtraDirty(true)
  }

  function clearPreviewFile(e) {
    e?.preventDefault?.()
    e?.stopPropagation?.()
    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl)
    setPreviewFile(null)
    setPreviewBlobUrl(null)
  }

  // R17.1 (бриф 5.06 «Оформление заказа»): Ctrl+V из буфера обмена.
  // R25.6: слушатель живёт, пока форма открыта, и реагирует только на вставку
  // внутри формы или без фокуса (body) — вставка в другом диалоге поверх
  // (например, подтверждении) или в соседнем окне не перехватывается.
  const rootRef = useRef(null)
  useEffect(() => {
    function handlePaste(e) {
      // Игнорируем paste внутри текстовых полей — не перехватываем обычный paste-текст.
      const target = e.target
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      const root = rootRef.current
      if (!root) return
      const outside = target instanceof Node && !root.contains(target)
        && target !== document.body && target !== document.documentElement
      if (outside) return
      const items = e.clipboardData?.items
      if (!items) return
      for (const it of items) {
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const file = it.getAsFile()
          if (file) {
            e.preventDefault()
            selectPreviewFile(file)
            return
          }
        }
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [previewBlobUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl) }, [previewBlobUrl])

  const formRef = useRef(null)
  const { register, handleSubmit, watch, setValue, getValues, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: initial.values,
  })

  // «Изменено» = любое значение отличается от начального. Сравнение строками:
  // инпуты отдают строки ('100' vs 100), а setValue без shouldDirty (тип
  // продукции, плёнка) не помечает поле dirty в react-hook-form.
  const allValues = watch()
  const valuesDirty = Object.keys({ ...initial.values, ...allValues }).some(
    (k) => String(allValues[k] ?? '') !== String(initial.values[k] ?? ''),
  )
  const anyDirty = valuesDirty || extraDirty
  useEffect(() => { onDirtyChange?.(anyDirty) }, [anyDirty, onDirtyChange])

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
  const needLam = needsLamination(lamType)
  const orderType = watch('order_type')
  const source = watch('source')
  const deliveryType = watch('delivery_type')
  const mockupPath = watch('mockup_path')
  const widthMm = watch('width_mm')
  const heightMm = watch('height_mm')
  const qty = watch('qty')
  const filmType = watch('film_type')
  const filmTypeStickers = watch('film_type_stickers')
  const boppBag = watch('bopp_bag')
  const standardPerPack = Number(watch('stickers_per_pack')) || 0
  // R25.7C: свой тип-набор тоже показывает «Стикеров в паке».
  const isStickerpack = orderType === 'stickerpack' || orderType === 'stickerpack3D'
    || (!!getTypeDef(orderType)?.is_set && !getTypeDef(orderType)?.is_builtin)
  const isStickerpack3D = orderType === 'stickerpack3D'
  const isSticker3D = orderType === 'sticker3D'
  // R19: валидные типы стикеров (форма выбрана, номер задан).
  const validStickerTypes = useMemo(
    () => stickerTypes.filter((t) => t.shape && Number(t.number) > 0),
    [stickerTypes],
  )
  const isMockupImage = mockupPath && IMAGE_RX.test(mockupPath)
  const isOther = orderType === 'other'
  const isSubcontract = !!watch('is_subcontract')
  const needsMontageFilm = !!watch('needs_montage_film')
  const montageMaterialId = watch('montage_material_id') || null
  const needsIndividualCut = !!watch('needs_individual_cut')
  const individualCutHidden = isIndividualCutHidden(orderType)

  // R25.4: виды с разрешённым размером (пусто → общий) и суммарный тираж.
  const variantRows = useMemo(
    () => (itemsCount > 1 ? buildVariantRows(variants, widthMm, heightMm) : null),
    [itemsCount, variants, widthMm, heightMm],
  )
  const variantsTotal = variantRows ? variantsTotalQty(variantRows) : 0
  // Тираж заказа при видах > 1 равен сумме и руками не меняется (ТЗ 4.6).
  useEffect(() => {
    if (itemsCount > 1) setValue('qty', variantsTotal, { shouldValidate: variantsTotal > 0 })
  }, [itemsCount, variantsTotal, setValue])
  const forecastItems = useMemo(
    () => (variantRows ? variantRows.map((r) => ({ widthMm: r.width_mm, heightMm: r.height_mm, qty: r.qty })) : undefined),
    [variantRows],
  )

  // R11.4: считаем прогноз расхода и складские остатки для warning'ов.
  const { materials } = useMaterials()

  // R25.7B (ТЗ 7.5): дополнительные материалы — категории «Дополнительный
  // материал», чей этап списания есть в маршруте будущего заказа (v2).
  const { categories: whCategories } = useWarehouseCategories()
  const [extraSelection, setExtraSelection] = useState({})
  const designStatus = watch('design_status')
  const extraCategories = useMemo(() => {
    if (!orderType) return []
    const route = getOrderRoute({
      route_version: 2,
      order_type: orderType,
      design_status: designStatus,
      need_lam: needLam,
      needs_montage_film: needsMontageFilm,
      delivery_type: deliveryType,
      is_subcontract: isSubcontract,
      bopp_bag: boppBag,
    })
    return extraCategoriesForRoute(whCategories, route)
  }, [whCategories, orderType, designStatus, needLam, needsMontageFilm, deliveryType, isSubcontract, boppBag])
  const extraForecastRows = useMemo(
    () => forecastExtraMaterials(extraCategories, extraSelection, qty, materials),
    [extraCategories, extraSelection, qty, materials],
  )
  const forecastRows = useMemo(() => forecastMaterials({
    orderType, widthMm, heightMm, qty, filmType, lamType, boppBag,
    items: forecastItems,
    needsMontageFilm, montageMaterialId, isSubcontract,
  }), [orderType, widthMm, heightMm, qty, filmType, lamType, boppBag, forecastItems, needsMontageFilm, montageMaterialId, isSubcontract])

  const stockByCode = useMemo(() => {
    const map = {}
    for (const m of materials || []) {
      if (!m.material_code) continue
      map[m.material_code] = (map[m.material_code] || 0) + (Number(m.stock_qty) || 0)
    }
    return map
  }, [materials])

  const expectedByCode = useMemo(() => {
    const map = {}
    for (const r of forecastRows) {
      if (r.lookup?.by === 'code') map[r.lookup.value] = r.expected
    }
    return map
  }, [forecastRows])

  const shortages = useMemo(() => {
    const out = []
    for (const r of forecastRows) {
      if (r.lookup?.by !== 'code') continue
      const stock = stockByCode[r.lookup.value] || 0
      if (r.expected > stock) {
        out.push({ label: r.label, expected: r.expected, stock, unit: r.unit, missing: r.expected - stock })
      }
    }
    // R25.7B: доп. материалы — остаток выбранной позиции.
    for (const r of extraForecastRows) {
      const m = (materials || []).find((x) => x.id === r.lookup.value)
      const stock = Number(m?.stock_qty) || 0
      if (r.expected > stock) {
        out.push({ label: r.label, expected: r.expected, stock, unit: r.unit, missing: r.expected - stock })
      }
    }
    return out
  }, [forecastRows, stockByCode, extraForecastRows, materials])

  // Smart defaults: 3D-стикерпак → auto-BOPP; первый выбор 3D → плёнка G по дефолту.
  // R25.6: срабатывают только при СМЕНЕ типа — начальные значения (из расчёта:
  // плёнка, поштучная резка) не перетираются при открытии формы. Для ручного
  // создания начальный тип пустой — поведение прежнее.
  const lastOrderTypeRef = useRef(initial.values.order_type)
  useEffect(() => {
    if (orderType === lastOrderTypeRef.current) return
    lastOrderTypeRef.current = orderType
    if (orderType === 'sticker3D' || orderType === 'stickerpack3D') {
      setValue('film_type', 'G')
    }
    if (orderType === 'stickerpack3D') {
      setValue('bopp_bag', true)
      // R23.3 (Фаза 8.4): одна плёнка — film_type_stickers больше не заполняем.
    }
    // R25.4 (ТЗ 4.5): поштучная резка связана с типом винилового стикера,
    // у стикерпаков скрыта (сбрасываем).
    const cut = individualCutForOrderType(orderType)
    if (cut !== null) setValue('needs_individual_cut', cut)
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

  const [pendingShortageValues, setPendingShortageValues] = useState(null)

  function preSubmit(values) {
    // R14.7 (code-review 03.06): multi-variant — блокируем submit если выбрано
    // >1 видов, но виды не дозаполнены (qty=0 / нет размера).
    // Раньше отфильтрованные строки молча терялись, заказ создавался с одним
    // видом и подзадачи variants не генерировались. Менеджер узнавал поздно.
    if (itemsCount > 1) {
      const invalid = (variantRows || []).filter((r) => !(r.width_mm > 0 && r.height_mm > 0 && r.qty > 0))
      if (invalid.length > 0) {
        toast.error(`Заполните все ${itemsCount} видов изделий — у ${invalid.length} не указан тираж или размер.`)
        return
      }
    }
    // R19 ревью 05.07: номера спец-стикеров — дубли и выход за диапазон раньше
    // молча проходили (update по несуществующему design_index трогает 0 строк,
    // форма «не сохранялась» без сигнала; при дубле один из видов оставался standard).
    if (isStickerpack3D && validStickerTypes.length > 0) {
      const totalInPack = (Number(values.stickers_per_pack) || 0) + validStickerTypes.length
      const nums = validStickerTypes.map((t) => Number(t.number))
      const dupes = [...new Set(nums.filter((n, i) => nums.indexOf(n) !== i))]
      if (dupes.length > 0) {
        toast.error(`Номера спец-стикеров повторяются: ${dupes.join(', ')}`)
        return
      }
      const outOfRange = nums.filter((n) => n < 1 || n > totalInPack)
      if (outOfRange.length > 0) {
        toast.error(`Номер спец-стикера вне диапазона 1–${totalInPack}: ${outOfRange.join(', ')}`)
        return
      }
    }
    // Аудит 05.07: плёнка обязательна конкретной позицией склада. Без неё
    // себестоимость плёнки в отчётах считалась по 0 ₽ (ходовые позиции без
    // material_code) — маржа завышалась у ~трети заказов. Требуем выбор
    // позиции с ценой; для 3D-пака ещё и плёнку стикеров (её код/цена
    // отличаются от фонов).
    // R25.4: на субподряде плёнку цеха не выбираем — изделие делает подрядчик.
    if (!values.is_subcontract && !values.film_material_id) {
      toast.error('Выберите плёнку со склада (конкретную позицию) — без неё себестоимость считается неверно')
      return
    }
    // R23.3 (ТЗ 23.07 Фаза 8.4): у stickerpack3D больше нет отдельной плёнки
    // стикеров — одна плёнка на весь заказ, отдельная валидация убрана.
    // R11.4: если на складе не хватает заявленных материалов — спросить подтверждение.
    if (shortages.length > 0) {
      setPendingShortageValues(values)
      return
    }
    onSubmit(values)
  }

  function confirmAndSubmit() {
    const v = pendingShortageValues
    setPendingShortageValues(null)
    if (v) onSubmit(v)
  }

  async function onSubmit(values) {
    setSubmitting(true)
    setSubmitError(null)
    let stage = 'init'
    try {
      // Свободный ввод имени заказчика — за кулисами ищем/создаём клиента.
      let clientId = null
      stage = 'findOrCreateClient'
      if (values.client_name?.trim()) {
        const client = await findOrCreateClientByName(values.client_name)
        clientId = client?.id || null
      }
      stage = 'createOrder'
      const sub = !!values.is_subcontract
      // На субподряде ламинация/монтаж цеха не выполняются.
      const lamOn = needLam && !sub
      const montageOn = !!values.needs_montage_film && !sub
      const payload = {
        order_type: values.order_type,
        qty: itemsCount > 1 ? variantsTotal : values.qty,
        width_mm: values.width_mm,
        height_mm: values.height_mm,
        need_lam: lamOn,
        lam_type: lamOn ? values.lam_type : null,
        lam_material_id: lamOn ? (values.lam_material_id || null) : null,
        film_type: values.film_type,
        film_material_id: values.film_material_id || null,
        // R25.4 (ТЗ Фаза 4)
        product_name: values.order_type === 'other' ? (values.product_name || '').trim() : null,
        needs_individual_cut: isIndividualCutHidden(values.order_type) ? false : !!values.needs_individual_cut,
        needs_montage_film: montageOn,
        montage_material_id: montageOn ? (values.montage_material_id || null) : null,
        is_subcontract: sub,
        contractor_id: sub ? (values.contractor_id || null) : null,
        contractor_notes: sub ? ((values.contractor_notes || '').trim() || null) : null,
        ...(canSeeFinance && sub && values.contractor_cost !== '' && values.contractor_cost != null
          ? { contractor_cost: Number(values.contractor_cost) }
          : {}),
        // R23.3 (Фаза 8.4): одна плёнка на заказ — плёнка стикеров больше не
        // хранится (колонки остаются nullable для исторических заказов).
        film_type_stickers: null,
        film_stickers_material_id: null,
        client_id: clientId,
        deadline: values.deadline || null,
        priority: values.is_urgent ? 'urgent' : 'normal',
        notes: values.notes || null,
        bopp_bag: values.bopp_bag,
        deal_name: values.deal_name || null,
        bitrix_deal_id: values.bitrix_deal_id || null,
        price_final: canWritePrice && values.price_final ? values.price_final : null,
        is_partner: values.is_partner,
        source: values.source || null,
        source_referrer: values.source === 'referrer' ? (values.source_referrer || null) : null,
        payment_status: values.payment_status,
        design_status: values.design_status,
        mockup_path: values.mockup_path || null,
        // R19: итого стикеров в паке = стандартные + спец-типы (форма по номеру).
        stickers_per_pack: isStickerpack
          ? ((Number(values.stickers_per_pack) || 0) + (isStickerpack3D ? validStickerTypes.length : 0)) || null
          : null,
        // R19.2: форма одиночного 3D-стикера.
        sticker_shape: isSticker3D ? stickerShape : 'standard',
        delivery_type: values.delivery_type,
        delivery_city: values.delivery_city || null,
        delivery_address: values.delivery_address || null,
        delivery_notes: values.delivery_notes || null,
      }
      // R25.6: доп. колонки от родителя (снимок расчёта, цена за штуку).
      const extra = buildExtraOrderData ? buildExtraOrderData(values, payload) : null
      const order = await createOrder(extra ? { ...payload, ...extra } : payload)

      // Multi-variant: если выбрано больше одного вида — перезаписываем items.
      // Триггер уже создал дефолтный idx=1; replaceOrderItems заменит на полный
      // массив видов (R25.4: размер вида — свой или общий, тираж — свой).
      if (itemsCount > 1 && variantRows) {
        const itemsToInsert = variantRows
          .filter((r) => r.width_mm > 0 && r.height_mm > 0 && r.qty > 0)
          .map((r) => ({ width_mm: r.width_mm, height_mm: r.height_mm, qty: r.qty }))
        if (itemsToInsert.length > 1) {
          try {
            await replaceOrderItems(order.id, itemsToInsert)
          } catch (itemsErr) {
            captureError(itemsErr, {
              tags: { source: 'CreateOrderPage.replaceOrderItems' },
              extra: { orderId: order.id },
            })
            toast.error('Заказ создан, но доп. виды не сохранились — добавьте в редакторе заказа')
          }
        }
      }

      // R19: проставить формы спец-стикеров по номерам (design_index).
      // Строки pack_designs уже создал триггер из stickers_per_pack.
      if (isStickerpack3D && validStickerTypes.length > 0) {
        try {
          await applyPackShapes(order.id, validStickerTypes.map((t) => ({
            design_index: Number(t.number),
            shape: t.shape,
          })))
        } catch (shapeErr) {
          captureError(shapeErr, {
            tags: { source: 'CreateOrderPage.applyPackShapes' },
            extra: { orderId: order.id },
          })
          toast.error('Заказ создан, но формы стикеров не сохранились — задайте на странице заказа')
        }
      }

      // R25.7B: дополнительные материалы заказа (нужен order.id).
      if (extraCategories.length > 0) {
        try {
          await saveOrderMaterials(order.id, extraSelection, extraCategories.map((c) => c.id), [])
        } catch (matErr) {
          captureError(matErr, {
            tags: { source: 'CreateOrderPage.saveOrderMaterials' },
            extra: { orderId: order.id },
          })
          toast.error('Заказ создан, но дополнительные материалы не сохранились — выберите их в редакторе заказа')
        }
      }

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

      onCreated?.(order)
    } catch (err) {
      captureError(err, {
        tags: { source: `CreateOrderPage.submit.${stage}` },
        extra: {
          order_type: values?.order_type,
          qty: values?.qty,
          width_mm: values?.width_mm,
          height_mm: values?.height_mm,
          client_name: values?.client_name,
          itemsCount,
        },
      })
      setSubmitError({ stage, error: err })
      toast.error(translateError(err).message || err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div ref={rootRef}>
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

      {/* R9.5A (бриф 26.05): submit-ошибка после прохождения валидации.
          Показываем полный err.message + stage + код PostgREST, чтобы можно
          было воспроизвести по логам Sentry. */}
      {submitError?.error && (
        <div className="bg-danger/10 border border-danger/30 text-danger rounded-xl p-4 text-sm mb-6" role="alert">
          <p className="font-medium">Ошибка при создании заказа</p>
          <p className="text-xs mt-1">
            Этап: <span className="font-mono">{submitError.stage}</span>
          </p>
          <p className="text-xs mt-1 font-mono break-words">
            {submitError.error.message || translateError(submitError.error).message}
          </p>
          {(submitError.error.code || submitError.error.details) && (
            <p className="text-[11px] mt-1 font-mono break-words opacity-70">
              {[submitError.error.code, submitError.error.details, submitError.error.hint].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit(preSubmit, scrollToFirstError)} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* === LEFT: Основное + Дополнительное === */}
        <div className="bg-surface rounded-2xl border border-border shadow-card p-5 space-y-5">
          {/* Основное */}
          <div className="space-y-4">
            <OrderTypeSelector
              value={orderType}
              onChange={(val) => setValue('order_type', val, { shouldValidate: true })}
              error={errors.order_type}
              prefilled={isPrefilled('order_type')}
            />

            {/* R25.4 (ТЗ 4.1): «Прочее» — обязательное название продукции */}
            {isOther && (
              <div>
                <label htmlFor="product_name" className="block text-sm font-medium mb-1">
                  Название продукции <span className="text-danger">*</span>
                </label>
                <Input
                  id="product_name"
                  type="text"
                  maxLength={PRODUCT_NAME_MAX}
                  placeholder="Например, Магниты"
                  aria-invalid={!!errors.product_name}
                  className={errors.product_name ? 'border-danger ring-1 ring-danger/30' : ''}
                  {...register('product_name')}
                />
                <FieldError error={errors.product_name} />
              </div>
            )}

            {/* R25.4 (ТЗ 4.5 / 4.2): поштучная резка + субподряд */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {!individualCutHidden && (
                <label className="flex items-center gap-2 min-h-[44px] px-3 rounded-lg border border-border cursor-pointer hover:bg-surface-2">
                  <input
                    type="checkbox"
                    checked={needsIndividualCut}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setValue('needs_individual_cut', checked, { shouldDirty: true })
                      // Виниловый стикер: галочка переключает «вырубной» ↔ «на подложке».
                      const linked = orderTypeForIndividualCut(orderType, checked)
                      if (linked !== orderType) setValue('order_type', linked, { shouldValidate: true })
                    }}
                    className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
                  />
                  <span className="text-sm">Поштучная резка<FromCalc show={isPrefilled('needs_individual_cut')} /></span>
                </label>
              )}
              <label className="flex items-center gap-2 min-h-[44px] px-3 rounded-lg border border-border cursor-pointer hover:bg-surface-2">
                <input type="checkbox" {...register('is_subcontract')} className="w-5 h-5 rounded border-border text-accent focus:ring-accent" />
                <span className="text-sm">Субподряд</span>
              </label>
            </div>

            {isSubcontract && (
              <div className="space-y-3 p-3 rounded-xl border border-border bg-surface-dim">
                <p className="text-xs text-text-muted">
                  Этапы цеха не выполняются: после утверждения дизайна заказ уходит подрядчику, затем — на упаковку.
                </p>
                <div>
                  <label htmlFor="contractor_id" className="block text-sm font-medium mb-1">
                    Подрядчик <span className="text-danger">*</span>
                  </label>
                  <ContractorSelect
                    id="contractor_id"
                    value={watch('contractor_id')}
                    onChange={(val) => setValue('contractor_id', val, { shouldValidate: true })}
                    invalid={!!errors.contractor_id}
                  />
                  <FieldError error={errors.contractor_id} />
                </div>
                <div>
                  <label htmlFor="contractor_notes" className="block text-sm font-medium mb-1">Что заказано у подрядчика</label>
                  <Input id="contractor_notes" type="text" placeholder="Например, 500 магнитов 50×50" {...register('contractor_notes')} />
                </div>
                {canSeeFinance && (
                  <div>
                    <label htmlFor="contractor_cost" className="block text-sm font-medium mb-1">Стоимость работ подрядчика, ₽</label>
                    <Input id="contractor_cost" type="number" step="0.01" min="0" inputMode="decimal" {...register('contractor_cost')} />
                    <FieldError error={errors.contractor_cost} />
                  </div>
                )}
              </div>
            )}

            {/* Размер */}
            <div>
              <label className="block text-sm font-medium mb-2">Размер, мм <span className="text-danger">*</span><FromCalc show={isPrefilled('width_mm') || isPrefilled('height_mm')} /></label>
              <SizePresetPicker activePreset={activePreset} onSelect={applyPreset} isPack={isStickerpack} />
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <label htmlFor="width_mm" className="block text-xs text-text-muted mb-0.5">Ширина, мм</label>
                  <Input id="width_mm" type="number" placeholder="100" inputMode="numeric" aria-invalid={!!errors.width_mm} className={errors.width_mm ? 'border-danger ring-1 ring-danger/30' : ''} {...register('width_mm', { onChange: () => setActivePreset(null) })} />
                  <FieldError error={errors.width_mm} />
                </div>
                <div>
                  <label htmlFor="height_mm" className="block text-xs text-text-muted mb-0.5">Длина, мм</label>
                  <Input id="height_mm" type="number" placeholder="100" inputMode="numeric" aria-invalid={!!errors.height_mm} className={errors.height_mm ? 'border-danger ring-1 ring-danger/30' : ''} {...register('height_mm', { onChange: () => setActivePreset(null) })} />
                  <FieldError error={errors.height_mm} />
                </div>
              </div>
            </div>

            {/* Тираж + Дедлайн */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Тираж, шт <span className="text-danger">*</span>
                  {itemsCount > 1 && <span className="text-text-muted text-xs ml-1">(сумма видов)</span>}
                  <FromCalc show={isPrefilled('qty')} />
                </label>
                <Input type="number" inputMode="numeric" readOnly={itemsCount > 1} aria-invalid={!!errors.qty} className={`${errors.qty ? 'border-danger ring-1 ring-danger/30' : ''} ${itemsCount > 1 ? 'bg-surface-dim' : ''}`} {...register('qty')} />
                <FieldError error={errors.qty} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Срок сдачи <span className="text-danger">*</span></label>
                <Input type="date" aria-invalid={!!errors.deadline} className={errors.deadline ? 'border-danger ring-1 ring-danger/30' : ''} {...register('deadline')} />
                <FieldError error={errors.deadline} />
              </div>
            </div>

            {/* Кол-во видов изделий (R8.3 серии 25.05) */}
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="items_count">
                Кол-во видов изделий
                <FromCalc show={isPrefilled('variants')} />
              </label>
              <select
                id="items_count"
                value={itemsCount}
                onChange={(e) => updateItemsCount(e.target.value)}
                className={SELECT_CLASS}
              >
                {Array.from({ length: MAX_ORDER_ITEMS }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              {itemsCount > 1 && (
                <p className="text-xs text-text-muted mt-1">
                  Каждый вид со своим тиражом; размер — общий, если не указан свой. Расход и тех-карта учитывают все виды.
                </p>
              )}
            </div>

            {/* Виды изделий (R25.4 ТЗ 4.6): размер по умолчанию общий, тираж — свой */}
            {itemsCount > 1 && (
              <div className="space-y-2 p-3 rounded-xl border border-border bg-surface-dim">
                <p className="text-sm font-medium">Виды изделий</p>
                {variants.map((it, i) => (
                  <div key={i} className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs text-text-muted mb-0.5">Вид {i + 1} · Ширина, мм</label>
                      <Input
                        type="number" inputMode="numeric" min="1"
                        placeholder={String(Number(widthMm) || '')}
                        value={it.width_mm}
                        onChange={(e) => updateVariant(i, 'width_mm', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-text-muted mb-0.5">Длина, мм</label>
                      <Input
                        type="number" inputMode="numeric" min="1"
                        placeholder={String(Number(heightMm) || '')}
                        value={it.height_mm}
                        onChange={(e) => updateVariant(i, 'height_mm', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-text-muted mb-0.5">Тираж, шт</label>
                      <Input
                        type="number" inputMode="numeric" min="1"
                        value={it.qty}
                        onChange={(e) => updateVariant(i, 'qty', e.target.value)}
                      />
                    </div>
                  </div>
                ))}
                <p className="text-sm font-medium pt-1">Итого: {variantsTotal} шт</p>
              </div>
            )}

            {/* Стикеров в паке (только для пака) + R19 типы форм для 3D-пака */}
            {isStickerpack && (
              <div className="space-y-2">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {isStickerpack3D ? 'Кол-во стандартных стикеров' : 'Стикеров в паке'}
                  </label>
                  <Input type="number" inputMode="numeric" min="0" {...register('stickers_per_pack')} />
                </div>
                {isStickerpack3D && (
                  <div className="space-y-2 p-3 rounded-xl border border-border bg-surface-dim">
                    {stickerTypes.map((t, i) => (
                      <div key={i} className="grid grid-cols-[1fr_84px_auto] gap-2 items-end">
                        <div>
                          <label className="block text-xs text-text-muted mb-0.5">Тип стикера</label>
                          <select
                            value={t.shape}
                            onChange={(e) => updateStickerType(i, 'shape', e.target.value)}
                            className="w-full rounded-lg border border-border bg-surface px-2 py-2.5 text-sm min-h-[44px]"
                          >
                            {Object.entries(STICKER_SHAPES).filter(([k]) => k !== 'standard').map(([k, s]) => (
                              <option key={k} value={k}>{s.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-text-muted mb-0.5">Номер</label>
                          <Input
                            type="number" inputMode="numeric" min="1"
                            value={t.number}
                            onChange={(e) => updateStickerType(i, 'number', e.target.value)}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeStickerType(i)}
                          className="min-h-[44px] px-3 text-text-muted hover:text-danger"
                          title="Удалить"
                        >✕</button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addStickerType(standardPerPack)}
                      className="text-sm text-accent hover:text-accent/80"
                    >
                      + Добавить тип стикеров
                    </button>
                    {(validStickerTypes.length > 0 || standardPerPack > 0) && (
                      <p className="text-xs text-text-muted">
                        Итого в паке: {standardPerPack + validStickerTypes.length} стикеров
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* R19.2: форма одиночного 3D-стикера */}
            {isSticker3D && (
              <div>
                <label className="block text-sm font-medium mb-1">Тип стикера</label>
                <select
                  value={stickerShape}
                  onChange={(e) => { setStickerShape(e.target.value); setExtraDirty(true) }}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm min-h-[44px]"
                >
                  {Object.entries(STICKER_SHAPES).map(([k, s]) => (
                    <option key={k} value={k}>{s.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Плёнка + Ламинация/перенос на монтаж.
                R23.3 (ТЗ 23.07 Фаза 8.4): для stickerpack3D тоже ОДНА плёнка
                (раньше были отдельные «Плёнка фонов» + «Плёнка стикеров»). */}
            {!isSubcontract && (
            <div className="grid grid-cols-2 gap-3">
              <FilmSelect
                label={<>Плёнка *<FromCalc show={isPrefilled('film_material_id')} /></>}
                id="film_type"
                value={watch('film_material_id') || filmType}
                onChange={({ materialId, code }) => {
                  setValue('film_material_id', materialId, { shouldDirty: true })
                  if (code) setValue('film_type', code, { shouldDirty: true })
                }}
                expected={filmType ? expectedByCode[filmType] : undefined}
                includeOutOfStock
              />
              <LaminationSelect
                label={<>Ламинация<FromCalc show={isPrefilled('lam_material_id')} /></>}
                value={watch('lam_material_id') || lamType}
                onChange={({ materialId, code }) => {
                  setValue('lam_material_id', materialId, { shouldDirty: true })
                  setValue('lam_type', code || '', { shouldDirty: true })
                }}
                expected={lamType ? expectedByCode[lamType] : undefined}
                excludeCodes={LAMINATION_FORM_EXCLUDE_CODES}
              />
            </div>
            )}

            {/* R25.4 (ТЗ 4.3): монтажная плёнка — отдельно от ламинации */}
            {!isSubcontract && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <label className="flex items-center gap-2 min-h-[44px] px-3 rounded-lg border border-border cursor-pointer hover:bg-surface-2">
                  <input type="checkbox" {...register('needs_montage_film')} className="w-5 h-5 rounded border-border text-accent focus:ring-accent" />
                  <span className="text-sm">Монтажная плёнка<FromCalc show={isPrefilled('needs_montage_film')} /></span>
                </label>
                {needsMontageFilm && (
                  <MontageFilmSelect
                    value={montageMaterialId}
                    onChange={({ materialId }) => setValue('montage_material_id', materialId, { shouldDirty: true })}
                    expected={forecastRows.find((r) => r.key === 'montage')?.expected}
                  />
                )}
              </div>
            )}

            {/* R25.7B (ТЗ 7.5): дополнительные материалы по категориям склада */}
            {extraCategories.length > 0 && (
              <ExtraMaterialsFields
                extraCategories={extraCategories}
                materials={materials}
                value={extraSelection}
                onChange={(next) => { setExtraSelection(next); setExtraDirty(true) }}
              />
            )}

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
                  <span className="text-sm">Срочный заказ<FromCalc show={isPrefilled('is_urgent')} /></span>
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
                  <FromCalc show={isPrefilled('bopp_bag')} />
                </span>
              </label>
              <div>
                <label className="block text-sm font-medium mb-1">Дизайн макета<FromCalc show={isPrefilled('design_status')} /></label>
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
              <span className="text-sm">Партнёрский (-25%)<FromCalc show={isPrefilled('is_partner')} /></span>
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
              <label className="block text-sm font-medium mb-1">Стоимость (бюджет), руб. <span className="text-danger">*</span><FromCalc show={isPrefilled('price_final')} /></label>
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
            filmTypeStickers={filmTypeStickers}
            lamType={lamType}
            boppBag={boppBag}
            items={forecastItems}
            needsMontageFilm={needsMontageFilm}
            montageMaterialId={montageMaterialId}
            isSubcontract={isSubcontract}
            extraRows={extraForecastRows}
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

        {/* Submit — sticky, spans both columns. R25.6: без отрицательных отступов
            (в попапе они вылезали за край окна): полоса по ширине формы, фон
            сплошной. На странице с sm+ — обычный блок, в попапе — закреплена всегда. */}
        <div className={`lg:col-span-2 sticky bottom-0 z-10 flex gap-3 rounded-xl border border-border bg-surface/95 backdrop-blur-sm p-3 ${
          variant === 'modal' ? '' : 'sm:static sm:border-0 sm:bg-transparent sm:backdrop-blur-none sm:p-0 sm:pt-2'
        }`}>
          <Button type="submit" loading={submitting} className="flex-1 sm:flex-none">Создать заказ</Button>
          <Button type="button" variant="secondary" onClick={() => onCancel?.()} className="flex-1 sm:flex-none">Отмена</Button>
        </div>
      </form>

      <ConfirmDialog
        isOpen={!!pendingShortageValues}
        onClose={() => setPendingShortageValues(null)}
        onConfirm={confirmAndSubmit}
        title="На складе не хватает материалов"
        message={
          'Заявленных материалов сейчас недостаточно:\n\n' +
          shortages.map((s) => `• ${s.label}: на складе ${s.stock.toFixed(1)} ${s.unit}, прогноз ${s.expected.toFixed(1)} ${s.unit} — не хватает ${s.missing.toFixed(1)} ${s.unit}`).join('\n') +
          '\n\nСоздать заказ всё равно?'
        }
        confirmText="Создать всё равно"
        variant="warning"
      />
    </div>
  )
}
