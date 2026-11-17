import { describe, it, expect } from 'vitest'
import {
  DEPARTMENTS,
  DEPT_GROUPS,
  getDepartment,
  getDepartmentLabel,
  getStageLabel,
  getAllFilterStatuses,
  getStatusesForDepartment,
  getStageDeptToken,
  stageBadgeClasses,
} from './department-mapping'

// R25.1 (ТЗ 17.11 Фаза 1, таблица 1.1): отделы описаны одним списком
// ORG_DEPARTMENTS; «Печать» и «Постпечатная обработка» объединены в ОПРЛ,
// «Сборка 3D» перенесена из 3D-отдела в ОСК, в ОП добавлены этапы продаж.

describe('DEPARTMENTS structure', () => {
  it('has 6 departments in correct order', () => {
    expect(DEPARTMENTS.map((d) => d.id)).toEqual(['sales', 'prepress', 'print', '3d', 'osk', 'delivered'])
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
    expect(result.stageLabel).toBe('Новый заказ')
  })

  it('sales department holds payment, color approval, subcontract, pickup, delivery', () => {
    for (const s of ['awaiting_payment', 'color_approval', 'subcontract', 'awaiting_pickup', 'delivery']) {
      expect(getDepartment(s).departmentId).toBe('sales')
    }
  })

  it('returns prepress department for design / design_approval / sample_layout / prepress', () => {
    for (const s of ['design', 'design_approval', 'sample_layout', 'prepress']) {
      expect(getDepartment(s).departmentId).toBe('prepress')
    }
    expect(getDepartment('design').stageLabel).toBe('Дизайн')
    expect(getDepartment('design').departmentLabel).toBe('Допечатная подготовка')
  })

  it('returns print department (ОПРЛ) for sample_print, print, lamination, cutting', () => {
    for (const s of ['sample_print', 'print', 'lamination', 'cutting']) {
      expect(getDepartment(s).departmentId).toBe('print')
    }
    expect(getDepartment('lamination').stageLabel).toBe('Ламинация')
  })

  it('returns 3d department for selection, pouring, drying', () => {
    expect(getDepartment('selection').departmentId).toBe('3d')
    expect(getDepartment('pouring').departmentId).toBe('3d')
    expect(getDepartment('drying').departmentId).toBe('3d')
    expect(getDepartment('selection').departmentLabel).toBe('3D отдел')
  })

  it('returns osk department for assembly_3d, packaging and otk (ТК)', () => {
    expect(getDepartment('assembly_3d').departmentId).toBe('osk')
    expect(getDepartment('packaging').departmentId).toBe('osk')
    expect(getDepartment('otk').departmentId).toBe('osk')
    expect(getDepartment('otk').stageLabel).toBe('ТК')
  })

  it('returns delivered department for done', () => {
    const result = getDepartment('done')
    expect(result.departmentId).toBe('delivered')
    expect(result.departmentLabel).toBe('Выдан')
  })

  it('returns null for unknown status and legacy keys', () => {
    expect(getDepartment('nonexistent')).toBeNull()
    expect(getDepartment('')).toBeNull()
    expect(getDepartment(undefined)).toBeNull()
    expect(getDepartment('selection_pouring')).toBeNull()
  })

  it('returns color from parent department', () => {
    expect(getDepartment('print').color).toBe('bg-orange-500/15 text-orange-400')
    expect(getDepartment('new').color).toBe('bg-blue-500/15 text-blue-400')
  })
})

describe('getDepartmentLabel / getStageLabel', () => {
  it('returns department label for known statuses', () => {
    expect(getDepartmentLabel('new')).toBe('Отдел продаж')
    expect(getDepartmentLabel('prepress')).toBe('Допечатная подготовка')
    expect(getDepartmentLabel('cutting')).toBe('Печать, резка и ламинация')
    expect(getDepartmentLabel('drying')).toBe('3D отдел')
    expect(getDepartmentLabel('assembly_3d')).toBe('Отдел сборки и контроля')
    expect(getDepartmentLabel('done')).toBe('Выдан')
  })

  it('returns status string as fallback', () => {
    expect(getDepartmentLabel('unknown')).toBe('unknown')
    expect(getDepartmentLabel('cancelled')).toBe('cancelled')
    expect(getStageLabel('cancelled')).toBe('cancelled')
  })

  it('stage labels', () => {
    expect(getStageLabel('awaiting_payment')).toBe('Ждёт оплаты')
    expect(getStageLabel('awaiting_pickup')).toBe('Ждёт выдачи')
    expect(getStageLabel('done')).toBe('Выдан')
  })
})

describe('getAllFilterStatuses', () => {
  it('returns unique statuses', () => {
    const statuses = getAllFilterStatuses()
    expect(new Set(statuses).size).toBe(statuses.length)
  })

  it('contains all route statuses (21: all except cancelled and legacy keys)', () => {
    const statuses = getAllFilterStatuses()
    expect(statuses).toHaveLength(21)
    for (const s of ['new', 'awaiting_payment', 'design_approval', 'subcontract', 'awaiting_pickup', 'delivery', 'otk', 'done']) {
      expect(statuses).toContain(s)
    }
  })

  it('does not contain cancelled or deprecated statuses', () => {
    const statuses = getAllFilterStatuses()
    expect(statuses).not.toContain('cancelled')
    expect(statuses).not.toContain('selection_pouring')
    expect(statuses).not.toContain('batch_layout')
  })
})

describe('getStatusesForDepartment', () => {
  it('returns statuses per department', () => {
    expect(getStatusesForDepartment('sales')).toEqual(['new', 'awaiting_payment', 'color_approval', 'subcontract', 'awaiting_pickup', 'delivery'])
    expect(getStatusesForDepartment('prepress')).toEqual(['design', 'design_approval', 'sample_layout', 'prepress'])
    expect(getStatusesForDepartment('print')).toEqual(['sample_print', 'print', 'lamination', 'cutting'])
    expect(getStatusesForDepartment('3d')).toEqual(['selection', 'pouring', 'drying'])
    expect(getStatusesForDepartment('osk')).toEqual(['assembly_3d', 'packaging', 'otk'])
    expect(getStatusesForDepartment('delivered')).toEqual(['done'])
  })

  it('returns empty array for unknown department', () => {
    expect(getStatusesForDepartment('fake')).toEqual([])
    expect(getStatusesForDepartment('')).toEqual([])
    expect(getStatusesForDepartment(undefined)).toEqual([])
  })
})

describe('DEPT_GROUPS (цвета / канбан)', () => {
  it('строятся из того же описания отделов', () => {
    expect(Object.keys(DEPT_GROUPS)).toEqual(['sales', 'design', 'print', 'pouring', 'finish'])
    expect(DEPT_GROUPS.sales.label).toBe('ОП')
    expect(DEPT_GROUPS.finish.stages).toEqual(['assembly_3d', 'packaging', 'otk', 'done'])
    expect(DEPT_GROUPS.pouring.stages).toContain('selection_pouring') // устаревший ключ красится цветом отдела
    expect(DEPT_GROUPS.design.stages).toContain('batch_layout')
  })

  it('токены цветов: ОП — info (синий), отмена — danger', () => {
    expect(getStageDeptToken('new')).toBe('info')
    expect(getStageDeptToken('color_approval')).toBe('info')
    expect(getStageDeptToken('cancelled')).toBe('danger')
    expect(getStageDeptToken('assembly_3d')).toBe('dept-finish')
    expect(stageBadgeClasses('awaiting_payment')).toBe('bg-info/15 text-info')
  })
})
