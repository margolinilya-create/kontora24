// Department-based status grouping (фильтр, таймлайн, канбан, цвета).
//
// R25.1 (ТЗ 17.11 Фаза 1, таблица 1.1): отделы описаны ОДИН раз в ORG_DEPARTMENTS;
// из него строятся и DEPARTMENTS (фильтр/таймлайн), и DEPT_GROUPS (цвета,
// колонки канбана). Раньше «Сборка 3D» в двух списках числилась в разных
// отделах — расхождение устранено: сборка в ОСК. У отдела продаж синий цвет
// (токен info — раньше его использовал этап «Новый»).
//
// stages — {label, status} для фильтра (порядок = канонический порядок этапов).
// legacyStatuses — устаревшие ключи (batch_layout/selection_pouring): не
// показываются в фильтре, но красятся цветом отдела и попадают в группу.

export const ORG_DEPARTMENTS = [
  {
    id: 'sales',
    groupKey: 'sales',
    token: 'info',
    short: 'ОП',
    label: 'Отдел продаж',
    color: 'bg-blue-500/15 text-blue-400',
    borderColor: 'border-blue-500',
    dotColor: 'bg-blue-500',
    stages: [
      { label: 'Новый заказ', status: 'new' },
      { label: 'Ждёт оплаты', status: 'awaiting_payment' },
      { label: 'Утверждение цвета', status: 'color_approval' },
      { label: 'Субподряд', status: 'subcontract' },
      { label: 'Ждёт выдачи', status: 'awaiting_pickup' },
      { label: 'Доставка', status: 'delivery' },
    ],
    legacyStatuses: [],
  },
  {
    id: 'prepress',
    groupKey: 'design',
    token: 'dept-design',
    short: 'ОДП',
    label: 'Допечатная подготовка',
    fullLabel: 'Отдел допечатной подготовки',
    color: 'bg-purple-500/15 text-purple-400',
    borderColor: 'border-purple-500',
    dotColor: 'bg-purple-500',
    stages: [
      { label: 'Дизайн', status: 'design' },
      { label: 'Утверждение дизайна', status: 'design_approval' },
      { label: 'Вёрстка образца', status: 'sample_layout' },
      { label: 'Препресс', status: 'prepress' },
    ],
    legacyStatuses: ['batch_layout'],
  },
  {
    id: 'print',
    groupKey: 'print',
    token: 'dept-print',
    short: 'ОПРЛ',
    label: 'Печать, резка и ламинация',
    fullLabel: 'Отдел печати, резки и ламинации',
    color: 'bg-orange-500/15 text-orange-400',
    borderColor: 'border-orange-500',
    dotColor: 'bg-orange-500',
    stages: [
      { label: 'Печать образца', status: 'sample_print' },
      { label: 'Печать', status: 'print' },
      { label: 'Ламинация', status: 'lamination' },
      { label: 'Резка', status: 'cutting' },
    ],
    legacyStatuses: [],
  },
  {
    id: '3d',
    groupKey: 'pouring',
    token: 'dept-pouring',
    short: '3DО',
    label: '3D отдел',
    fullLabel: '3D отдел (заливка)',
    color: 'bg-cyan-500/15 text-cyan-400',
    borderColor: 'border-cyan-500',
    dotColor: 'bg-cyan-500',
    // R22.4 (ТЗ 20.07 Фаза 4Б): selection_pouring упразднён — раздельные этапы.
    stages: [
      { label: 'Выборка', status: 'selection' },
      { label: 'Заливка', status: 'pouring' },
      { label: 'Сушка', status: 'drying' },
    ],
    legacyStatuses: ['selection_pouring'],
  },
  {
    id: 'osk',
    groupKey: 'finish',
    token: 'dept-finish',
    short: 'ОСК',
    label: 'Отдел сборки и контроля',
    fullLabel: 'Отдел сборки и контроля',
    color: 'bg-yellow-500/15 text-yellow-400',
    borderColor: 'border-yellow-500',
    dotColor: 'bg-yellow-500',
    stages: [
      { label: 'Сборка 3D', status: 'assembly_3d' },
      { label: 'Упаковка', status: 'packaging' },
      { label: 'ТК', status: 'otk' },
    ],
    legacyStatuses: [],
  },
  {
    id: 'delivered',
    groupKey: 'finish',
    token: 'dept-finish',
    short: 'Выдан',
    label: 'Выдан',
    color: 'bg-green-500/15 text-green-400',
    borderColor: 'border-green-500',
    dotColor: 'bg-green-500',
    stages: [
      { label: 'Выдан', status: 'done' },
    ],
    legacyStatuses: [],
  },
]

// Фильтр / таймлайн: отделы с этапами (без устаревших ключей).
export const DEPARTMENTS = ORG_DEPARTMENTS.map((d) => ({
  id: d.id,
  label: d.label,
  color: d.color,
  borderColor: d.borderColor,
  dotColor: d.dotColor,
  stages: d.stages,
}))

