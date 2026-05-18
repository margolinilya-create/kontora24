import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.VITE_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

const { mockSupabase, mockStorageBucket, createClientMock } = vi.hoisted(() => {
  const mockStorageBucket = { remove: vi.fn().mockResolvedValue({ data: [], error: null }) }
  const mockSupabase = {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
    rpc: vi.fn(),
    storage: {
      from: vi.fn(() => mockStorageBucket),
    },
  }
  const createClientMock = vi.fn(() => mockSupabase)
  return { mockSupabase, mockStorageBucket, createClientMock }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }))

const { default: handler } = await import('./delete.js')

function buildReq({ method = 'DELETE', headers = {}, body = {} } = {}) {
  return { method, headers, body }
}

function buildRes() {
  const res = {}
  res.status = vi.fn((code) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((payload) => {
    res.body = payload
    return res
  })
  return res
}

function queueFrom(...builders) {
  for (const b of builders) mockSupabase.from.mockReturnValueOnce(b)
}

function profileLookup({ role }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: role ? { role } : null, error: null }),
  }
}

function attachmentsBuilder(rows) {
  // .from('k24_order_attachments').select('file_path').eq('order_id', orderId)
  // The terminal awaited call is .eq() → resolves to { data, error }.
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
  }
}

describe('DELETE /api/orders/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStorageBucket.remove.mockResolvedValue({ data: [], error: null })
  })

  it('returns 401 when Authorization header is missing', async () => {
    const req = buildReq({ headers: {} })
    const res = buildRes()
    await handler(req, res)
    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'Не авторизован' })
    expect(mockSupabase.rpc).not.toHaveBeenCalled()
  })

  it('returns 403 when caller is not admin', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'caller-1' } },
      error: null,
    })
    queueFrom(profileLookup({ role: 'printer' }))

    const req = buildReq({
      headers: { authorization: 'Bearer some-token' },
      body: { orderId: 'order-1' },
    })
    const res = buildRes()
    await handler(req, res)

    expect(res.statusCode).toBe(403)
    expect(res.body.error).toMatch(/администратор/i)
    expect(mockSupabase.rpc).not.toHaveBeenCalled()
  })

  it('happy path: clears storage, calls delete_order_cascade RPC, returns 200', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'admin-1' } },
      error: null,
    })

    queueFrom(
      profileLookup({ role: 'admin' }),
      attachmentsBuilder([
        { file_path: 'order-1/preview.jpg' },
        { file_path: 'order-1/macet.pdf' },
      ]),
    )

    mockSupabase.rpc.mockResolvedValue({ data: { success: true }, error: null })

    const req = buildReq({
      headers: { authorization: 'Bearer admin-token' },
      body: { orderId: 'order-1' },
    })
    const res = buildRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ success: true })
    // Storage cleared with the gathered file_paths
    expect(mockSupabase.storage.from).toHaveBeenCalledWith('order-files')
    expect(mockStorageBucket.remove).toHaveBeenCalledWith([
      'order-1/preview.jpg',
      'order-1/macet.pdf',
    ])
    // RPC called with correct args
    expect(mockSupabase.rpc).toHaveBeenCalledWith('delete_order_cascade', {
      p_order_id: 'order-1',
      p_caller: 'admin-1',
    })
  })
})
