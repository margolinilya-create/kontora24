import { createClient } from '@supabase/supabase-js'

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Verify shared secret
  const secret = req.headers['x-bitrix-secret']
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
        return res.status(500).json({ error: 'Client lookup failed', detail: searchErr.message })
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
          return res.status(500).json({ error: 'Client create failed', detail: insertErr.message })
        }
        clientId = newClient.id
      }
    }

    // Create order (no price calculation — prices managed externally)
    const { data: order, error } = await supabase
      .from('k24_orders')
      .insert({
        order_type,
        width_mm: Number(width_mm),
        height_mm: Number(height_mm),
        qty: Number(qty),
        design_variants: body.design_variants || 1,
        need_lam: body.need_lam || false,
        lam_type: body.lam_type || null,
        client_id: clientId,
        deadline: body.deadline || null,
        priority: body.priority || 'normal',
        notes: [body.notes, body.bitrix_deal_id ? `Bitrix #${body.bitrix_deal_id}` : null, body.bitrix_url ? body.bitrix_url : null].filter(Boolean).join('\n'),
        bitrix_deal_id: body.bitrix_deal_id || null,
        status: 'new',
      })
      .select()
      .single()

    if (error) throw error

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
