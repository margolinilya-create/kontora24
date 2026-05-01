// Vercel serverless function — called when order status changes
// This sends a webhook back to Bitrix24
// POST /api/bitrix/status-update

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { order_id, order_number, status, price_final, cost_total, bitrix_deal_id } = req.body

    if (!bitrix_deal_id) {
      return res.status(200).json({ skipped: true, reason: 'No Bitrix deal ID' })
    }

    // Read Bitrix config from settings table
    const { data: settingsRow } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'bitrix')
      .single()

    const bitrixConfig = settingsRow?.value
    if (!bitrixConfig || !bitrixConfig.enabled || !bitrixConfig.webhookUrl) {
      return res.status(200).json({ skipped: true, reason: 'Bitrix integration not configured or disabled' })
    }

    const bitrix_webhook_url = bitrixConfig.webhookUrl

    // Map Kontora status to Bitrix stage
    const STAGE_MAP = {
      new: 'NEW',
      design: 'PREPARATION',
      design_done: 'PREPARATION',
      print: 'EXECUTING',
      print_done: 'EXECUTING',
      assembly: 'FINAL_INVOICE',
      done: 'WON',
      cancelled: 'LOSE',
    }

    const stage = STAGE_MAP[status] || 'EXECUTING'

    // Send to Bitrix24
    const response = await fetch(`${bitrix_webhook_url}/crm.deal.update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: bitrix_deal_id,
        fields: {
          STAGE_ID: stage,
          ...(status === 'done' ? {
            UF_COST_TOTAL: cost_total,
            UF_PRICE_FINAL: price_final,
          } : {}),
          COMMENTS: `Kontora24: заказ #${order_number} — ${status}`,
        },
      }),
    })

    const result = await response.json()

    return res.status(200).json({ success: true, bitrix_response: result })
  } catch (err) {
    console.error('Bitrix status update error:', err)
    return res.status(500).json({ error: err.message })
  }
}
