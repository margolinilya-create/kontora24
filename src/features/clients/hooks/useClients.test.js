import { describe, it, expect } from 'vitest'
import { normalizeClientName, escapeIlikePattern } from './useClients'

describe('normalizeClientName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeClientName('  ООО Ромашка  ')).toBe('ООО Ромашка')
  })
  it('collapses multiple internal spaces', () => {
    expect(normalizeClientName('Иван   Петров')).toBe('Иван Петров')
  })
  it('handles tabs and newlines', () => {
    expect(normalizeClientName('Иван\tПетров\n')).toBe('Иван Петров')
  })
  it('returns empty string for null/undefined/empty', () => {
    expect(normalizeClientName(null)).toBe('')
    expect(normalizeClientName(undefined)).toBe('')
    expect(normalizeClientName('')).toBe('')
    expect(normalizeClientName('   ')).toBe('')
  })
  it('preserves single spaces', () => {
    expect(normalizeClientName('A B C')).toBe('A B C')
  })
})

describe('escapeIlikePattern', () => {
  it('escapes percent', () => {
    expect(escapeIlikePattern('test%')).toBe('test\\%')
  })
  it('escapes underscore', () => {
    expect(escapeIlikePattern('a_b')).toBe('a\\_b')
  })
  it('escapes backslash', () => {
    expect(escapeIlikePattern('a\\b')).toBe('a\\\\b')
  })
  it('does not change normal text', () => {
    expect(escapeIlikePattern('ООО Ромашка')).toBe('ООО Ромашка')
  })
  it('handles empty/null', () => {
    expect(escapeIlikePattern('')).toBe('')
    expect(escapeIlikePattern(null)).toBe('')
  })
})
