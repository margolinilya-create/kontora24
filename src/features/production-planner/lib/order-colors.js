// R12.3 — стабильный цвет заказа для подсветки в календаре.
// Простой DJB2-хэш от id даёт детерминированный цвет — тот же заказ
// всегда той же палитры. Палитра подобрана под светлую тему дашборда
// (CLAUDE.md UX правила).

const PALETTE = [
  { bg: 'bg-sky-100',     border: 'border-sky-300',     text: 'text-sky-900',     dot: 'bg-sky-500' },
  { bg: 'bg-emerald-100', border: 'border-emerald-300', text: 'text-emerald-900', dot: 'bg-emerald-500' },
  { bg: 'bg-amber-100',   border: 'border-amber-300',   text: 'text-amber-900',   dot: 'bg-amber-500' },
  { bg: 'bg-rose-100',    border: 'border-rose-300',    text: 'text-rose-900',    dot: 'bg-rose-500' },
  { bg: 'bg-violet-100',  border: 'border-violet-300',  text: 'text-violet-900',  dot: 'bg-violet-500' },
  { bg: 'bg-teal-100',    border: 'border-teal-300',    text: 'text-teal-900',    dot: 'bg-teal-500' },
  { bg: 'bg-orange-100',  border: 'border-orange-300',  text: 'text-orange-900',  dot: 'bg-orange-500' },
  { bg: 'bg-fuchsia-100', border: 'border-fuchsia-300', text: 'text-fuchsia-900', dot: 'bg-fuchsia-500' },
]

function hash(str) {
  if (!str) return 0
  let h = 5381
  for (let i = 0; i < str.length; i += 1) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0
  }
  return h
}

export function getOrderPalette(orderId) {
  return PALETTE[hash(orderId) % PALETTE.length]
}
