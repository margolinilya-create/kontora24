// Vercel serverless function — called when order status changes
// This sends a webhook back to Bitrix24
// POST /api/bitrix/status-update

import { createClient } from '@supabase/supabase-js'
import { secretsEqual } from '../_lib/secrets.js'

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
  if (!secretsEqual(secret, process.env.BITRIX_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const { order_number, status, price_final, cost_total, bitrix_deal_id } = req.body || {}

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
      // R25.1 (ТЗ 17.11 Фаза 1): этапы маршрута v2.
      awaiting_payment: 'PREPAYMENT_INVOICE',
      design_approval: 'PREPARATION',
      sample_layout: 'PREPARATION',
      sample_print: 'PREPARATION',
      color_approval: 'PREPARATION',
      subcontract: 'EXECUTING',
      awaiting_pickup: 'FINAL_INVOICE',
      delivery: 'FINAL_INVOICE',
      design: 'PREPARATION',
      prepress: 'PREPARATION',
      print: 'EXECUTING',
      lamination: 'EXECUTING',
      cutting: 'EXECUTING',
      selection: 'EXECUTING',
      pouring: 'EXECUTING',
      drying: 'EXECUTING',
      selection_pouring: 'EXECUTING', // legacy — историческая совместимость
      assembly_3d: 'FINAL_INVOICE',
      packaging: 'FINAL_INVOICE',
      otk: 'FINAL_INVOICE',
      done: 'WON',
      cancelled: 'LOSE',
    }

    const stage = STAGE_MAP[status] || 'EXECUTING'

    // Send to Bitrix24.
    // redirect: 'error' — проверка хоста выше не защищает от 30x на внутренний
    // адрес (SSRF через редирект): любой редирект прерывает запрос.
    const response = await fetch(`${bitrix_webhook_url}/crm.deal.update`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
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

    const text = await response.text().catch(() => '')
    let result = null
    try { result = text ? JSON.parse(text) : null } catch { result = null }

    if (!response.ok) {
      console.error('[bitrix/status-update] Bitrix responded', response.status, text.slice(0, 500))
      return res.status(502).json({ error: 'Bitrix request failed' })
    }

    return res.status(200).json({ success: true, bitrix_response: result })
  } catch (err) {
    console.error('Bitrix status update error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
