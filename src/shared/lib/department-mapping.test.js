import { describe, it, expect } from 'vitest'
import {
  DEPARTMENTS,
  getDepartment,
  getDepartmentLabel,
  getStageLabel,
  getAllFilterStatuses,
  getStatusesForDepartment,
} from './department-mapping'

describe('DEPARTMENTS structure', () => {
  it('has 6 departments in correct order', () => {
    expect(DEPARTMENTS).toHaveLength(6)
    expect(DEPARTMENTS[0].id).toBe('sales')
    expect(DEPARTMENTS[5].id).toBe('delivered')
  })

  it('each department has required fields', () => {
    for (const dept of DEPARTMENTS) {
      expect(dept.id).toBeDefined()
      expect(dept.label).toBeDefined()
      expect(dept.color).toBeDefined()
      expect(dept.borderColor).toBeDefined()
      expect(dept.stages.length).toBeGreaterThan(0)
    }
  })

  it('each stage has label and status', () => {
    for (const dept of DEPARTMENTS) {
      for (const stage of dept.stages) {
        expect(stage.label).toBeDefined()
        expect(stage.status).toBeDefined()
      }
    }
  })
})

describe('getDepartment', () => {
  it('returns sales department for new', () => {
    const result = getDepartment('new')
    expect(result.departmentId).toBe('sales')
    expect(result.departmentLabel).toBe('Отдел продаж')
    expect(result.stageLabel).toBe('Согласование')
  })

  it('returns sales department for design_done', () => {
    const result = getDepartment('design_done')
    expect(result.departmentId).toBe('sales')
    expect(result.stageLabel).toBe('Ждёт утверждения')
  })

  it('returns prepress department for design', () => {
    const result = getDepartment('design')
    expect(result.departmentId).toBe('prepress')
    expect(result.departmentLabel).toBe('Допечатная подготовка')
  })

  it('returns print department for print statuses', () => {
    expect(getDepartment('print').departmentId).toBe('print')
    expect(getDepartment('print_done').departmentId).toBe('print')
    expect(getDepartment('post_processing').departmentId).toBe('print')
  })

  it('returns 3D department for resin_pouring', () => {
    const result = getDepartment('resin_pouring')
    expect(result.departmentId).toBe('3d')
    expect(result.departmentLabel).toBe('3D отдел')
    expect(result.stageLabel).toBe('3D заливка')
  })

  it('returns osk department for assembly/packaging/otk', () => {
    expect(getDepartment('assembly').departmentId).toBe('osk')
    expect(getDepartment('packaging').departmentId).toBe('osk')
    expect(getDepartment('otk').departmentId).toBe('osk')
  })

  it('returns delivered department for done', () => {
    const result = getDepartment('done')
    expect(result.departmentId).toBe('delivered')
    expect(result.departmentLabel).toBe('Выдан')
  })

  it('returns null for unknown status', () => {
    expect(getDepartment('nonexistent')).toBeNull()
    expect(getDepartment('')).toBeNull()
    expect(getDepartment(undefined)).toBeNull()
  })

  it('first mapping wins for duplicate statuses (packaging in osk)', () => {
    // packaging appears twice in osk stages, first is "Сборка пака"
    const result = getDepartment('packaging')
    expect(result.stageLabel).toBe('Сборка пака')
  })

  it('returns color from parent department', () => {
    const result = getDepartment('print')
    expect(result.color).toBe('bg-orange-500/15 text-orange-400')
  })
})

describe('getDepartmentLabel', () => {
  it('returns department label for known statuses', () => {
    expect(getDepartmentLabel('new')).toBe('Отдел продаж')
    expect(getDepartmentLabel('design')).toBe('Допечатная подготовка')
    expect(getDepartmentLabel('print')).toBe('Печать, резка, ламинация')
    expect(getDepartmentLabel('resin_pouring')).toBe('3D отдел')
    expect(getDepartmentLabel('assembly')).toBe('ОСК')
    expect(getDepartmentLabel('done')).toBe('Выдан')
  })

  it('returns status string as fallback for unknown status', () => {
    expect(getDepartmentLabel('unknown')).toBe('unknown')
    expect(getDepartmentLabel('cancelled')).toBe('cancelled')
  })
})

describe('getStageLabel', () => {
  it('returns stage label for each status', () => {
    expect(getStageLabel('new')).toBe('Согласование')
    expect(getStageLabel('design')).toBe('Дизайн')
    expect(getStageLabel('print')).toBe('Печать')
    expect(getStageLabel('print_done')).toBe('Ламинация')
    expect(getStageLabel('post_processing')).toBe('Резка')
    expect(getStageLabel('resin_pouring')).toBe('3D заливка')
    expect(getStageLabel('assembly')).toBe('Выборка')
    expect(getStageLabel('otk')).toBe('Ждёт выдачи')
    expect(getStageLabel('done')).toBe('Выдан')
  })

  it('returns status string as fallback for unknown status', () => {
    expect(getStageLabel('cancelled')).toBe('cancelled')
  })
})

describe('getAllFilterStatuses', () => {
  it('returns array of unique statuses', () => {
    const statuses = getAllFilterStatuses()
    expect(Array.isArray(statuses)).toBe(true)
    // Should be unique
    expect(new Set(statuses).size).toBe(statuses.length)
  })

  it('contains all expected DB statuses (11 unique)', () => {
    const statuses = getAllFilterStatuses()
    const expected = ['new', 'design_done', 'design', 'print', 'print_done', 'post_processing', 'resin_pouring', 'assembly', 'packaging', 'otk', 'done']
    for (const s of expected) {
      expect(statuses).toContain(s)
    }
  })

  it('does not contain cancelled (not mapped to any department)', () => {
    const statuses = getAllFilterStatuses()
    expect(statuses).not.toContain('cancelled')
  })
})

describe('getStatusesForDepartment', () => {
  it('returns correct statuses for sales', () => {
    const statuses = getStatusesForDepartment('sales')
    expect(statuses).toEqual(['new', 'design_done'])
  })

  it('returns correct statuses for print', () => {
    const statuses = getStatusesForDepartment('print')
    expect(statuses).toEqual(['print', 'print_done', 'post_processing'])
  })

  it('returns deduplicated statuses for osk (packaging appears twice)', () => {
    const statuses = getStatusesForDepartment('osk')
    expect(statuses).toEqual(['assembly', 'packaging', 'otk'])
    // packaging appears in two stages but only once in result
    expect(statuses.filter(s => s === 'packaging')).toHaveLength(1)
  })

  it('returns single status for prepress', () => {
    expect(getStatusesForDepartment('prepress')).toEqual(['design'])
  })

  it('returns single status for 3d', () => {
    expect(getStatusesForDepartment('3d')).toEqual(['resin_pouring'])
  })

  it('returns single status for delivered', () => {
    expect(getStatusesForDepartment('delivered')).toEqual(['done'])
  })

  it('returns empty array for unknown department', () => {
    expect(getStatusesForDepartment('fake')).toEqual([])
    expect(getStatusesForDepartment('')).toEqual([])
    expect(getStatusesForDepartment(undefined)).toEqual([])
  })
})
