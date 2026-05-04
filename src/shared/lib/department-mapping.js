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
