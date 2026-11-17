// Общие серверные хелперы. Каталог с «_» Vercel не публикует как функции.
import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Сравнение секрета за постоянное время. Хешируем обе строки, чтобы буферы
 * были одной длины (timingSafeEqual требует равных длин и иначе бросает,
 * выдавая длину секрета по времени ответа).
 */
export function secretsEqual(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string' || !provided || !expected) return false
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}
