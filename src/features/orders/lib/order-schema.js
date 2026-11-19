import { z } from 'zod'
import { PRODUCT_NAME_MAX } from '@/shared/constants'

// Схема формы создания заказа (CreateOrderForm). Вынесена в lib (ревью R25):
// обязательность цены зависит от права пользователя — тестируется отдельно.

const baseSchema = z.object({
  // Deal
  deal_name: z.string().optional(),
  bitrix_deal_id: z.string().optional(),
  // Ревью R25 (п.8): обязательность цены — в makeOrderSchema (только когда
  // пользователь видит поле), здесь — только тип.
  price_final: z.preprocess(
    (v) => (v === '' || v == null ? undefined : Number(v)),
    z.number({ invalid_type_error: 'Укажите цену' }).optional(),
  ),
  is_partner: z.boolean().default(false),
  source: z.string().optional(),
  source_referrer: z.string().optional(),
  payment_status: z.string().default('not_paid'),

  // Order
  order_type: z.string().min(1, 'Выберите тип'),
  qty: z.coerce.number().min(1, 'Минимум 1'),
  width_mm: z.coerce.number().min(1, 'Укажите ширину'),
  height_mm: z.coerce.number().min(1, 'Укажите высоту'),
  // R27.2: позиция склада без кода (бумага) — film_type = null.
  film_type: z.string().nullable().default('G'),
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
})

/**
 * Схема формы. requirePrice — цена обязательна (поле видно: право view:finance).
 * Без права поле скрыто — требовать его нельзя, иначе заказ не создать (ревью R25).
 */
export function makeOrderSchema({ requirePrice = true } = {}) {
  return baseSchema.superRefine((v, ctx) => refineOrder(v, ctx, requirePrice))
}

function refineOrder(v, ctx, requirePrice) {
  if (v.price_final != null && v.price_final <= 0) {
    ctx.addIssue({ code: 'custom', path: ['price_final'], message: 'Цена должна быть больше 0' })
  } else if (requirePrice && v.price_final == null) {
    ctx.addIssue({ code: 'custom', path: ['price_final'], message: 'Укажите цену' })
  }
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
}
