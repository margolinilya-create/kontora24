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
  it('has 7 departments in correct order', () => {
    expect(DEPARTMENTS).toHaveLength(7)
    expect(DEPARTMENTS[0].id).toBe('sales')
    expect(DEPARTMENTS[1].id).toBe('prepress')
    expect(DEPARTMENTS[2].id).toBe('print')
    expect(DEPARTMENTS[3].id).toBe('postprint')
    expect(DEPARTMENTS[4].id).toBe('3d')
    expect(DEPARTMENTS[5].id).toBe('osk')
    expect(DEPARTMENTS[6].id).toBe('delivered')
  })

  it('each department has required fields', () => {
    for (const dept of DEPARTMENTS) {
      expect(dept.id).toBeDefined()
      expect(dept.label).toBeDefined()
      expect(dept.color).toBeDefined()
      expect(dept.borderColor).toBeDefined()
      expect(dept.dotColor).toBeDefined()
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

  it('returns prepress department for design', () => {
    const result = getDepartment('design')
    expect(result.departmentId).toBe('prepress')
    expect(result.departmentLabel).toBe('Допечатная подготовка')
    expect(result.stageLabel).toBe('Дизайн')
  })

  it('returns prepress department for prepress', () => {
    const result = getDepartment('prepress')
    expect(result.departmentId).toBe('prepress')
    expect(result.stageLabel).toBe('Препресс')
  })

  it('returns print department for print', () => {
    const result = getDepartment('print')
    expect(result.departmentId).toBe('print')
    expect(result.departmentLabel).toBe('Печать')
    expect(result.stageLabel).toBe('Печать')
  })

  it('returns postprint department for lamination and cutting', () => {
    expect(getDepartment('lamination').departmentId).toBe('postprint')
    expect(getDepartment('lamination').stageLabel).toBe('Ламинация')
    expect(getDepartment('cutting').departmentId).toBe('postprint')
    expect(getDepartment('cutting').stageLabel).toBe('Резка')
  })

  it('returns 3d department for selection_pouring, pouring, assembly_3d', () => {
    const sp = getDepartment('selection_pouring')
    expect(sp.departmentId).toBe('3d')
    expect(sp.departmentLabel).toBe('3D отдел')
    expect(sp.stageLabel).toBe('Выборка / Заливка')

    const p = getDepartment('pouring')
    expect(p.departmentId).toBe('3d')
    expect(p.stageLabel).toBe('Заливка')

    const a = getDepartment('assembly_3d')
    expect(a.departmentId).toBe('3d')
    expect(a.stageLabel).toBe('Сборка 3D')
  })

  it('returns osk department for packaging and otk', () => {
    expect(getDepartment('packaging').departmentId).toBe('osk')
    expect(getDepartment('packaging').stageLabel).toBe('Упаковка')
    expect(getDepartment('otk').departmentId).toBe('osk')
    expect(getDepartment('otk').stageLabel).toBe('ОТК / Выдача')
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

  it('returns color from parent department', () => {
    const result = getDepartment('print')
    expect(result.color).toBe('bg-orange-500/15 text-orange-400')
  })
})

describe('getDepartmentLabel', () => {
  it('returns department label for known statuses', () => {
    expect(getDepartmentLabel('new')).toBe('Отдел продаж')
    expect(getDepartmentLabel('design')).toBe('Допечатная подготовка')
    expect(getDepartmentLabel('prepress')).toBe('Допечатная подготовка')
    expect(getDepartmentLabel('print')).toBe('Печать')
    expect(getDepartmentLabel('lamination')).toBe('Постпечатная обработка')
    expect(getDepartmentLabel('cutting')).toBe('Постпечатная обработка')
    expect(getDepartmentLabel('selection_pouring')).toBe('3D отдел')
    expect(getDepartmentLabel('pouring')).toBe('3D отдел')
    expect(getDepartmentLabel('assembly_3d')).toBe('3D отдел')
    expect(getDepartmentLabel('packaging')).toBe('ОСК')
    expect(getDepartmentLabel('otk')).toBe('ОСК')
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
    expect(getStageLabel('prepress')).toBe('Препресс')
    expect(getStageLabel('print')).toBe('Печать')
    expect(getStageLabel('lamination')).toBe('Ламинация')
    expect(getStageLabel('cutting')).toBe('Резка')
    expect(getStageLabel('selection_pouring')).toBe('Выборка / Заливка')
    expect(getStageLabel('pouring')).toBe('Заливка')
    expect(getStageLabel('assembly_3d')).toBe('Сборка 3D')
    expect(getStageLabel('packaging')).toBe('Упаковка')
    expect(getStageLabel('otk')).toBe('ОТК / Выдача')
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

  it('contains all expected DB statuses (12 unique)', () => {
    const statuses = getAllFilterStatuses()
    const expected = [
      'new', 'design', 'prepress', 'print',
      'lamination', 'cutting',
      'selection_pouring', 'pouring', 'assembly_3d',
      'packaging', 'otk', 'done',
    ]
    for (const s of expected) {
      expect(statuses).toContain(s)
    }
    expect(statuses).toHaveLength(12)
  })

  it('does not contain cancelled or old statuses', () => {
    const statuses = getAllFilterStatuses()
    expect(statuses).not.toContain('cancelled')
    expect(statuses).not.toContain('design_done')
    expect(statuses).not.toContain('print_done')
    expect(statuses).not.toContain('post_processing')
    expect(statuses).not.toContain('resin_pouring')
    expect(statuses).not.toContain('assembly')
  })
})

describe('getStatusesForDepartment', () => {
  it('returns correct statuses for sales', () => {
    expect(getStatusesForDepartment('sales')).toEqual(['new'])
  })

  it('returns correct statuses for prepress', () => {
    expect(getStatusesForDepartment('prepress')).toEqual(['design', 'prepress'])
  })

  it('returns correct statuses for print', () => {
    expect(getStatusesForDepartment('print')).toEqual(['print'])
  })

  it('returns correct statuses for postprint', () => {
    expect(getStatusesForDepartment('postprint')).toEqual(['lamination', 'cutting'])
  })

  it('returns correct statuses for 3d', () => {
    expect(getStatusesForDepartment('3d')).toEqual(['selection_pouring', 'pouring', 'assembly_3d'])
  })

  it('returns correct statuses for osk', () => {
    expect(getStatusesForDepartment('osk')).toEqual(['packaging', 'otk'])
  })

  it('returns correct statuses for delivered', () => {
    expect(getStatusesForDepartment('delivered')).toEqual(['done'])
  })

  it('returns empty array for unknown department', () => {
    expect(getStatusesForDepartment('fake')).toEqual([])
    expect(getStatusesForDepartment('')).toEqual([])
    expect(getStatusesForDepartment(undefined)).toEqual([])
  })
})
