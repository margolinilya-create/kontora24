import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.VITE_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

const { mockSupabase, createClientMock } = vi.hoisted(() => {
  const mockSupabase = {
    auth: {
      getUser: vi.fn(),
      admin: {
        deleteUser: vi.fn(),
      },
    },
    from: vi.fn(),
  }
  const createClientMock = vi.fn(() => mockSupabase)
  return { mockSupabase, createClientMock }
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

/**
 * Helper: configure mockSupabase.from() with a queue of builders.
 * Each builder is a plain object with chainable methods.
 */
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

function ordersUpdateBuilder() {
  // .from('k24_orders').update({...}).eq('assigned_to', userId) — eq is the terminal awaited call.
  const builder = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ error: null }),
  }
  return builder
}

function profilesDeleteBuilder() {
  // .from('k24_profiles').delete().eq('id', userId)
  const builder = {
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ error: null }),
  }
  return builder
}

describe('DELETE /api/users/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when Authorization header is missing', async () => {
    const req = buildReq({ headers: {} })
    const res = buildRes()
    await handler(req, res)
    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'Не авторизован' })
  })

  it('returns 403 when caller is not admin', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'caller-1' } },
      error: null,
    })
    queueFrom(profileLookup({ role: 'manager' }))

    const req = buildReq({
      headers: { authorization: 'Bearer some-token' },
      body: { userId: 'target-1' },
    })
    const res = buildRes()
    await handler(req, res)

    expect(res.statusCode).toBe(403)
    expect(res.body.error).toMatch(/администратор/i)
    expect(mockSupabase.auth.admin.deleteUser).not.toHaveBeenCalled()
  })

  it('returns 400 when admin tries to self-delete', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'admin-1' } },
      error: null,
    })
    queueFrom(profileLookup({ role: 'admin' }))

    const req = buildReq({
      headers: { authorization: 'Bearer admin-token' },
      body: { userId: 'admin-1' }, // same as caller
    })
    const res = buildRes()
    await handler(req, res)

    expect(res.statusCode).toBe(400)
    expect(res.body.error).toMatch(/собственный аккаунт/i)
    expect(mockSupabase.auth.admin.deleteUser).not.toHaveBeenCalled()
  })

  it('happy path: nulls assigned_to, deletes auth user, then deletes profile', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'admin-1' } },
      error: null,
    })

    const adminProfile = profileLookup({ role: 'admin' })
    const ordersUpdate = ordersUpdateBuilder()
    const profilesDelete = profilesDeleteBuilder()
    queueFrom(adminProfile, ordersUpdate, profilesDelete)

    mockSupabase.auth.admin.deleteUser.mockResolvedValue({ error: null })

    const req = buildReq({
      headers: { authorization: 'Bearer admin-token' },
      body: { userId: 'target-1' },
    })
    const res = buildRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ success: true })
    // Verify k24_orders.update({ assigned_to: null }).eq('assigned_to', 'target-1')
    expect(ordersUpdate.update).toHaveBeenCalledWith({ assigned_to: null })
    expect(ordersUpdate.eq).toHaveBeenCalledWith('assigned_to', 'target-1')
    // auth.admin.deleteUser called with userId
    expect(mockSupabase.auth.admin.deleteUser).toHaveBeenCalledWith('target-1')
    // Profile safety-delete
    expect(profilesDelete.delete).toHaveBeenCalled()
    expect(profilesDelete.eq).toHaveBeenCalledWith('id', 'target-1')
  })
})
