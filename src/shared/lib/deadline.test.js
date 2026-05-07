import { describe, it, expect } from 'vitest'
import { getDeadlineLevel, getDeadlineClasses, getDeadlineBadgeClasses, getDeadlineDotClass, getDeadlineBorderClass } from './deadline'

describe('getDeadlineLevel', () => {
  const now = new Date('2026-05-07T12:00:00Z')

  it('returns null for empty/missing deadline', () => {
    expect(getDeadlineLevel(null, now)).toBe(null)
    expect(getDeadlineLevel(undefined, now)).toBe(null)
    expect(getDeadlineLevel('', now)).toBe(null)
  })

  it('returns null for invalid date string', () => {
    expect(getDeadlineLevel('not-a-date', now)).toBe(null)
  })

  it('returns urgent for past dates (overdue)', () => {
    expect(getDeadlineLevel('2026-05-06T12:00:00Z', now)).toBe('urgent')
    expect(getDeadlineLevel('2025-01-01T00:00:00Z', now)).toBe('urgent')
  })

  it('returns urgent when 1 day or less remains', () => {
    expect(getDeadlineLevel('2026-05-07T23:00:00Z', now)).toBe('urgent') // 11h
    expect(getDeadlineLevel('2026-05-08T11:00:00Z', now)).toBe('urgent') // 23h
    expect(getDeadlineLevel('2026-05-08T12:00:00Z', now)).toBe('urgent') // exactly 24h
  })

  it('returns warn when 2 days remain', () => {
    expect(getDeadlineLevel('2026-05-09T11:00:00Z', now)).toBe('warn')
    expect(getDeadlineLevel('2026-05-09T12:00:00Z', now)).toBe('warn')
  })

  it('returns ok when more than 2 days remain', () => {
    expect(getDeadlineLevel('2026-05-10T13:00:00Z', now)).toBe('ok')
    expect(getDeadlineLevel('2026-06-01T00:00:00Z', now)).toBe('ok')
  })
})

describe('getDeadlineClasses', () => {
  const now = new Date('2026-05-07T12:00:00Z')

  it('returns empty string when no deadline', () => {
    expect(getDeadlineClasses(null, now)).toBe('')
  })

  it('maps each level to a Tailwind text class', () => {
    expect(getDeadlineClasses('2026-05-06T12:00:00Z', now)).toBe('text-deadline-urgent')
    expect(getDeadlineClasses('2026-05-09T12:00:00Z', now)).toBe('text-deadline-warn')
    expect(getDeadlineClasses('2026-06-01T00:00:00Z', now)).toBe('text-deadline-ok')
  })
})

describe('getDeadlineBadgeClasses', () => {
  const now = new Date('2026-05-07T12:00:00Z')

  it('returns badge classes for each level', () => {
    expect(getDeadlineBadgeClasses('2026-05-06T12:00:00Z', now)).toBe('bg-deadline-urgent/15 text-deadline-urgent')
    expect(getDeadlineBadgeClasses('2026-05-09T12:00:00Z', now)).toBe('bg-deadline-warn/15 text-deadline-warn')
    expect(getDeadlineBadgeClasses('2026-06-01T00:00:00Z', now)).toBe('bg-deadline-ok/15 text-deadline-ok')
  })

  it('returns empty string when no deadline', () => {
    expect(getDeadlineBadgeClasses(null, now)).toBe('')
  })
})

describe('getDeadlineDotClass / getDeadlineBorderClass', () => {
  const now = new Date('2026-05-07T12:00:00Z')

  it('dot class matches level', () => {
    expect(getDeadlineDotClass('2026-05-06T12:00:00Z', now)).toBe('bg-deadline-urgent')
    expect(getDeadlineDotClass('2026-05-09T12:00:00Z', now)).toBe('bg-deadline-warn')
    expect(getDeadlineDotClass('2026-06-01T00:00:00Z', now)).toBe('bg-deadline-ok')
    expect(getDeadlineDotClass(null, now)).toBe('')
  })

  it('border class matches level', () => {
    expect(getDeadlineBorderClass('2026-05-06T12:00:00Z', now)).toBe('border-deadline-urgent')
    expect(getDeadlineBorderClass('2026-05-09T12:00:00Z', now)).toBe('border-deadline-warn')
    expect(getDeadlineBorderClass('2026-06-01T00:00:00Z', now)).toBe('border-deadline-ok')
    expect(getDeadlineBorderClass(null, now)).toBe('')
  })
})
