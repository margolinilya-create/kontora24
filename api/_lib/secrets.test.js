import { describe, it, expect } from 'vitest'
import { secretsEqual } from './secrets.js'

describe('secretsEqual', () => {
  it('true только при полном совпадении', () => {
    expect(secretsEqual('abc', 'abc')).toBe(true)
    expect(secretsEqual('abc', 'abd')).toBe(false)
    expect(secretsEqual('a', 'abcdef')).toBe(false)
  })
  it('false при пустых/нестроковых значениях (в т.ч. не настроенном секрете)', () => {
    expect(secretsEqual('', '')).toBe(false)
    expect(secretsEqual(undefined, 'x')).toBe(false)
    expect(secretsEqual('x', undefined)).toBe(false)
    expect(secretsEqual(['x'], 'x')).toBe(false)
  })
})
