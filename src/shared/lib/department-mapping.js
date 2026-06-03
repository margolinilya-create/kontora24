// Department-based status grouping for TZ filter/timeline UI
// Maps current DB statuses to department groups from the spec

export const DEPARTMENTS = [
  {
    id: 'sales',
    label: 'Отдел продаж',
    color: 'bg-blue-500/15 text-blue-400',
    borderColor: 'border-blue-500',
    dotColor: 'bg-blue-500',
    stages: [
      { label: 'Согласование', status: 'new' },
    ],
  },
  {
    id: 'prepress',
    label: 'Допечатная подготовка',
    color: 'bg-purple-500/15 text-purple-400',
    borderColor: 'border-purple-500',
    dotColor: 'bg-purple-500',
    stages: [
      { label: 'Дизайн', status: 'design' },
      { label: 'Препресс', status: 'prepress' },
    ],
  },
  {
    id: 'print',
    label: 'Печать',
    color: 'bg-orange-500/15 text-orange-400',
    borderColor: 'border-orange-500',
    dotColor: 'bg-orange-500',
    stages: [
      { label: 'Печать', status: 'print' },
    ],
  },
  {
    id: 'postprint',
    label: 'Постпечатная обработка',
    color: 'bg-amber-500/15 text-amber-400',
    borderColor: 'border-amber-500',
    dotColor: 'bg-amber-500',
    stages: [
      { label: 'Ламинация', status: 'lamination' },
      { label: 'Резка', status: 'cutting' },
    ],
  },
  {
    id: '3d',
    label: '3D отдел',
    color: 'bg-cyan-500/15 text-cyan-400',
    borderColor: 'border-cyan-500',
    dotColor: 'bg-cyan-500',
    stages: [
      { label: 'Выборка / Заливка', status: 'selection_pouring' },
      { label: 'Заливка', status: 'pouring' },
      { label: 'Сборка 3D', status: 'assembly_3d' },
    ],
  },
  {
    id: 'osk',
    label: 'ОСК',
    color: 'bg-yellow-500/15 text-yellow-400',
    borderColor: 'border-yellow-500',
    dotColor: 'bg-yellow-500',
    stages: [
      { label: 'Упаковка', status: 'packaging' },
      { label: 'ОТК / Выдача', status: 'otk' },
    ],
  },
  {
    id: 'delivered',
    label: 'Выдан',
    color: 'bg-green-500/15 text-green-400',
    borderColor: 'border-green-500',
    dotColor: 'bg-green-500',
    stages: [
      { label: 'Выдан', status: 'done' },
    ],
  },
]

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

// --- Production department color groups (4-color scheme per design system) ---
// Used by status badges, kanban columns, pipeline summary.
// Имена и стадии актуализированы по аудиту 2026-05-08:
//   ОДП  — Отдел Допечатной Подготовки (Дизайн, Препресс)
//   ОПРЛ — Отдел Печати, Резки и Ламинации (Печать, Резка, Ламинация)
//   3DО  — 3D Отдел (Заливка, Выборка/Заливка)
//   ОСК  — Отдел Сборки и Контроля (Сборка 3D, Упаковка, ОТК, Готово)

export const DEPT_GROUPS = {
  design:  { token: 'dept-design',  label: 'ОДП',  fullLabel: 'Отдел допечатной подготовки',         stages: ['design', 'sample_layout', 'prepress'] },
  print:   { token: 'dept-print',   label: 'ОПРЛ', fullLabel: 'Отдел печати, резки и ламинации',     stages: ['print', 'sample_print', 'lamination', 'cutting'] },
  pouring: { token: 'dept-pouring', label: '3DО',  fullLabel: '3D отдел (заливка)',                  stages: ['pouring', 'selection_pouring', 'drying', 'selection'] },
  finish:  { token: 'dept-finish',  label: 'ОСК',  fullLabel: 'Отдел сборки и контроля',             stages: ['assembly_3d', 'packaging', 'otk', 'done'] },
}

const _stageToGroup = {}
for (const [key, group] of Object.entries(DEPT_GROUPS)) {
  for (const stage of group.stages) {
    _stageToGroup[stage] = { ...group, key }
  }
}

/** Department token (color theme name) for a production stage */
export function getStageDeptToken(status) {
  if (status === 'new' || status === 'color_approval') return 'info'
  if (status === 'cancelled') return 'danger'
  return _stageToGroup[status]?.token || null
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
