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

  // Check env vars
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing env vars: VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    return res.status(500).json({ error: 'Сервер не настроен: отсутствуют переменные окружения' })
  }

  try {
    // Verify caller is admin
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) {
      return res.status(401).json({ error: 'Не авторизован' })
    }

    const { data: userData, error: userError } = await supabase.auth.getUser(token)
    if (userError || !userData?.user) {
      return res.status(401).json({ error: 'Недействительный токен' })
    }
    const caller = userData.user

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

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name },
    })

    if (authError) {
      console.error('Auth createUser error:', authError.message)
      if (authError.message.includes('already been registered') || authError.message.includes('already registered')) {
        return res.status(409).json({ error: 'Пользователь с таким email уже существует' })
      }
      return res.status(400).json({ error: `Ошибка создания пользователя: ${authError.message}` })
    }

    // Update profile with correct role and display_name
    const { error: profileError } = await supabase
      .from('k24_profiles')
      .update({ role, display_name, email })
      .eq('id', authData.user.id)

    if (profileError) {
      // Profile might not exist yet (trigger delay), try upsert
      const { error: upsertError } = await supabase
        .from('k24_profiles')
        .upsert({ id: authData.user.id, role, display_name, email })

      if (upsertError) {
        console.error('Profile upsert error:', upsertError.message)
        // User was created in auth but profile failed — still return success
        // since the trigger will eventually create it
      }
    }

    return res.status(200).json({
      success: true,
      user: { id: authData.user.id, email, display_name, role },
    })
  } catch (err) {
    console.error('User creation error:', err)
    return res.status(500).json({ error: `Ошибка создания пользователя: ${err.message}` })
  }
}
