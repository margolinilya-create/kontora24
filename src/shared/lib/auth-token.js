import { supabase } from './supabase'

// Возвращает свежий access_token для запросов к /api/*.
// Если до истечения <60с или сессия уже истекла — делает refresh.
// При отсутствии сессии или провале refresh бросает понятную ошибку.
export async function getFreshAccessToken() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Сессия истекла. Войдите снова.')

  const expiresAtMs = (session.expires_at ?? 0) * 1000
  const needsRefresh = !expiresAtMs || expiresAtMs - Date.now() < 60_000

  if (needsRefresh) {
    const { data, error } = await supabase.auth.refreshSession()
    if (error || !data?.session) throw new Error('Сессия истекла. Войдите снова.')
    return data.session.access_token
  }

  return session.access_token
}
