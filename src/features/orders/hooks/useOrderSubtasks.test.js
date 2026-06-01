import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const { mockSupabase, mockCaptureError } = vi.hoisted(() => {
  const mockQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: vi.fn((resolve) => resolve({ data: [], error: null })),
  }

  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  }

  const mockSupabase = {
    from: vi.fn(() => mockQuery),
    rpc: vi.fn(),
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
    _mockQuery: mockQuery,
    _mockChannel: mockChannel,
  }

  const mockCaptureError = vi.fn()
  return { mockSupabase, mockCaptureError }
})

vi.mock('@/shared/lib/supabase', () => ({ supabase: mockSupabase }))
vi.mock('@/shared/lib/sentry', () => ({ captureError: mockCaptureError }))

import { useOrderSubtasks } from './useOrderSubtasks'

const bgRow = { id: 'sub-bg', order_id: 'order-1', track: 'backgrounds', status: 'queued' }
const stRow = { id: 'sub-st', order_id: 'order-1', track: 'stickers', status: 'queued' }

function mockSelectResponse(data, error = null) {
  mockSupabase.from.mockImplementation(() => {
    const q = mockSupabase._mockQuery
    q.select.mockReturnThis()
    q.eq.mockReturnThis()
    q.order.mockReturnThis()
    q.then = vi.fn((resolve) => resolve({ data, error }))
    return q
  })
}

describe('useOrderSubtasks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase._mockChannel.on.mockReturnThis()
    mockSupabase._mockChannel.subscribe.mockReturnThis()
    mockSelectResponse([bgRow, stRow])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('R11.3: грузит подзадачи всегда (extra_stickers возможны у любого типа)', async () => {
    const { result } = renderHook(() => useOrderSubtasks('order-1', false))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // С R11.3 fetch вызывается даже если isMulti=false — extras могут появиться
    // у любого заказа после кнопки CreateExtraStickers.
    expect(mockSupabase.from).toHaveBeenCalled()
    expect(result.current.extras).toEqual([])
  })

  it('skips fetching when orderId is null', async () => {
    const { result } = renderHook(() => useOrderSubtasks(null, true))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(mockSupabase.from).not.toHaveBeenCalled()
    expect(result.current.subtasks).toEqual({ backgrounds: null, stickers: null })
  })

  it('fetches and groups subtasks by track', async () => {
    const { result } = renderHook(() => useOrderSubtasks('order-1', true))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(mockSupabase.from).toHaveBeenCalledWith('k24_order_subtasks')
    expect(mockSupabase._mockQuery.select).toHaveBeenCalledWith('*')
    expect(mockSupabase._mockQuery.eq).toHaveBeenCalledWith('order_id', 'order-1')
    expect(result.current.subtasks.backgrounds).toEqual(bgRow)
    expect(result.current.subtasks.stickers).toEqual(stRow)
  })

  it('advance(track, toStatus) calls supabase.rpc("advance_subtask") with subtask id', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: { ok: true, new_status: 'printing', both_ready: false },
      error: null,
    })

    const { result } = renderHook(() => useOrderSubtasks('order-1', true))

    await waitFor(() => {
      expect(result.current.subtasks.backgrounds).toEqual(bgRow)
    })

    let returned
    await act(async () => {
      returned = await result.current.advance('backgrounds', 'printing')
    })

    expect(mockSupabase.rpc).toHaveBeenCalledWith('advance_subtask', {
      p_subtask_id: 'sub-bg',
      p_to_status: 'printing',
    })
    expect(returned).toEqual({ ok: true, new_status: 'printing', both_ready: false })
  })

  it('advance throws Error with server message when rpc returns ok=false', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: { ok: false, error: 'Нет прав на продвижение подзадач.' },
      error: null,
    })

    const { result } = renderHook(() => useOrderSubtasks('order-1', true))

    await waitFor(() => {
      expect(result.current.subtasks.stickers).toEqual(stRow)
    })

    await expect(
      act(async () => {
        await result.current.advance('stickers', 'printing')
      })
    ).rejects.toThrow('Нет прав на продвижение подзадач.')
  })

  it('advance throws when supabase.rpc returns an error object', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'network' },
    })

    const { result } = renderHook(() => useOrderSubtasks('order-1', true))

    await waitFor(() => {
      expect(result.current.subtasks.backgrounds).toEqual(bgRow)
    })

    await expect(
      act(async () => {
        await result.current.advance('backgrounds', 'printing')
      })
    ).rejects.toMatchObject({ message: 'network' })
  })

  it('advance throws when subtask for track is missing', async () => {
    mockSelectResponse([bgRow]) // только backgrounds, без stickers

    const { result } = renderHook(() => useOrderSubtasks('order-1', true))

    await waitFor(() => {
      expect(result.current.subtasks.backgrounds).toEqual(bgRow)
    })
    expect(result.current.subtasks.stickers).toBeNull()

    await expect(
      act(async () => {
        await result.current.advance('stickers', 'printing')
      })
    ).rejects.toThrow(/stickers/)

    expect(mockSupabase.rpc).not.toHaveBeenCalled()
  })

  it('subscribes to realtime channel for the order after mount', async () => {
    const { result } = renderHook(() => useOrderSubtasks('order-1', true))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(mockSupabase.channel).toHaveBeenCalledWith(
      expect.stringMatching(/^order-subtasks-order-1-/)
    )
    expect(mockSupabase._mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: '*',
        schema: 'public',
        table: 'k24_order_subtasks',
        filter: 'order_id=eq.order-1',
      }),
      expect.any(Function)
    )
    expect(mockSupabase._mockChannel.subscribe).toHaveBeenCalled()
  })

  it('removes realtime channel on unmount', async () => {
    const { result, unmount } = renderHook(() => useOrderSubtasks('order-1', true))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    unmount()
    expect(mockSupabase.removeChannel).toHaveBeenCalledWith(mockSupabase._mockChannel)
  })

  it('captures error via Sentry when select fails', async () => {
    mockSelectResponse(null, { message: 'db down' })

    const { result } = renderHook(() => useOrderSubtasks('order-1', true))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(mockCaptureError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'db down' }),
      expect.objectContaining({
        tags: { source: 'useOrderSubtasks.fetch' },
        extra: { orderId: 'order-1' },
      })
    )
    expect(result.current.error).toMatchObject({ message: 'db down' })
  })
})
