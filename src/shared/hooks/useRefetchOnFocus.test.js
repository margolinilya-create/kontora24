import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRefetchOnFocus } from './useRefetchOnFocus'

describe('useRefetchOnFocus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('refetches when tab becomes visible after throttle window', () => {
    const refetch = vi.fn()
    renderHook(() => useRefetchOnFocus(refetch))

    // First visibility change inside throttle window — skipped
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(refetch).not.toHaveBeenCalled()

    // Past throttle window
    vi.advanceTimersByTime(31_000)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('does not refetch when tab becomes hidden', () => {
    const refetch = vi.fn()
    renderHook(() => useRefetchOnFocus(refetch))

    vi.advanceTimersByTime(31_000)
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(refetch).not.toHaveBeenCalled()
  })

  it('refetches on online event after throttle', () => {
    const refetch = vi.fn()
    renderHook(() => useRefetchOnFocus(refetch))

    vi.advanceTimersByTime(31_000)
    window.dispatchEvent(new Event('online'))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('refetches on window focus after throttle', () => {
    const refetch = vi.fn()
    renderHook(() => useRefetchOnFocus(refetch))

    vi.advanceTimersByTime(31_000)
    window.dispatchEvent(new Event('focus'))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('uses latest refetch via ref (does not re-subscribe on each render)', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ fn }) => useRefetchOnFocus(fn), {
      initialProps: { fn: first },
    })

    rerender({ fn: second })

    vi.advanceTimersByTime(31_000)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('throttles consecutive triggers to one per 30s window', () => {
    const refetch = vi.fn()
    renderHook(() => useRefetchOnFocus(refetch))

    vi.advanceTimersByTime(31_000)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('online'))

    expect(refetch).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(31_000)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(refetch).toHaveBeenCalledTimes(2)
  })

  it('cleans up listeners on unmount', () => {
    const refetch = vi.fn()
    const { unmount } = renderHook(() => useRefetchOnFocus(refetch))
    unmount()

    vi.advanceTimersByTime(31_000)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('online'))

    expect(refetch).not.toHaveBeenCalled()
  })
})
