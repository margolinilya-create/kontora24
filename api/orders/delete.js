import { createClient } from '@supabase/supabase-js'

// DELETE /api/orders/delete
// Body: { orderId }
// Requires: caller must be authenticated admin
// Удаляет заказ из k24_orders. FK ON DELETE CASCADE снимает:
//   k24_order_status_history, k24_order_comments, k24_order_attachments,
//   k24_production_logs, k24_order_audit, k24_pack_designs.
// integration_log.order_id (без ON DELETE) перед удалением обнуляется,
// файлы attachments удаляются из storage bucket 'order-files'.

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return res.status(401).json({ error: 'Не авторизован' })
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  const caller = userData?.user
  if (userError || !caller) {
    return res.status(401).json({ error: 'Недействительный токен' })
  }

  const { data: callerProfile } = await supabase
    .from('k24_profiles')
    .select('role')
    .eq('id', caller.id)
    .single()

  if (callerProfile?.role !== 'admin') {
    return res.status(403).json({ error: 'Только администратор может удалять заказы' })
  }

  const { orderId } = req.body || {}

  if (!orderId) {
    return res.status(400).json({ error: 'orderId обязателен' })
  }

  try {
    // Файлы вложений — собираем пути и удаляем из storage до удаления заказа
    const { data: attachments } = await supabase
      .from('k24_order_attachments')
      .select('file_path')
      .eq('order_id', orderId)

    const filePaths = (attachments || []).map((a) => a.file_path).filter(Boolean)
    if (filePaths.length > 0) {
      // Storage-ошибка не блокирует удаление — orphan-файлы потом подчистятся
      await supabase.storage.from('order-files').remove(filePaths)
    }

    // integration_log.order_id без ON DELETE → обнуляем чтобы не упереться в FK
    await supabase
      .from('k24_integration_log')
      .update({ order_id: null })
      .eq('order_id', orderId)

    // Удаление заказа — каскад на 6 связанных таблиц
    const { error: deleteError } = await supabase
      .from('k24_orders')
      .delete()
      .eq('id', orderId)
    if (deleteError) throw deleteError

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('Order delete error:', err)
    const isFk = /violates foreign key|is still referenced/i.test(err?.message || '')
    return res.status(isFk ? 409 : 500).json({
      error: isFk
        ? 'Не удалось удалить — у заказа есть связанные записи, не покрытые каскадом.'
        : 'Ошибка удаления заказа',
      detail: err?.message,
    })
  }
}
