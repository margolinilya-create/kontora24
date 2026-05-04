import { createClient } from '@supabase/supabase-js'

// PUT /api/users/update
// Body: { userId, display_name?, email?, role?, approved?, password? }
// Requires: caller must be authenticated admin

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const VALID_ROLES = ['admin', 'manager', 'designer', 'printer', 'post_printer']

export default async function handler(req, res) {
  if (req.method !== 'PUT') {
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
    return res.status(403).json({ error: 'Только администратор может редактировать пользователей' })
  }

  const { userId, display_name, email, role, approved, password } = req.body || {}

  if (!userId) {
    return res.status(400).json({ error: 'userId обязателен' })
  }

  // Validate role if provided
  if (role !== undefined && !VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `Недопустимая роль: ${role}` })
  }

  // Validate password if provided
  if (password !== undefined && password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть минимум 6 символов' })
  }

  // Validate display_name if provided
  if (display_name !== undefined && !display_name.trim()) {
    return res.status(400).json({ error: 'Имя не может быть пустым' })
  }

  try {
    // Update auth user fields (email, password, metadata)
    const authUpdates = {}
    if (email) authUpdates.email = email
    if (password) authUpdates.password = password
    if (display_name) authUpdates.user_metadata = { display_name }

    if (Object.keys(authUpdates).length > 0) {
      const { error: authError } = await supabase.auth.admin.updateUserById(userId, authUpdates)
      if (authError) {
        if (authError.message.includes('already been registered')) {
          return res.status(409).json({ error: 'Пользователь с таким email уже существует' })
        }
        throw authError
      }
    }

    // Update k24_profiles
    const profileUpdates = {}
    if (display_name) profileUpdates.display_name = display_name.trim()
    if (email) profileUpdates.email = email
    if (role) profileUpdates.role = role
    if (approved !== undefined) profileUpdates.approved = approved

    if (Object.keys(profileUpdates).length > 0) {
      const { error: profileError } = await supabase
        .from('k24_profiles')
        .update(profileUpdates)
        .eq('id', userId)

      if (profileError) throw profileError
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('User update error:', err)
    return res.status(500).json({ error: 'Ошибка обновления пользователя' })
  }
}
