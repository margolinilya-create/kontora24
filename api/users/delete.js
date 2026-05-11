import { createClient } from '@supabase/supabase-js'

// DELETE /api/users/delete
// Body: { userId }
// Requires: caller must be authenticated admin
// Удаляет пользователя из auth.users (триггер каскадом удалит k24_profiles).

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Verify caller is admin
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
    return res.status(403).json({ error: 'Только администратор может удалять пользователей' })
  }

  const { userId } = req.body || {}

  if (!userId) {
    return res.status(400).json({ error: 'userId обязателен' })
  }

  // Запрет на самоудаление — иначе админ может выпилить последний доступ
  if (userId === caller.id) {
    return res.status(400).json({ error: 'Нельзя удалить собственный аккаунт' })
  }

  try {
    // Проверяем что у удаляемого нет связанных заказов / логов с ON DELETE RESTRICT
    // (assigned_to/created_by/worker_id в k24_orders, k24_production_logs, k24_material_transactions
    //  и т.д. — на стороне БД FK уже определяют политику).
    // Также сбросим assigned_to чтобы не упереться в FK RESTRICT, если он есть.
    await supabase
      .from('k24_orders')
      .update({ assigned_to: null })
      .eq('assigned_to', userId)

    // Удаление из auth.users — каскад на k24_profiles через FK ON DELETE CASCADE
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId)
    if (deleteError) throw deleteError

    // Safety: явно удаляем profile если каскад не сработал
    await supabase.from('k24_profiles').delete().eq('id', userId)

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('User delete error:', err)
    const isFk = /violates foreign key|is still referenced/i.test(err?.message || '')
    return res.status(isFk ? 409 : 500).json({
      error: isFk
        ? 'У пользователя есть связанные данные (заказы/логи). Сначала переназначьте их.'
        : 'Ошибка удаления пользователя',
      detail: err?.message,
    })
  }
}
