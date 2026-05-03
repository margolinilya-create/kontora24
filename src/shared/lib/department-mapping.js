// Department-based status grouping for TZ filter/timeline UI
// Maps current DB statuses to department groups from the spec

export const DEPARTMENTS = [
  {
    id: 'sales',
    label: 'Отдел продаж',
    color: 'bg-blue-500/15 text-blue-400',
    borderColor: 'border-blue-400',
    stages: [
      { label: 'Согласование', status: 'new' },
      { label: 'Ждёт утверждения', status: 'design_done' },
    ],
  },
  {
    id: 'prepress',
    label: 'Допечатная подготовка',
    color: 'bg-purple-500/15 text-purple-400',
    borderColor: 'border-purple-400',
    stages: [
      { label: 'Дизайн', status: 'design' },
    ],
  },
  {
    id: 'print',
    label: 'Печать, резка, ламинация',
    color: 'bg-orange-500/15 text-orange-400',
    borderColor: 'border-orange-400',
    stages: [
      { label: 'Печать', status: 'print' },
      { label: 'Ламинация', status: 'print_done' },
      { label: 'Резка', status: 'post_processing' },
    ],
  },
  {
    id: '3d',
    label: '3D отдел',
    color: 'bg-cyan-500/15 text-cyan-400',
    borderColor: 'border-cyan-400',
    stages: [
      { label: '3D заливка', status: 'resin_pouring' },
    ],
  },
  {
    id: 'osk',
    label: 'ОСК',
    color: 'bg-yellow-500/15 text-yellow-400',
    borderColor: 'border-yellow-400',
    stages: [
      { label: 'Выборка', status: 'assembly' },
      { label: 'Сборка пака', status: 'packaging' },
      { label: 'Упаковка', status: 'packaging' },
      { label: 'Ждёт выдачи', status: 'otk' },
    ],
  },
  {
    id: 'delivered',
    label: 'Выдан',
    color: 'bg-green-500/15 text-green-400',
    borderColor: 'border-green-400',
    stages: [
      { label: 'Выдан', status: 'done' },
    ],
  },
]

// Build a lookup: DB status → department info
const _statusToDept = {}
for (const dept of DEPARTMENTS) {
  for (const stage of dept.stages) {
    // First mapping wins (some statuses appear in multiple stages)
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
