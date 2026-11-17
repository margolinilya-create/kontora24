import { createClient } from '@supabase/supabase-js'
import { secretsEqual } from '../_lib/secrets.js'

// Vercel serverless function — receives webhook from Bitrix24
// POST /api/bitrix/incoming
//
// Политика обязательных полей (R-апдейт 12.05):
// Ручное создание через CreateOrderPage требует price_final, client_name, deadline.
// Webhook ВПРАВЕ создавать заказ БЕЗ этих полей — Bitrix часто присылает
// неполные данные. Менеджер увидит такой заказ в списке с бэйджем
// «Требует дозаполнения» и сможет дозаполнить через AdminOrderEditor.
// TODO: добавить is_draft флаг или вычислять «черновик» по наличию полей.

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Service role for server-side operations
)

const LAM_TYPES = ['matte', 'glossy', 'transfer']
const PRIORITIES = ['urgent', 'normal', 'low', 'high']
const MAX = { short: 64, name: 200, phone: 50, url: 500, notes: 5000 }

const isNum = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v))
const isStr = (v, max) => typeof v === 'string' && v.length <= max
const optional = (v) => v === undefined || v === null || v === ''

// Поле → валидатор (true = ок). Поля вне списка отклоняются.
const FIELD_RULES = {
  order_type: (v) => isStr(v, MAX.short) && v.trim() !== '',
  width_mm: (v) => isNum(v) && Number(v) > 0 && Number(v) <= 100000,
  height_mm: (v) => isNum(v) && Number(v) > 0 && Number(v) <= 100000,
  qty: (v) => isNum(v) && Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 10_000_000,
  client_name: (v) => optional(v) || isStr(v, MAX.name),
  client_phone: (v) => optional(v) || isStr(v, MAX.phone),
  client_email: (v) => optional(v) || isStr(v, MAX.name),
  design_variants: (v) => optional(v) || (isNum(v) && Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 100),
  need_lam: (v) => optional(v) || typeof v === 'boolean',
  lam_type: (v) => optional(v) || LAM_TYPES.includes(v),
  deadline: (v) => optional(v) || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))),
  priority: (v) => optional(v) || PRIORITIES.includes(v),
  notes: (v) => optional(v) || isStr(v, MAX.notes),
  bitrix_deal_id: (v) => optional(v) || isStr(v, MAX.short) || (typeof v === 'number' && Number.isFinite(v)),
  bitrix_url: (v) => optional(v) || (isStr(v, MAX.url) && /^https:\/\//i.test(v)),
}

/**
 * Базовая проверка тела вебхука: типы, длины, отказ на неизвестных полях.
 * @returns {string|null} текст ошибки или null
 */
