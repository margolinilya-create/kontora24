// Клиентский UUID v4 для идемпотентных insert'ов: PK лога выдаётся на
// клиенте до отправки, ретрай с тем же id упирается в 23505 вместо создания
// дубля (VariantLogForm / PackDesignsForm). Фолбэк через getRandomValues
// покрывает старые WebView без randomUUID; Math.random для PK не годится
// (недостаточная энтропия). Совсем без crypto возвращаем null — вызывающая
// сторона идёт без клиентского PK, как до фикса.
export function generateUuid() {
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID()
  if (c?.getRandomValues) {
    const b = c.getRandomValues(new Uint8Array(16))
    b[6] = (b[6] & 0x0f) | 0x40 // version 4
    b[8] = (b[8] & 0x3f) | 0x80 // variant 10xx
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
  }
  return null
}
