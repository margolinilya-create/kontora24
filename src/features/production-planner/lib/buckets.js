import { getStageDef, isCustomStageKey } from '@/shared/lib/route-registry'

// R17.3 (бриф 5.06 «Планирование производства»): разворот R12-решения
// «единый post_print бакет». 3DO (заливка/сушка) и ОСК (выборка/сборка/
// упаковка/выдача) — раздельные отделы по структуре производства.
//
// Эти константы НЕ переиспользуют DEPT_GROUPS из shared/lib/department-mapping.js
// — там 4 группы под канбан, у нас 7 бакетов под календарь, и `sample_print`/
// `selection`/`color_approval` там вообще отсутствуют.

export const BUCKETS = {
  design:     'design',
  prepress:   'prepress',
  oprl_print: 'oprl_print',
  oprl_cut:   'oprl_cut',
  bucket_3do: '3do',
  bucket_osk: 'osk',
  passive:    'passive',    // drying — рисуется как пассив, ёмкость не занимает
  milestone:  'milestone',  // new / color_approval / done / cancelled — не планируем
}

// Этап → бакет. Покрывает все 24 ORDER_STATUSES (R25.1: +5 этапов-вех).
// MVP-компромисс: selection_pouring (3D-пак, параллельная стадия выборки фонов +
// заливки стикеров) считается заливкой → 3DO. ОСК-выборка фонов «догоняет» на
// тех же часах. Если планирование начнёт сильно расходиться с фактом —
// перевести selection_pouring на двойной расход в planner.js (3DO + ОСК).
export const STAGE_TO_BUCKET = Object.freeze({
  new:               BUCKETS.milestone,
  // R25.1 (ТЗ 17.11 Фаза 1): этапы отдела продаж / согласования и субподряд —
  // вехи (ждём клиента / подрядчика, ёмкость цеха не занимают).
  awaiting_payment:  BUCKETS.milestone,
  design_approval:   BUCKETS.milestone,
  subcontract:       BUCKETS.milestone,
  awaiting_pickup:   BUCKETS.milestone,
  delivery:          BUCKETS.milestone,
  design:            BUCKETS.design,
  sample_layout:     BUCKETS.prepress,
  sample_print:      BUCKETS.oprl_print,
  color_approval:    BUCKETS.milestone, // ждём клиента, ресурс не занимает
  batch_layout:      BUCKETS.prepress,
  prepress:          BUCKETS.prepress,
  print:             BUCKETS.oprl_print,
  lamination:        BUCKETS.oprl_print, // печатник делит печать+ламинацию
  cutting:           BUCKETS.oprl_cut,
  pouring:           BUCKETS.bucket_3do,
  selection_pouring: BUCKETS.bucket_3do, // см. комментарий выше
  drying:            BUCKETS.passive,
  selection:         BUCKETS.bucket_osk,
  assembly_3d:       BUCKETS.bucket_osk,
  packaging:         BUCKETS.bucket_osk,
  otk:               BUCKETS.bucket_osk,
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
  BUCKETS.bucket_3do,
  BUCKETS.bucket_osk,
  BUCKETS.passive,
])

export const BUCKET_LABELS = Object.freeze({
  [BUCKETS.design]:     'Дизайн (ОДП)',
  [BUCKETS.prepress]:   'Препресс (ОДП)',
  [BUCKETS.oprl_print]: 'Печать / ламинация (ОПРЛ)',
  [BUCKETS.oprl_cut]:   'Резка (ОПРЛ)',
  [BUCKETS.bucket_3do]: 'Заливка / сушка (3DO)',
  [BUCKETS.bucket_osk]: 'Сборка / упаковка / ТК (ОСК)',
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

// R25.7D (ТЗ 7.4): отдел своего этапа → бакет. Без нормы (norm_per_8h) свой
// этап — веха (ёмкость не занимает).
export const DEPARTMENT_TO_BUCKET = Object.freeze({
  sales:    BUCKETS.milestone,
  prepress: BUCKETS.prepress,
  print:    BUCKETS.oprl_print,
  '3d':     BUCKETS.bucket_3do,
  osk:      BUCKETS.bucket_osk,
})

/** Бакет своего этапа по каталогу (или milestone). */
export function getCustomStageBucket(def) {
  if (!def || !(Number(def.norm_per_8h) > 0)) return BUCKETS.milestone
  return DEPARTMENT_TO_BUCKET[def.department] || BUCKETS.milestone
}

export function getBucketForStage(stage) {
  if (STAGE_TO_BUCKET[stage]) return STAGE_TO_BUCKET[stage]
  if (isCustomStageKey(stage)) return getCustomStageBucket(getStageDef(stage))
  return BUCKETS.milestone
}

export function isPlannableBucket(bucket) {
  return bucket !== BUCKETS.milestone && bucket !== BUCKETS.passive
}
