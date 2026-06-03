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

  // Verify shared secret
  const secret = req.headers['x-bitrix-secret']
  if (!secret || secret !== process.env.BITRIX_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const { order_number, status, price_final, cost_total, bitrix_deal_id } = req.body

    if (!bitrix_deal_id) {
      return res.status(200).json({ skipped: true, reason: 'No Bitrix deal ID' })
    }

    // Read Bitrix config from settings table
    const { data: settingsRow } = await supabase
      .from('k24_settings')
      .select('value')
      .eq('key', 'bitrix')
      .single()

    const bitrixConfig = settingsRow?.value
    if (!bitrixConfig || !bitrixConfig.enabled || !bitrixConfig.webhookUrl) {
      return res.status(200).json({ skipped: true, reason: 'Bitrix integration not configured or disabled' })
    }

    const bitrix_webhook_url = bitrixConfig.webhookUrl

    // Validate Bitrix webhook URL (prevent SSRF)
    try {
      const parsed = new URL(bitrix_webhook_url)
      const host = parsed.hostname
      // R14.6 SSRF fix: endsWith без точки матчит evilbitrix24.ru / notbitrix24.com.
      const isRu = host === 'bitrix24.ru' || host.endsWith('.bitrix24.ru')
      const isCom = host === 'bitrix24.com' || host.endsWith('.bitrix24.com')
      if (!isRu && !isCom) {
        return res.status(400).json({ error: 'Invalid Bitrix webhook URL' })
      }
      if (parsed.protocol !== 'https:') {
        return res.status(400).json({ error: 'Bitrix webhook URL must use HTTPS' })
      }
    } catch {
      return res.status(400).json({ error: 'Invalid Bitrix webhook URL format' })
    }

    // Map Kontora status to Bitrix stage
    const STAGE_MAP = {
      new: 'NEW',
      design: 'PREPARATION',
      prepress: 'PREPARATION',
      print: 'EXECUTING',
      lamination: 'EXECUTING',
      cutting: 'EXECUTING',
      pouring: 'EXECUTING',
      selection_pouring: 'EXECUTING',
      assembly_3d: 'FINAL_INVOICE',
      packaging: 'FINAL_INVOICE',
      otk: 'FINAL_INVOICE',
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
    return res.status(500).json({ error: 'Internal server error' })
  }
}