// Build a lookup: DB status → department info
const _statusToDept = {}
for (const dept of DEPARTMENTS) {
  for (const stage of dept.stages) {
    // First mapping wins (some statuses may appear in multiple stages)
    if (!_statusToDept[stage.status]) {
      _statusToDept[stage.status] = {
        departmentId: dept.id,
        departmentLabel: dept.label,
        stageLabel: stage.label,
        color: dept.color,
      }
    }
  }
}

/** Get department info for a DB status */
export function getDepartment(status) {
  return _statusToDept[status] || null
}

/** Get department label for a DB status */
export function getDepartmentLabel(status) {
  return _statusToDept[status]?.departmentLabel || status
}

/** Get stage label within department for a DB status */
export function getStageLabel(status) {
  return _statusToDept[status]?.stageLabel || status
}

/** Get all unique DB statuses used in the department filter */
export function getAllFilterStatuses() {
  const statuses = new Set()
  for (const dept of DEPARTMENTS) {
    for (const stage of dept.stages) {
      statuses.add(stage.status)
    }
  }
  return [...statuses]
}

/** Get DB statuses for a given department id */
export function getStatusesForDepartment(departmentId) {
  const dept = DEPARTMENTS.find(d => d.id === departmentId)
  if (!dept) return []
  return [...new Set(dept.stages.map(s => s.status))]
}

// --- Production department color groups (built from ORG_DEPARTMENTS) ---
// Used by status badges, kanban columns, pipeline summary.
//   ОП   — Отдел продаж (info)
//   ОДП  — Отдел допечатной подготовки
//   ОПРЛ — Отдел печати, резки и ламинации
//   3DО  — 3D отдел (выборка, заливка, сушка)
//   ОСК  — Отдел сборки и контроля (Сборка 3D, Упаковка, ТК, Готово)
export const DEPT_GROUPS = (() => {
  const groups = {}
  for (const d of ORG_DEPARTMENTS) {
    const g = groups[d.groupKey] || {
      token: d.token,
      label: d.short,
      fullLabel: d.fullLabel || d.label,
      stages: [],
    }
    for (const st of d.stages) g.stages.push(st.status)
    for (const st of d.legacyStatuses || []) g.stages.push(st)
    groups[d.groupKey] = g
  }
  return groups
})()

const _stageToGroup = {}
for (const [key, group] of Object.entries(DEPT_GROUPS)) {
  for (const stage of group.stages) {
    _stageToGroup[stage] = { ...group, key }
  }
}

/** Department token (color theme name) for a production stage */
export function getStageDeptToken(status) {
  if (status === 'cancelled') return 'danger'
  return _stageToGroup[status]?.token || null
}

/** Ключ группы отдела (sales/design/print/pouring/finish) для статуса. */
export function getStageGroupKey(status) {
  return _stageToGroup[status]?.key || null
}

// Literal Tailwind classes — kept verbatim so the content scanner picks them up.
const STAGE_BADGE_CLASSES = {
  'dept-design':  'bg-dept-design/15 text-dept-design',
  'dept-print':   'bg-dept-print/15 text-dept-print',
  'dept-pouring': 'bg-dept-pouring/15 text-dept-pouring',
  'dept-finish':  'bg-dept-finish/15 text-dept-finish',
  'info':         'bg-info/15 text-info',
  'danger':       'bg-danger/15 text-danger',
}

const STAGE_DOT_CLASSES = {
  'dept-design':  'bg-dept-design',
  'dept-print':   'bg-dept-print',
  'dept-pouring': 'bg-dept-pouring',
  'dept-finish':  'bg-dept-finish',
  'info':         'bg-info',
  'danger':       'bg-danger',
}

const STAGE_BORDER_CLASSES = {
  'dept-design':  'border-dept-design',
  'dept-print':   'border-dept-print',
  'dept-pouring': 'border-dept-pouring',
  'dept-finish':  'border-dept-finish',
  'info':         'border-info',
  'danger':       'border-danger',
}

/** Tailwind badge classes (bg + text) for a stage, using its department color */
export function stageBadgeClasses(status) {
  const token = getStageDeptToken(status)
  return STAGE_BADGE_CLASSES[token] || 'bg-text-muted/15 text-text-muted'
}

/** Solid background dot color for a stage (for kanban column headers, dots) */
export function stageDotClass(status) {
  const token = getStageDeptToken(status)
  return STAGE_DOT_CLASSES[token] || 'bg-text-muted'
}

/** Border color class for a stage (for accent strips on cards/columns) */
export function stageBorderClass(status) {
  const token = getStageDeptToken(status)
  return STAGE_BORDER_CLASSES[token] || 'border-border'
}
