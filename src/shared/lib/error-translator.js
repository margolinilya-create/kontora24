const FALLBACK = { title: 'Что-то пошло не так', message: 'Попробуйте ещё раз.' }

const CYRILLIC_START = /^[А-ЯЁ]/

function getMessage(err) {
  if (err && typeof err === 'object' && typeof err.message === 'string') return err.message
  return ''
}

export function translateError(err) {
  const message = getMessage(err)
  const code = err && typeof err === 'object' ? err.code : undefined
  const status = err && typeof err === 'object' ? err.status : undefined
  const name = err && typeof err === 'object' ? err.name : undefined

  // Case 0 — cyrillic passthrough (own throws)
  if (CYRILLIC_START.test(message)) {
    return { title: 'Ошибка', message }
  }

  // Case 1 — unique violation
  if (code === '23505') {
    return {
      title: 'Уже существует',
      message: 'Запись с такими данными уже есть. Проверьте поля или откройте существующую.',
    }
  }

  // Case 2 — foreign key violation
  if (code === '23503') {
    return {
      title: 'Не удалось сохранить',
      message: 'Связанные данные изменились. Обновите страницу и попробуйте снова.',
    }
  }

  // Case 3 — not null violation
  if (code === '23502') {
    return {
      title: 'Заполните обязательное поле',
      message: 'Проверьте, что все обязательные поля заполнены.',
    }
  }

  // Case 4 — RLS / permission
  if (code === '42501' || code === 'PGRST301' || /row-level security/i.test(message)) {
    return { title: 'Нет прав', message: 'У вас нет прав на это действие.' }
  }

  // Case 4b — protected order columns (триггер k24_protect_order_columns)
  if (/access denied: workers cannot modify protected/i.test(message)) {
    return {
      title: 'Нет прав',
      message: 'Финансы, цена и реквизиты сделки доступны только менеджеру и администратору. Сбросьте эмуляцию роли в сайдбаре и попробуйте снова.',
    }
  }

  // Case 5 — auth expired
  if (status === 401 || /jwt (expired|invalid)/i.test(message) || message === 'Not authenticated') {
    return { title: 'Сессия устарела', message: 'Обновите страницу.', action: 'reauth' }
  }

  // Case 6 — network failure
  if (name === 'TypeError' && /failed to fetch|networkerror/i.test(message)) {
    return {
      title: 'Не удалось отправить',
      message: 'Проверьте интернет и попробуйте ещё раз.',
      action: 'retry',
    }
  }

  // Case 7 — abort
  if (name === 'AbortError') {
    return { title: 'Запрос отменён', message: 'Попробуйте ещё раз.', action: 'retry' }
  }

  // Case 8 — no rows
  if (code === 'PGRST116') {
    return { title: 'Ничего не найдено', message: 'Запись не существует или была удалена.' }
  }

  // Case 9 — payload too large
  if (status === 413 || /payload too large|file size/i.test(message)) {
    return { title: 'Файл слишком большой', message: 'Уменьшите размер и попробуйте снова.' }
  }

  // Case 10 — fallback. Если есть текст ошибки — показываем его, чтобы
  // пользователь имел шанс понять что именно сломалось (вместо вечного
  // «Попробуйте ещё раз»).
  if (message) {
    return { title: 'Что-то пошло не так', message }
  }
  return { ...FALLBACK }
}
