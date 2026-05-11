import { createClient } from '@supabase/supabase-js'

// DELETE /api/orders/delete
// Body: { orderId }
// Requires: caller must be authenticated admin
// Удаляет заказ из k24_orders. FK ON DELETE CASCADE снимает:
//   k24_order_status_history, k24_order_comments, k24_order_attachments,
//   k24_production_logs, k24_order_audit, k24_pack_designs.
// FK без ON DELETE (k24_integration_log.order_id, k24_material_transactions.order_id)
// перед удалением обнуляются — историю списаний материалов терять нельзя.
// Складские остатки возвращаются компенсационными транзакциями (по материалу
// суммируем delta списаний этого заказа и применяем обратную).
// Файлы attachments удаляются из storage bucket 'order-files'.

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

    const { data: orderRow } = await supabase
      .from('k24_orders')
      .select('number')
      .eq('id', orderId)
      .single()
    const orderNo = orderRow?.number ?? '?'

    // 1) Soft-delete production_logs заказа — триггер deduct_materials_from_log
    //    сам вернёт стоки по плёнке / ламинации / смоле и запишет в историю.
    //    Если бы мы пошли в обход (cascade DELETE), триггер всё равно сработал бы
    //    на DELETE и попытался бы вставить транзакцию с order_id текущего заказа,
    //    что нарушило бы FK на момент удаления самого заказа.
    await supabase
      .from('k24_production_logs')
      .update({ deleted_at: new Date().toISOString() })
      .eq('order_id', orderId)
      .is('deleted_at', null)

    // 2) Краска идёт мимо production_logs (auto_deduct_materials на advance в 'print').
    //    Триггер её не вернёт — компенсируем вручную одной агрегированной записью
    //    на материал, чтобы остатки сошлись.
    const { data: inkTxs } = await supabase
      .from('k24_material_transactions')
      .select('material_id, delta, reason')
      .eq('order_id', orderId)
      .in('reason', ['Авто: печать заказа (краска)', 'Авто: печать заказа'])

    const sumByMaterial = new Map()
    for (const t of inkTxs || []) {
      if (!t.material_id || t.delta == null) continue
      sumByMaterial.set(t.material_id, (sumByMaterial.get(t.material_id) || 0) + Number(t.delta))
    }

    for (const [materialId, sumDelta] of sumByMaterial.entries()) {
      if (!sumDelta) continue
      await supabase.from('k24_material_transactions').insert({
        material_id: materialId,
        order_id: null,
        delta: -sumDelta,
        reason: `Возврат при удалении заказа #${orderNo}`,
        created_by: caller.id,
      })
      const { data: m } = await supabase
        .from('k24_materials')
        .select('stock_qty')
        .eq('id', materialId)
        .single()
      if (m) {
        await supabase
          .from('k24_materials')
          .update({ stock_qty: Number(m.stock_qty) - sumDelta, updated_at: new Date().toISOString() })
          .eq('id', materialId)
      }
    }

    // 3) FK без ON DELETE → обнуляем чтобы не упереться в constraint.
    //    Делаем ПОСЛЕ soft-delete, чтобы захватить и вставленные триггером
    //    компенсационные транзакции с order_id текущего заказа.
    await Promise.all([
      supabase.from('k24_integration_log').update({ order_id: null }).eq('order_id', orderId),
      supabase.from('k24_material_transactions').update({ order_id: null }).eq('order_id', orderId),
    ])

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
