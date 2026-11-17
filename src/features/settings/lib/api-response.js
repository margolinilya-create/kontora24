/**
 * Безопасный разбор ответа /api/*: сервер или прокси Vercel может вернуть
 * HTML/пустое тело (502, 504, страница ошибки) — res.json() тогда падает
 * с невнятным «Unexpected token <». Возвращаем {} при нечитаемом теле.
 */
export async function readApiResponse(res) {
  const text = await res.text().catch(() => '')
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** Человеческое сообщение об ошибке API пользователей (без внутренних деталей). */
export function apiErrorMessage(res, body, fallback) {
  // Сервер отдаёт готовые русские фразы; английские/технические — не показываем.
  if (typeof body?.error === 'string' && /^[А-ЯЁ]/.test(body.error)) return body.error
  if (res.status === 401) return 'Сессия истекла. Войдите снова.'
  if (res.status === 403) return 'Недостаточно прав для этого действия.'
  if (res.status === 404) return 'Пользователь не найден.'
  if (res.status >= 500) return 'Сервер временно недоступен. Попробуйте позже.'
  return fallback
}
