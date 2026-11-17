import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.VITE_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

const { mockSupabase, createClientMock } = vi.hoisted(() => {
  const mockSupabase = {
    auth: {
      getUser: vi.fn(),
      admin: { updateUserById: vi.fn() },
    },
    from: vi.fn(),
  }
  const createClientMock = vi.fn(() => mockSupabase)
  return { mockSupabase, createClientMock }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }))

const { default: handler } = await import('./update.js')

function buildRes() {
  const res = {}
  res.status = vi.fn((code) => { res.statusCode = code; return res })
  res.json = vi.fn((payload) => { res.body = payload; return res })
  return res
}

function profileLookup(role) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: role ? { role } : null, error: null }),
  }
}

function adminCount(count) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ count, error: null }),
  }
}

function req(body) {
  return { method: 'PUT', headers: { authorization: 'Bearer t' }, body }
}

describe('PUT /api/users/update', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null })
  })

  it('401 без деталей наружу при плохом токене', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: null, error: { message: 'jwt malformed' } })
    const res = buildRes()
    await handler(req({ userId: 'x' }), res)
    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'Недействительный токен' })
  })

  it('запрещает админу понизить собственную роль', async () => {
    mockSupabase.from.mockReturnValueOnce(profileLookup('admin'))
    const res = buildRes()
    await handler(req({ userId: 'admin-1', role: 'manager' }), res)
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toMatch(/собственную роль/)
  })

  it('запрещает снять роль с последнего администратора', async () => {
    mockSupabase.from
      .mockReturnValueOnce(profileLookup('admin')) // caller
      .mockReturnValueOnce(profileLookup('admin')) // target
      .mockReturnValueOnce(adminCount(1))
    const res = buildRes()
    await handler(req({ userId: 'admin-2', role: 'printer' }), res)
    expect(res.statusCode).toBe(409)
    expect(res.body.error).toMatch(/последнего администратора/)
  })

  it('разрешает понизить админа, если админов больше одного', async () => {
    const profileUpdate = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) }
    mockSupabase.from
      .mockReturnValueOnce(profileLookup('admin'))
      .mockReturnValueOnce(profileLookup('admin'))
      .mockReturnValueOnce(adminCount(2))
      .mockReturnValueOnce(profileUpdate)
    const res = buildRes()
    await handler(req({ userId: 'admin-2', role: 'printer' }), res)
    expect(res.statusCode).toBe(200)
    expect(profileUpdate.update).toHaveBeenCalledWith({ role: 'printer' })
  })
})
