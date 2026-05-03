import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const { mockToast, mockPlaySound, mockChannel, mockRemoveChannel, mockProfile } = vi.hoisted(() => {
  const mockToast = { info: vi.fn(), error: vi.fn() }
  const mockPlaySound = vi.fn()
  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  }
  const mockRemoveChannel = vi.fn()
  const mockProfile = { current: { id: 'user-1', role: 'printer', display_name: 'Test Printer' } }
  return { mockToast, mockPlaySound, mockChannel, mockRemoveChannel, mockProfile }
})

vi.mock('@/shared/stores/toast-store', () => ({ toast: mockToast }))
vi.mock('@/shared/lib/sound', () => ({ playNotificationSound: mockPlaySound }))
vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => mockChannel),
    removeChannel: mockRemoveChannel,
  },
}))
vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ profile: mockProfile.current }),
}))

import { useStageNotifications } from './useStageNotifications'

describe('useStageNotifications', () => {
  let channelCallback

  beforeEach(() => {
    vi.clearAllMocks()
    channelCallback = null
    mockProfile.current = { id: 'user-1', role: 'printer', display_name: 'Test Printer' }
    mockChannel.on.mockImplementation((type, config, cb) => {
      channelCallback = cb
      return mockChannel
    })
  })

  it('subscribes to stage-notifications channel on mount', async () => {
    renderHook(() => useStageNotifications())
    const { supabase } = await import('@/shared/lib/supabase')
    expect(supabase.channel).toHaveBeenCalledWith('stage-notifications')
    expect(mockChannel.subscribe).toHaveBeenCalled()
  })

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useStageNotifications())
    unmount()
    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel)
  })

  it('does not subscribe when profile is null', async () => {
    mockProfile.current = null
    const { supabase } = await import('@/shared/lib/supabase')
    renderHook(() => useStageNotifications())
    expect(supabase.channel).not.toHaveBeenCalled()
  })

  it('filters out self-notifications (changed_by === profile.id)', () => {
    renderHook(() => useStageNotifications())
    channelCallback({ new: { id: 'evt-1', to_status: 'print', changed_by: 'user-1' } })
    expect(mockPlaySound).not.toHaveBeenCalled()
    expect(mockToast.info).not.toHaveBeenCalled()
  })

  it('notifies when role matches NOTIFY_ROLES for the status', () => {
    renderHook(() => useStageNotifications())
    channelCallback({ new: { id: 'evt-2', to_status: 'print', changed_by: 'other-user' } })
    expect(mockPlaySound).toHaveBeenCalled()
    expect(mockToast.info).toHaveBeenCalledWith(expect.stringContaining('Печать'))
  })

  it('does NOT notify when role is not in NOTIFY_ROLES', () => {
    renderHook(() => useStageNotifications())
    channelCallback({ new: { id: 'evt-3', to_status: 'design', changed_by: 'other-user' } })
    expect(mockPlaySound).not.toHaveBeenCalled()
    expect(mockToast.info).not.toHaveBeenCalled()
  })

  it('deduplicates same event ID', () => {
    renderHook(() => useStageNotifications())
    const payload = { new: { id: 'evt-4', to_status: 'print', changed_by: 'other-user' } }
    channelCallback(payload)
    channelCallback(payload)
    expect(mockPlaySound).toHaveBeenCalledTimes(1)
    expect(mockToast.info).toHaveBeenCalledTimes(1)
  })

  it('uses statusLabel from ORDER_STATUSES in toast message', () => {
    mockProfile.current = { id: 'user-1', role: 'resin_pourer', display_name: 'Resin Worker' }
    renderHook(() => useStageNotifications())
    channelCallback({ new: { id: 'evt-5', to_status: 'resin_pouring', changed_by: 'other-user' } })
    expect(mockToast.info).toHaveBeenCalledWith('Новый заказ в очереди: Заливка смолой')
  })

  it('does not notify for statuses without NOTIFY_ROLES (done, new)', () => {
    mockProfile.current = { id: 'user-1', role: 'admin', display_name: 'Admin' }
    renderHook(() => useStageNotifications())
    channelCallback({ new: { id: 'evt-6', to_status: 'done', changed_by: 'other-user' } })
    channelCallback({ new: { id: 'evt-7', to_status: 'new', changed_by: 'other-user' } })
    expect(mockPlaySound).not.toHaveBeenCalled()
  })
})
