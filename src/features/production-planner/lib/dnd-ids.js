// R12.5 — стабильные ID для @dnd-kit. Чипы (`chip::orderId::stage`)
// и ячейки (`cell::bucket::date`). Парсеры возвращают null для чужих
// ID — так фильтруем onDragEnd когда over=null или active с другого
// контекста.

export function makeDragId(orderId, stage) {
  return `chip::${orderId}::${stage}`
}

export function parseDragId(id) {
  if (!id || typeof id !== 'string' || !id.startsWith('chip::')) return null
  const [, orderId, stage] = id.split('::')
  return { orderId, stage }
}

export function makeDropId(bucket, date) {
  return `cell::${bucket}::${date}`
}

export function parseDropId(id) {
  if (!id || typeof id !== 'string' || !id.startsWith('cell::')) return null
  const [, bucket, date] = id.split('::')
  return { bucket, date }
}
