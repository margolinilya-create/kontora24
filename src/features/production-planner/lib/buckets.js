// R12.1 — карта «этап производства → бакет ёмкости».
// 6 видимых бакетов + 2 служебных (passive для drying, milestone для вех).
//
// По решению пользователя (бриф 03.06): пост-печатная бригада (3 человека)
// делает заливку + выборку + сборку 3D + упаковку и работает 8 часов
// одновременно — поэтому ОТЛИЧАЕТСЯ от ТЗ §6.3, где 3DО и ОСК — раздельные
// бакеты. У нас один общий бакет `post_print` (24 ч/день при 3 чел).
//
// Эти константы НЕ переиспользуют DEPT_GROUPS из shared/lib/department-mapping.js
// — там 4 группы под канбан, у нас 6 бакетов под календарь, и `sample_print`/
// `selection`/`color_approval` там вообще отсутствуют.

export const BUCKETS = {
  design:     'design',
  prepress:   'prepress',
  oprl_print: 'oprl_print',
  oprl_cut:   'oprl_cut',
  post_print: 'post_print',
  passive:    'passive',    // drying — рисуется как пассив, ёмкость не занимает
  milestone:  'milestone',  // new / color_approval / done / cancelled — не планируем
}

// Этап → бакет. Покрывает все 19 ORDER_STATUSES.
export const STAGE_TO_BUCKET = Object.freeze({
  new:               BUCKETS.milestone,
  design:            BUCKETS.design,
  sample_layout:     BUCKETS.prepress,
  sample_print:      BUCKETS.oprl_print,
  color_approval:    BUCKETS.milestone, // ждём клиента, ресурс не занимает
  batch_layout:      BUCKETS.prepress,
  prepress:          BUCKETS.prepress,
  print:             BUCKETS.oprl_print,
  lamination:        BUCKETS.oprl_print, // печатник делит печать+ламинацию
  cutting:           BUCKETS.oprl_cut,
  pouring:           BUCKETS.post_print,
  selection_pouring: BUCKETS.post_print,
  drying:            BUCKETS.passive,
  selection:         BUCKETS.post_print,
  assembly_3d:       BUCKETS.post_print,
  packaging:         BUCKETS.post_print,
  otk:               BUCKETS.post_print,
  done:              BUCKETS.milestone,
  cancelled:         BUCKETS.milestone,
})

// Порядок отображения видимых бакетов в календаре (сверху вниз).
// passive рисуется отдельной полосой пассива, milestone не рисуется.
export const VISIBLE_BUCKETS = Object.freeze([
  BUCKETS.design,
  BUCKETS.prepress,
  BUCKETS.oprl_print,
  BUCKETS.oprl_cut,
  BUCKETS.post_print,
  BUCKETS.passive,
])

export const BUCKET_LABELS = Object.freeze({
  [BUCKETS.design]:     'Дизайн (ОДП)',
  [BUCKETS.prepress]:   'Препресс (ОДП)',
  [BUCKETS.oprl_print]: 'Печать / ламинация (ОПРЛ)',
  [BUCKETS.oprl_cut]:   'Резка (ОПРЛ)',
  [BUCKETS.post_print]: 'Постпечать (3DО + ОСК)',
  [BUCKETS.passive]:    'Сушка',
  [BUCKETS.milestone]:  'Веха',
})

// Какие этапы относятся к данному бакету (обратный индекс — для UI).
export const BUCKET_STAGES = Object.freeze(
  Object.entries(STAGE_TO_BUCKET).reduce((acc, [stage, bucket]) => {
    if (!acc[bucket]) acc[bucket] = []
    acc[bucket].push(stage)
    return acc
  }, {})
)

export function getBucketForStage(stage) {
  return STAGE_TO_BUCKET[stage] || BUCKETS.milestone
}

export function isPlannableBucket(bucket) {
  return bucket !== BUCKETS.milestone && bucket !== BUCKETS.passive
}
