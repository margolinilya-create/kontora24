import { createClient } from '@supabase/supabase-js'
import { calculate } from './server-calculator.js'

// Vercel serverless function — receives webhook from Bitrix24
// POST /api/bitrix/incoming

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Service role for server-side operations
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Verify shared secret
  const secret = req.headers['x-bitrix-secret'] || req.query?.token
  if (!secret || secret !== process.env.BITRIX_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
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
    const { data: settingsRow } = await supabase.from('k24_settings').select('value').eq('key', 'calculator').single()
    if (settingsRow?.value) overrides = settingsRow.value

    const is3D = order_type === 'sticker3D' || order_type === 'stickerpack3D'
    const calc = calculate(width_mm, height_mm, qty, order_type, body.need_lam || false, is3D, overrides)

    // Find or create client
    let clientId = null
    if (body.client_name) {
      const { data: existing } = await supabase
        .from('k24_clients')
        .select('id')
        .eq('name', body.client_name)
        .limit(1)
        .single()

      if (existing) {
        clientId = existing.id
      } else {
        const { data: newClient } = await supabase
          .from('k24_clients')
          .insert({ name: body.client_name, phone: body.client_phone || null, email: body.client_email || null })
          .select('id')
          .single()
        if (newClient) clientId = newClient.id
      }
    }

    // Create order
    const { data: order, error } = await supabase
      .from('k24_orders')
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
    await supabase.from('k24_order_status_history').insert({
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
    return res.status(500).json({ error: 'Internal server error' })
  }
}
