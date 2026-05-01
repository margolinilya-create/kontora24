import { createClient } from '@supabase/supabase-js'

// POST /api/users/create
// Body: { email, password, display_name, role }
// Requires: caller must be authenticated admin (verified via token)

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const VALID_ROLES = ['admin', 'manager', 'designer', 'printer', 'assembler', 'resin_pourer']

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Verify caller is admin
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return res.status(401).json({ error: 'Не авторизован' })
  }

  const { data: { user: caller } } = await supabase.auth.getUser(token)
  if (!caller) {
    return res.status(401).json({ error: 'Недействительный токен' })
  }

  const { data: callerProfile } = await supabase
    .from('k24_profiles')
    .select('role')
    .eq('id', caller.id)
    .single()

  if (callerProfile?.role !== 'admin') {
    return res.status(403).json({ error: 'Только администратор может создавать пользователей' })
  }

  // Validate input
  const { email, password, display_name, role } = req.body || {}

  if (!email || !password || !display_name || !role) {
    return res.status(400).json({ error: 'Заполните все поля: email, пароль, имя, роль' })
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть минимум 6 символов' })
  }

  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `Недопустимая роль: ${role}` })
  }

  try {
    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name },
    })

    if (authError) {
      if (authError.message.includes('already been registered')) {
        return res.status(409).json({ error: 'Пользователь с таким email уже существует' })
      }
      throw authError
    }

    // Update profile with correct role and display_name
    const { error: profileError } = await supabase
      .from('k24_profiles')
      .update({ role, display_name, email })
      .eq('id', authData.user.id)

    if (profileError) {
      // Profile might not exist yet (trigger delay), try insert
      await supabase
        .from('k24_profiles')
        .upsert({ id: authData.user.id, role, display_name, email })
    }

    return res.status(200).json({
      success: true,
      user: { id: authData.user.id, email, display_name, role },
    })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Ошибка создания пользователя' })
  }
}