export function validateIncomingBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Invalid body'
  const unknown = Object.keys(body).filter((k) => !(k in FIELD_RULES))
  if (unknown.length > 0) return `Unknown fields: ${unknown.slice(0, 10).join(', ')}`
  const { order_type, width_mm, height_mm, qty } = body
  if (!order_type || !width_mm || !height_mm || !qty) {
    return 'Missing required fields: order_type, width_mm, height_mm, qty'
  }
  const invalid = Object.keys(FIELD_RULES).filter((k) => k in body && !FIELD_RULES[k](body[k]))
  if (invalid.length > 0) return `Invalid fields: ${invalid.join(', ')}`
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Verify shared secret
  const secret = req.headers['x-bitrix-secret']
  if (!secretsEqual(secret, process.env.BITRIX_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const body = req.body

    const validationError = validateIncomingBody(body)
    if (validationError) {
      return res.status(400).json({ error: validationError })
    }
    const { order_type, width_mm, height_mm, qty } = body

    // R25.7A: order_type ссылается на реестр k24_order_types (FK, миграция 103).
    // Неизвестный тип из Bitrix не роняет создание заказа: пишем NULL (менеджер
    // выберет тип в AdminOrderEditor) + предупреждение в k24_integration_log.
    // Ошибка самого поиска — оставляем тип как пришёл (поведение до R25.7).
    let resolvedType = order_type
    let unknownType = null
    const { data: typeRow, error: typeErr } = await supabase
      .from('k24_order_types')
      .select('key')
      .eq('key', String(order_type))
      .maybeSingle()
    if (typeErr) {
      console.error('[bitrix/incoming] order type lookup failed:', typeErr)
    } else if (!typeRow) {
      unknownType = String(order_type)
      resolvedType = null
    }

    // Find or create client. RLS/FK ошибки больше не глотаем —
    // PGRST116 (no rows) — нормальный случай, остальное — действительная проблема.
    let clientId = null
    if (body.client_name) {
      const { data: existing, error: searchErr } = await supabase
        .from('k24_clients')
        .select('id')
        .eq('name', body.client_name)
        .limit(1)
        .maybeSingle()

      if (searchErr && searchErr.code !== 'PGRST116') {
        console.error('[bitrix/incoming] client search failed:', searchErr)
        return res.status(500).json({ error: 'Client lookup failed' })
      }

      if (existing) {
        clientId = existing.id
      } else {
        const { data: newClient, error: insertErr } = await supabase
          .from('k24_clients')
          .insert({ name: body.client_name, phone: body.client_phone || null, email: body.client_email || null })
          .select('id')
          .single()
        if (insertErr) {
          console.error('[bitrix/incoming] client insert failed:', insertErr)
          return res.status(500).json({ error: 'Client create failed' })
        }
        clientId = newClient.id
      }
    }

    // Create order (no price calculation — prices managed externally)
    const { data: order, error } = await supabase
      .from('k24_orders')
      .insert({
        order_type: resolvedType,
        width_mm: Number(width_mm),
        height_mm: Number(height_mm),
        qty: Number(qty),
        design_variants: Number(body.design_variants) || 1,
        need_lam: body.need_lam || false,
        lam_type: body.lam_type || null,
        client_id: clientId,
        deadline: body.deadline || null,
        priority: body.priority || 'normal',
        notes: [body.notes, body.bitrix_deal_id ? `Bitrix #${body.bitrix_deal_id}` : null, body.bitrix_url ? body.bitrix_url : null].filter(Boolean).join('\n'),
        bitrix_deal_id: body.bitrix_deal_id != null && body.bitrix_deal_id !== '' ? String(body.bitrix_deal_id) : null,
        status: 'new',
      })
      .select()
      .single()

    if (error) throw error

    if (unknownType) {
      const { error: logErr } = await supabase.from('k24_integration_log').insert({
        direction: 'incoming',
        endpoint: 'bitrix/incoming',
        status: 'warning',
        error_message: `Неизвестный тип заказа «${unknownType}» — заказ создан без типа, выберите тип в редакторе заказа.`,
        payload: { order_type: unknownType, bitrix_deal_id: body.bitrix_deal_id || null },
        order_id: order.id,
      })
      if (logErr) console.error('[bitrix/incoming] integration log insert failed:', logErr)
    }

    // Log status — фейл в history ломает аудит-цепочку, не глотаем молча.
    const { error: historyErr } = await supabase.from('k24_order_status_history').insert({
      order_id: order.id, from_status: null, to_status: 'new', changed_by: null,
    })
    if (historyErr) {
      console.error('[bitrix/incoming] status history insert failed:', historyErr)
      // Заказ уже создан — возвращаем success, но логируем ошибку чтобы можно было
      // допилить аудит вручную (не вызываем 500 чтобы Bitrix не зашёл в retry-петлю).
    }

    return res.status(200).json({
      success: true,
      order_id: order.id,
      order_number: order.number,
      kontora_url: `${process.env.VITE_SUPABASE_URL ? 'https://kontora24.vercel.app' : 'http://localhost:5173'}/orders/${order.id}`,
    })
  } catch (err) {
    console.error('Bitrix webhook error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
