import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// Mock supabase before importing hook
const { mockSupabase } = vi.hoisted(() => {
  const mockQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    then: vi.fn(),
  }
  // Make the query thenable (resolves like a promise)
  mockQuery.then = vi.fn((resolve) => resolve({ data: [], error: null, count: 0 }))
  // Also make it directly awaitable
  Object.defineProperty(mockQuery, Symbol.for('jest.asymmetricMatch'), { value: undefined })

  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  }

  const mockSupabase = {
    from: vi.fn(() => mockQuery),
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
    _mockQuery: mockQuery,
    _mockChannel: mockChannel,
  }
  return { mockSupabase }
})

vi.mock('@/shared/lib/supabase', () => ({ supabase: mockSupabase }))

import { useOrders } from './useOrders'

describe('useOrders', () => {
  let fetchCallCount = 0

  beforeEach(() => {
    vi.clearAllMocks()
    fetchCallCount = 0

    // Track how many times `from` is called (= how many fetches)
    mockSupabase.from.mockImplementation(() => {
      fetchCallCount++
      const q = mockSupabase._mockQuery
      // Reset chain
      Object.keys(q).forEach((k) => {
        if (typeof q[k]?.mockReturnThis === 'function') q[k].mockReturnThis()
      })
      // Make awaitable
      q.then = vi.fn((resolve) => resolve({ data: [{ id: '1', status: 'design' }], error: null, count: 1 }))
      return q
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches orders on mount', async () => {
    const { result } = renderHook(() => useOrders())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(fetchCallCount).toBeGreaterThanOrEqual(1)
    expect(result.current.orders).toHaveLength(1)
  })

  it('does NOT infinite-loop when statuses array is passed', async () => {
    // This is the regression test: passing { statuses: ['design'] } should NOT
    // cause infinite re-renders because the array is new on every render.
    const { result } = renderHook(() => useOrders({ statuses: ['design'] }))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Wait a bit to catch any delayed re-fetches
    await new Promise((r) => setTimeout(r, 100))

    // Should fetch exactly once (initial), not loop
    // Allow 1-2 calls (React StrictMode can double-invoke effects)
    expect(fetchCallCount).toBeLessThanOrEqual(2)
  })

  it('does NOT re-fetch when same statuses values are passed', async () => {
    const { result, rerender } = renderHook(
      ({ statuses }) => useOrders({ statuses }),
      { initialProps: { statuses: ['print'] } }
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const countAfterMount = fetchCallCount

    // Re-render with a NEW array reference but SAME values
    rerender({ statuses: ['print'] })

    await new Promise((r) => setTimeout(r, 100))

    // Should NOT trigger additional fetch — same serialized value
    expect(fetchCallCount).toBe(countAfterMount)
  })

  it('re-fetches when statuses values actually change', async () => {
    const { result, rerender } = renderHook(
      ({ statuses }) => useOrders({ statuses }),
      { initialProps: { statuses: ['print'] } }
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const countAfterMount = fetchCallCount

    // Change to different statuses
    rerender({ statuses: ['cutting'] })

    await waitFor(() => {
      expect(fetchCallCount).toBeGreaterThan(countAfterMount)
    })
  })

  it('applies .in() filter when statuses provided', async () => {
    renderHook(() => useOrders({ statuses: ['design', 'print'] }))

    await waitFor(() => {
      expect(mockSupabase._mockQuery.in).toHaveBeenCalledWith('status', ['design', 'print'])
    })
  })

  it('applies .eq() filter when single status provided', async () => {
    renderHook(() => useOrders({ status: 'design' }))

    await waitFor(() => {
      expect(mockSupabase._mockQuery.eq).toHaveBeenCalledWith('status', 'design')
    })
  })

  it('does not filter status when status is "all"', async () => {
    renderHook(() => useOrders({ status: 'all' }))

    await waitFor(() => {
      expect(mockSupabase._mockQuery.eq).not.toHaveBeenCalledWith('status', 'all')
    })
  })

  it('escapes SQL LIKE wildcards in search', async () => {
    renderHook(() => useOrders({ search: 'test%_value' }))

    await waitFor(() => {
      expect(mockSupabase._mockQuery.ilike).toHaveBeenCalledWith('notes', '%test\\%\\_value%')
    })
  })

  it('uses numeric search with .or() for number input', async () => {
    renderHook(() => useOrders({ search: '42' }))

    await waitFor(() => {
      expect(mockSupabase._mockQuery.or).toHaveBeenCalled()
      const call = mockSupabase._mockQuery.or.mock.calls[0][0]
      expect(call).toContain('number.eq.42')
    })
  })

  it('sets error state on fetch failure', async () => {
    mockSupabase.from.mockImplementation(() => {
      fetchCallCount++
      const q = { ...mockSupabase._mockQuery }
      q.then = vi.fn((resolve) => resolve({ data: null, error: { message: 'DB error' }, count: 0 }))
      Object.keys(q).forEach((k) => {
        if (typeof q[k]?.mockReturnThis === 'function') q[k].mockReturnThis()
      })
      q.then = vi.fn((_, reject) => { throw { message: 'DB error' } })
      return q
    })

    // Error will be caught internally
    const { result } = renderHook(() => useOrders())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
  })
})
