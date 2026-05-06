import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}))

vi.mock('./sentry', () => ({
  captureError: vi.fn(),
}))

import { safeRpc } from './safeRpc'
import { supabase } from './supabase'
import { captureError } from './sentry'

describe('safeRpc', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns undefined on successful RPC', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: { ok: true }, error: null })
    const result = await safeRpc('test_rpc', { p_id: 1 })
    expect(result).toBeUndefined()
    expect(supabase.rpc).toHaveBeenCalledWith('test_rpc', { p_id: 1 })
    expect(captureError).not.toHaveBeenCalled()
  })

  it('calls captureError when RPC returns error', async () => {
    const rpcErr = { code: '42501', message: 'permission denied' }
    supabase.rpc.mockResolvedValueOnce({ data: null, error: rpcErr })
    await safeRpc('test_rpc', { p_id: 1 })
    expect(captureError).toHaveBeenCalledTimes(1)
    expect(captureError).toHaveBeenCalledWith(rpcErr, expect.objectContaining({
      tags: expect.objectContaining({ rpc: 'test_rpc' }),
    }))
  })

  it('does NOT throw even when RPC fails (caller continues)', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: new Error('boom') })
    await expect(safeRpc('test_rpc', {})).resolves.toBeUndefined()
  })

  it('does NOT throw even when supabase.rpc itself rejects', async () => {
    supabase.rpc.mockRejectedValueOnce(new Error('network'))
    await expect(safeRpc('test_rpc', {})).resolves.toBeUndefined()
    expect(captureError).toHaveBeenCalledTimes(1)
  })

  it('uses fallback source "safeRpc.<rpcName>" when no context.source', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: new Error('e') })
    await safeRpc('my_rpc_name', {})
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
      tags: expect.objectContaining({ source: 'safeRpc.my_rpc_name', rpc: 'my_rpc_name' }),
    }))
  })

  it('uses provided context.source when given', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: new Error('e') })
    await safeRpc('my_rpc', {}, { source: 'updateOrderStatus.deduct' })
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
      tags: expect.objectContaining({ source: 'updateOrderStatus.deduct', rpc: 'my_rpc' }),
    }))
  })

  it('passes through context.extra to captureError', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: new Error('e') })
    await safeRpc('my_rpc', { p: 1 }, { extra: { orderId: 'abc-123', stage: 'print' } })
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
      extra: { orderId: 'abc-123', stage: 'print' },
    }))
  })
})
