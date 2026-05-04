import { describe, it, expect } from 'vitest'
import { canWorkOnStage, ROLE_STAGE_PERMISSIONS } from './constants'

describe('canWorkOnStage', () => {
  describe('admin and manager have full access', () => {
    const allStages = ['design', 'prepress', 'print', 'lamination', 'cutting', 'selection_pouring', 'pouring', 'assembly_3d', 'packaging', 'otk']

    it('admin can work on any stage', () => {
      for (const stage of allStages) {
        expect(canWorkOnStage('admin', stage)).toBe(true)
      }
    })

    it('manager can work on any stage', () => {
      for (const stage of allStages) {
        expect(canWorkOnStage('manager', stage)).toBe(true)
      }
    })
  })

  describe('designer permissions', () => {
    it('can work on design', () => {
      expect(canWorkOnStage('designer', 'design')).toBe(true)
    })

    it('can work on prepress', () => {
      expect(canWorkOnStage('designer', 'prepress')).toBe(true)
    })

    it('cannot work on print', () => {
      expect(canWorkOnStage('designer', 'print')).toBe(false)
    })

    it('cannot work on cutting', () => {
      expect(canWorkOnStage('designer', 'cutting')).toBe(false)
    })

    it('cannot work on pouring', () => {
      expect(canWorkOnStage('designer', 'pouring')).toBe(false)
    })

    it('cannot work on packaging', () => {
      expect(canWorkOnStage('designer', 'packaging')).toBe(false)
    })
  })

  describe('printer permissions', () => {
    it('can work on prepress', () => {
      expect(canWorkOnStage('printer', 'prepress')).toBe(true)
    })

    it('can work on print', () => {
      expect(canWorkOnStage('printer', 'print')).toBe(true)
    })

    it('can work on lamination', () => {
      expect(canWorkOnStage('printer', 'lamination')).toBe(true)
    })

    it('can work on cutting', () => {
      expect(canWorkOnStage('printer', 'cutting')).toBe(true)
    })

    it('can work on selection_pouring (helper)', () => {
      expect(canWorkOnStage('printer', 'selection_pouring')).toBe(true)
    })

    it('can work on pouring (helper)', () => {
      expect(canWorkOnStage('printer', 'pouring')).toBe(true)
    })

    it('can work on assembly_3d (helper)', () => {
      expect(canWorkOnStage('printer', 'assembly_3d')).toBe(true)
    })

    it('can work on packaging (helper)', () => {
      expect(canWorkOnStage('printer', 'packaging')).toBe(true)
    })

    it('cannot work on design', () => {
      expect(canWorkOnStage('printer', 'design')).toBe(false)
    })
  })

  describe('post_printer permissions', () => {
    it('can work on selection_pouring', () => {
      expect(canWorkOnStage('post_printer', 'selection_pouring')).toBe(true)
    })

    it('can work on pouring', () => {
      expect(canWorkOnStage('post_printer', 'pouring')).toBe(true)
    })

    it('can work on assembly_3d', () => {
      expect(canWorkOnStage('post_printer', 'assembly_3d')).toBe(true)
    })

    it('can work on packaging', () => {
      expect(canWorkOnStage('post_printer', 'packaging')).toBe(true)
    })

    it('can work on cutting (helper)', () => {
      expect(canWorkOnStage('post_printer', 'cutting')).toBe(true)
    })

    it('can work on lamination (helper)', () => {
      expect(canWorkOnStage('post_printer', 'lamination')).toBe(true)
    })

    it('can work on print (helper)', () => {
      expect(canWorkOnStage('post_printer', 'print')).toBe(true)
    })

    it('cannot work on design', () => {
      expect(canWorkOnStage('post_printer', 'design')).toBe(false)
    })

    it('cannot work on prepress', () => {
      expect(canWorkOnStage('post_printer', 'prepress')).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('returns false for unknown role', () => {
      expect(canWorkOnStage('unknown_role', 'print')).toBe(false)
    })

    it('returns false for undefined role', () => {
      expect(canWorkOnStage(undefined, 'print')).toBe(false)
    })

    it('returns false for null role', () => {
      expect(canWorkOnStage(null, 'print')).toBe(false)
    })

    it('ROLE_STAGE_PERMISSIONS has all 5 roles', () => {
      expect(Object.keys(ROLE_STAGE_PERMISSIONS)).toEqual(
        expect.arrayContaining(['admin', 'manager', 'designer', 'printer', 'post_printer'])
      )
    })
  })
})
