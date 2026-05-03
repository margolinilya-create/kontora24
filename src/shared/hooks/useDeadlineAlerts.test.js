import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const { mockToast, mockLimit } = vi.hoisted(() => {
  const mockLimit = vi.fn().mockResolvedValue({ data: [] })
  const mockToast = { error: vi.fn(), info: vi.fn() }
  return { mockToast, mockLimit }
})

vi.mock('@/shared/stores/toast-store', () => ({ toast: mockToast }))
vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: mockLimit,
    })),
  },
}))

import { useDeadlineAlerts } from './useDeadlineAlerts'

// Helper: flush setTimeout(fn, 3000) + microtasks
async function flushDelayedCheck() {
  await vi.advanceTimersByTimeAsync(3100)
}

describe('useDeadlineAlerts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    vi.clearAllMocks()
    mockLimit.mockResolvedValue({ data: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not fire immediately (waits 3s delay)', () => {
    renderHook(() => useDeadlineAlerts())
    expect(mockToast.error).not.toHaveBeenCalled()
    expect(mockToast.info).not.toHaveBeenCalled()
  })

  it('shows error toast for overdue orders', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    mockLimit.mockResolvedValue({
      data: [
        { number: 1, deadline: yesterday, status: 'print' },
        { number: 2, deadline: yesterday, status: 'design' },
      ],
    })

    renderHook(() => useDeadlineAlerts())
    await flushDelayedCheck()

    expect(mockToast.error).toHaveBeenCalledWith('Просрочено: #1, #2')
  })

  it('shows info toast for upcoming deadlines (today/tomorrow)', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
    mockLimit.mockResolvedValue({
      data: [{ number: 5, deadline: tomorrow, status: 'assembly' }],
    })

    renderHook(() => useDeadlineAlerts())
    await flushDelayedCheck()

    expect(mockToast.info).toHaveBeenCalledWith('Дедлайн сегодня/завтра: #5')
  })

  it('respects localStorage dismissal — skips already-shown orders', async () => {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    localStorage.setItem(`deadline_alerts_${today}`, JSON.stringify([3]))

    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    mockLimit.mockResolvedValue({
      data: [
        { number: 3, deadline: yesterday, status: 'print' },
        { number: 4, deadline: yesterday, status: 'design' },
      ],
    })

    renderHook(() => useDeadlineAlerts())
    await flushDelayedCheck()

    expect(mockToast.error).toHaveBeenCalledWith('Просрочено: #4')
  })

  it('saves shown orders to localStorage after displaying', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    mockLimit.mockResolvedValue({
      data: [{ number: 7, deadline: yesterday, status: 'print' }],
    })

    renderHook(() => useDeadlineAlerts())
    await flushDelayedCheck()

    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const dismissed = JSON.parse(localStorage.getItem(`deadline_alerts_${today}`))
    expect(dismissed).toContain(7)
  })

  it('only runs once per mount (hasChecked ref)', async () => {
    mockLimit.mockResolvedValue({ data: [] })

    const { rerender } = renderHook(() => useDeadlineAlerts())
    await flushDelayedCheck()

    expect(mockLimit).toHaveBeenCalledTimes(1)

    rerender()
    await flushDelayedCheck()
    expect(mockLimit).toHaveBeenCalledTimes(1)
  })

  it('does not show toast when all orders already dismissed', async () => {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    localStorage.setItem(`deadline_alerts_${today}`, JSON.stringify([1, 2]))

    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    mockLimit.mockResolvedValue({
      data: [
        { number: 1, deadline: yesterday, status: 'print' },
        { number: 2, deadline: yesterday, status: 'design' },
      ],
    })

    renderHook(() => useDeadlineAlerts())
    await flushDelayedCheck()

    expect(mockToast.error).not.toHaveBeenCalled()
    expect(mockToast.info).not.toHaveBeenCalled()
  })

  it('handles null data gracefully', async () => {
    mockLimit.mockResolvedValue({ data: null })
    renderHook(() => useDeadlineAlerts())
    await flushDelayedCheck()

    expect(mockToast.error).not.toHaveBeenCalled()
  })

  it('does not crash on supabase error', async () => {
    mockLimit.mockRejectedValue(new Error('Network error'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    renderHook(() => useDeadlineAlerts())
    await flushDelayedCheck()

    expect(consoleSpy).toHaveBeenCalled()
    expect(mockToast.error).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
