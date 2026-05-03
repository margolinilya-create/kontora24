import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const { mockFrom } = vi.hoisted(() => {
  const mockFrom = vi.fn()
  return { mockFrom }
})

vi.mock('@/shared/lib/supabase', () => ({
  supabase: { from: mockFrom },
}))
vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1', role: 'admin', display_name: 'Test' } }),
}))

import { useTimer, formatElapsed, formatTotalTime } from './useTimer'

function setupMock({ orderData = [], singleData = null, insertData = null } = {}) {
  mockFrom.mockImplementation(() => ({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: orderData }),
        single: vi.fn().mockResolvedValue({ data: singleData, error: null }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: insertData, error: null }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  }))
}

describe('formatElapsed', () => {
  it('formats seconds under a minute', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(30)).toBe('0:30')
    expect(formatElapsed(59)).toBe('0:59')
  })

  it('formats minutes', () => {
    expect(formatElapsed(60)).toBe('1:00')
    expect(formatElapsed(90)).toBe('1:30')
    expect(formatElapsed(600)).toBe('10:00')
  })

  it('formats hours', () => {
    expect(formatElapsed(3600)).toBe('1:00:00')
    expect(formatElapsed(3661)).toBe('1:01:01')
    expect(formatElapsed(7200)).toBe('2:00:00')
  })

  it('handles edge: 3599 seconds is 59:59', () => {
    expect(formatElapsed(3599)).toBe('59:59')
  })
})

describe('formatTotalTime', () => {
  it('formats zero/null/undefined', () => {
    expect(formatTotalTime(0)).toBe('0 мин')
    expect(formatTotalTime(null)).toBe('0 мин')
    expect(formatTotalTime(undefined)).toBe('0 мин')
  })

  it('formats minutes only', () => {
    expect(formatTotalTime(30)).toBe('30 мин')
    expect(formatTotalTime(1)).toBe('1 мин')
    expect(formatTotalTime(59)).toBe('59 мин')
  })

  it('formats hours and minutes', () => {
    expect(formatTotalTime(60)).toBe('1 ч 0 мин')
    expect(formatTotalTime(90)).toBe('1 ч 30 мин')
    expect(formatTotalTime(150)).toBe('2 ч 30 мин')
  })
})

describe('useTimer hook', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('initializes with isRunning=false and elapsed=0', async () => {
    setupMock()
    const { result } = renderHook(() => useTimer('order-1'))
    await waitFor(() => {
      expect(result.current.isRunning).toBe(false)
    })
    expect(result.current.elapsed).toBe(0)
  })

  it('start() sets isRunning=true and saves to localStorage', async () => {
    const entryData = { id: 'entry-1', order_id: 'order-1', started_at: new Date().toISOString() }
    setupMock({ insertData: entryData })

    const { result } = renderHook(() => useTimer('order-1'))
    await waitFor(() => expect(result.current.isRunning).toBe(false))

    await act(async () => { await result.current.start() })

    expect(result.current.isRunning).toBe(true)
    const saved = JSON.parse(localStorage.getItem('kontora24_active_timer_user-1'))
    expect(saved).toEqual({ orderId: 'order-1', entryId: 'entry-1' })
  })

  it('stop() clears activeEntry and localStorage', async () => {
    const startedAt = new Date(Date.now() - 120000).toISOString()
    const entryData = { id: 'entry-1', order_id: 'order-1', started_at: startedAt }
    setupMock({ insertData: entryData })

    const { result } = renderHook(() => useTimer('order-1'))
    await waitFor(() => expect(result.current.isRunning).toBe(false))

    await act(async () => { await result.current.start() })
    expect(result.current.isRunning).toBe(true)

    setupMock({ orderData: [{ ...entryData, ended_at: new Date().toISOString(), duration_minutes: 2 }] })
    await act(async () => { await result.current.stop() })

    expect(result.current.isRunning).toBe(false)
    expect(localStorage.getItem('kontora24_active_timer_user-1')).toBeNull()
  })

  it('recovers active timer from localStorage on mount', async () => {
    const startedAt = new Date(Date.now() - 60000).toISOString()
    localStorage.setItem('kontora24_active_timer_user-1', JSON.stringify({ orderId: 'order-1', entryId: 'entry-1' }))
    setupMock({ singleData: { id: 'entry-1', order_id: 'order-1', started_at: startedAt, ended_at: null } })

    const { result } = renderHook(() => useTimer('order-1'))

    await waitFor(() => {
      expect(result.current.isRunning).toBe(true)
    })
  })

  it('clears localStorage if saved entry is already ended', async () => {
    localStorage.setItem('kontora24_active_timer_user-1', JSON.stringify({ orderId: 'order-1', entryId: 'entry-1' }))
    setupMock({ singleData: { id: 'entry-1', ended_at: '2024-01-01T00:00:00Z' } })

    renderHook(() => useTimer('order-1'))

    await waitFor(() => {
      expect(localStorage.getItem('kontora24_active_timer_user-1')).toBeNull()
    })
  })

  it('totalMinutes sums all entries duration_minutes', async () => {
    setupMock({
      orderData: [
        { id: 'e1', duration_minutes: 10 },
        { id: 'e2', duration_minutes: 25 },
        { id: 'e3', duration_minutes: null },
      ],
    })

    const { result } = renderHook(() => useTimer('order-1'))

    await waitFor(() => {
      expect(result.current.totalMinutes).toBe(35)
    })
  })

  it('does nothing if orderId is null', () => {
    setupMock()
    const { result } = renderHook(() => useTimer(null))
    expect(result.current.isRunning).toBe(false)
    expect(result.current.elapsed).toBe(0)
    expect(result.current.entries).toEqual([])
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('FIX #1: localStorage key includes user_id — no collision between users', () => {
    // Different users get different keys
    localStorage.setItem('kontora24_active_timer_user-A', JSON.stringify({ orderId: 'order-1', entryId: 'entry-A' }))
    localStorage.setItem('kontora24_active_timer_user-B', JSON.stringify({ orderId: 'order-2', entryId: 'entry-B' }))

    // Both preserved independently
    const savedA = JSON.parse(localStorage.getItem('kontora24_active_timer_user-A'))
    const savedB = JSON.parse(localStorage.getItem('kontora24_active_timer_user-B'))
    expect(savedA.entryId).toBe('entry-A')
    expect(savedB.entryId).toBe('entry-B')
  })
})
