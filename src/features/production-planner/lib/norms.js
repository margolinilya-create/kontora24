// R12.1 — нормативы и ёмкости. Зеркало дефолтов из миграции 048
// (k24_settings → planning:norms / planning:capacity). При живом запросе
// `resolveNorms(value)` / `resolveCapacity(value)` мерджит присланное value
// с дефолтами и возвращает гарантированно полный объект — даже если в БД
// часть ключей удалили или не успели прислать.

import { BUCKETS } from './buckets'

// §6.2 ТЗ + R11. Формат тот же, что в миграции 048.
export const DEFAULT_NORMS = Object.freeze({
  design_days:                     3,     // §6.2 — фиксированно 3 раб. дня
  design_multiply_kinds:           false, // §13 №2 — открытый вопрос ТЗ
  verstka_minutes:                 10,    // sample_layout (§6.2: verstka=10мин)
  sample_print_minutes:            10,    // samplePrint
  batch_layout_minutes_per_kind:   30,    // R11 batch_layout (как prepress)
  prepress_minutes_per_kind:       30,    // prepress = 30 мин × kinds
  print_meters_per_30min:          1.5,   // 1.5 пог.м / 30 мин
  lamination_meters_per_20min:     1.5,   // 1.5 пог.м / 20 мин
  cutting_meters_per_15min:        1.5,   // 1.5 пог.м / 15 мин
  weeding_backgrounds_per_8h:      600,   // 600 фонов / 8 ч (выборка)
  resin_stickers_per_8h:           2184,  // 2184 стикера / 8 ч
  selection_stickers_per_8h:       2184,  // R11 selection — консервативно как resin
  assembly_packs_per_8h:           350,   // 350 паков / 8 ч
  packaging_packs_per_8h:          800,   // 800 паков / 8 ч
  otk_minutes:                     15,    // §13 №3 ТЗ
  drying_hours:                    36,    // пассив, людей не занимает
})

// Дефолтные ёмкости по решению пользователя (бриф 03.06): пост-печатная
// бригада 3 человека = один общий бакет post_print = 24 ч/день.
export const DEFAULT_CAPACITY = Object.freeze({
  designers:     1,
  prepress:      1,
  printers:      1,
  cutters:       2,
  post_print:    3,
  hours_per_day: 8,
})

export function resolveNorms(value) {
  if (!value || typeof value !== 'object') return { ...DEFAULT_NORMS }
  return { ...DEFAULT_NORMS, ...value }
}

export function resolveCapacity(value) {
  if (!value || typeof value !== 'object') return { ...DEFAULT_CAPACITY }
  return { ...DEFAULT_CAPACITY, ...value }
}

// Часы в рабочем дне для каждого бакета, исходя из количества ресурсов.
// hours_per_day — общий норматив длины рабочего дня.
export function bucketHoursPerDay(bucket, capacity = DEFAULT_CAPACITY) {
  const cap = resolveCapacity(capacity)
  const hpd = Number(cap.hours_per_day) || 8
  switch (bucket) {
    case BUCKETS.design:     return (Number(cap.designers)  || 1) * hpd
    case BUCKETS.prepress:   return (Number(cap.prepress)   || 1) * hpd
    case BUCKETS.oprl_print: return (Number(cap.printers)   || 1) * hpd
    case BUCKETS.oprl_cut:   return (Number(cap.cutters)    || 2) * hpd
    case BUCKETS.post_print: return (Number(cap.post_print) || 3) * hpd
    default:                 return 0 // passive / milestone — ёмкость не считается
  }
}
