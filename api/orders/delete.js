import { createClient } from '@supabase/supabase-js'

// DELETE /api/orders/delete
// Body: { orderId }
// Requires: caller must be authenticated admin (повторная проверка в RPC).
//
// Архитектура (миграция 028):
// - Файлы storage чистим до RPC. Если RPC потом упадёт — останутся orphan-файлы,
//   но это лучше чем половинчатое удаление БД.
// - Сам каскад делает delete_order_cascade(p_order_id, p_caller) одной транзакцией:
//   soft-delete production_logs → триггер вернёт стоки → компенсация краски →
//   обнуление FK без CASCADE → DELETE заказа. При любом фейле — полный откат.

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
    // 1) Storage — чистим файлы до RPC (необратимо при фейле RPC; orphan-файлы потом подчистятся)
    const { data: attachments } = await supabase
      .from('k24_order_attachments')
      .select('file_path')
      .eq('order_id', orderId)

    const filePaths = (attachments || []).map((a) => a.file_path).filter(Boolean)
    if (filePaths.length > 0) {
      await supabase.storage.from('order-files').remove(filePaths)
    }

    // 2) Атомарный каскад в одной транзакции
    const { data: result, error: rpcError } = await supabase.rpc('delete_order_cascade', {
      p_order_id: orderId,
      p_caller: caller.id,
    })

    if (rpcError) throw rpcError

    if (result?.error) {
      const isFk = result.error === 'fk'
      return res.status(isFk ? 409 : 500).json({
        error: isFk
          ? 'Не удалось удалить — у заказа есть связанные записи, не покрытые каскадом.'
          : result.error,
        detail: result.detail,
      })
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('Order delete error:', err)
    return res.status(500).json({
      error: 'Ошибка удаления заказа',
      detail: err?.message,
    })
  }
}
