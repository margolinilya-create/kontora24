import { createClient } from '@supabase/supabase-js'

// Vercel serverless function — receives webhook from Bitrix24
// POST /api/bitrix/incoming

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Service role for server-side operations
)

// Calculator logic (duplicated minimal version for server-side)
const DEFAULTS = {
  printWidth: 1230, heightMargin: 30, gap: 6, cutSpeed: 200,
  lamSpeed: 200, resinPerCm2: 0.1444, resinPourTime: 1200,
  laborCostPerHour: 500, filmPricePerM2: 180, inkPricePerM2: 120,
  resinPricePerG: 1.2, lamPricePerM2: 120,
}

const MARKUPS = {
  sticker_cut: 4.0, sticker_kiss: 4.0, stickerpack: 4.0,
  sticker3D: 4.5, stickerpack3D: 4.5, rect: 4.0, big: 4.0,
}

const DISCOUNTS = [
  { min: 1, max: 9, pct: 0 }, { min: 10, max: 24, pct: 0.05 },
  { min: 25, max: 49, pct: 0.10 }, { min: 50, max: 99, pct: 0.15 },
  { min: 100, max: 199, pct: 0.20 }, { min: 200, max: 499, pct: 0.25 },
  { min: 500, max: Infinity, pct: 0.30 },
]

function calculate(width, height, qty, orderType, needLam, is3D, overrides = {}) {
  const C = { ...DEFAULTS, ...overrides }
  const w = Math.max(0, Number(width) || 0)
  const h = Math.max(0, Number(height) || 0)
  const q = Math.max(0, Math.floor(Number(qty) || 0))

  const itemsPerSheet = Math.floor(C.printWidth / (w + C.gap))
  const sheets = Math.ceil(q / Math.max(itemsPerSheet, 1))
  const filmM2 = sheets * (C.printWidth * (h + C.heightMargin)) / 1e6
  const inkM2 = (q * w * h) / 1e6
  const lamM2 = needLam ? filmM2 : 0
  const cutTimeH = (2 * (w + h) * q) / (C.cutSpeed * 1000) / 3.6
  const lamTimeH = needLam ? (filmM2 * 1e6) / (C.lamSpeed * C.printWidth) / 3600 : 0
  const resinG = is3D ? (w * h / 100) * C.resinPerCm2 * q : 0
  const resinTimeH = is3D ? (sheets * C.resinPourTime) / 3600 : 0

  const costMaterials = filmM2 * C.filmPricePerM2 + inkM2 * C.inkPricePerM2 + lamM2 * C.lamPricePerM2 + resinG * C.resinPricePerG
  const totalHours = cutTimeH + lamTimeH + resinTimeH + 0.5
  const costLabor = totalHours * C.laborCostPerHour
  const costTotal = costMaterials + costLabor

  const markup = MARKUPS[orderType] ?? 4.0
  const discount = (DISCOUNTS.find((d) => q >= d.min && q <= d.max) || { pct: 0 }).pct
  const priceFinal = costTotal * markup * (1 - discount)
  const pricePerUnit = q > 0 ? priceFinal / q : 0
  const prodDays = Math.max(1, Math.ceil(totalHours / 8))

  return {
    cost_materials: Math.round(costMaterials),
    cost_labor: Math.round(costLabor),
    cost_total: Math.round(costTotal),
    markup, discount_pct: discount,
    price_final: Math.round(priceFinal),
    price_per_unit: Math.round(pricePerUnit),
    prod_days: prodDays,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = req.body

    // Validate required fields
    const { order_type, width_mm, height_mm, qty } = body
    if (!order_type || !width_mm || !height_mm || !qty) {
      return res.status(400).json({ error: 'Missing required fields: order_type, width_mm, height_mm, qty' })
    }

    // Try to load settings from DB
    let overrides = {}
    const { data: settingsRow } = await supabase.from('settings').select('value').eq('key', 'calculator').single()
    if (settingsRow?.value) overrides = settingsRow.value

    const is3D = order_type === 'sticker3D' || order_type === 'stickerpack3D'
    const calc = calculate(width_mm, height_mm, qty, order_type, body.need_lam || false, is3D, overrides)

    // Find or create client
    let clientId = null
    if (body.client_name) {
      const { data: existing } = await supabase
        .from('clients')
        .select('id')
        .eq('name', body.client_name)
        .limit(1)
        .single()

      if (existing) {
        clientId = existing.id
      } else {
        const { data: newClient } = await supabase
          .from('clients')
          .insert({ name: body.client_name, phone: body.client_phone || null, email: body.client_email || null })
          .select('id')
          .single()
        if (newClient) clientId = newClient.id
      }
    }

    // Create order
    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        order_type,
        width_mm: Number(width_mm),
        height_mm: Number(height_mm),
        qty: Number(qty),
        design_variants: body.design_variants || 1,
        need_lam: body.need_lam || false,
        client_id: clientId,
        deadline: body.deadline || null,
        notes: [body.notes, body.bitrix_deal_id ? `Bitrix #${body.bitrix_deal_id}` : null, body.bitrix_url ? body.bitrix_url : null].filter(Boolean).join('\n'),
        status: 'new',
        ...calc,
      })
      .select()
      .single()

    if (error) throw error

    // Log status
    await supabase.from('order_status_history').insert({
      order_id: order.id, from_status: null, to_status: 'new', changed_by: null,
    })

    return res.status(200).json({
      success: true,
      order_id: order.id,
      order_number: order.number,
      price_final: order.price_final,
      price_per_unit: order.price_per_unit,
      prod_days: order.prod_days,
      kontora_url: `${process.env.VITE_SUPABASE_URL ? 'https://kontora24.vercel.app' : 'http://localhost:5173'}/orders/${order.id}`,
    })
  } catch (err) {
    console.error('Bitrix webhook error:', err)
    return res.status(500).json({ error: err.message })
  }
}
