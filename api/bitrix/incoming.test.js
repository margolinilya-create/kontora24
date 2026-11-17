import { describe, it, expect, vi, beforeEach } from 'vitest'

// Env vars must be set before the handler module is imported (it constructs the
// supabase client at module load). We set them here at the top of the file.
process.env.VITE_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
process.env.BITRIX_WEBHOOK_SECRET = 'test-secret'

const { mockSupabase, createClientMock } = vi.hoisted(() => {
  const mockSupabase = { from: vi.fn() }
  const createClientMock = vi.fn(() => mockSupabase)
  return { mockSupabase, createClientMock }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }))

// Dynamic import after env + mocks are in place
const { default: handler } = await import('./incoming.js')

/** Build a minimal Vercel req object */
function buildReq({ method = 'POST', headers = {}, body = {} } = {}) {
  return {
    method,
    headers: { 'x-bitrix-secret': 'test-secret', ...headers },
    body,
  }
}

/** Build a minimal Vercel res object that captures status + payload */
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
 * Create a chainable Supabase query builder mock.
 * Lets us script the terminal method (single/maybeSingle) per-call.
 */
function makeQueryBuilder(terminalResults = []) {
  let i = 0
  const next = () => terminalResults[i++] ?? { data: null, error: null }
  const builder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(() => Promise.resolve(next())),
    single: vi.fn(() => Promise.resolve(next())),
    // For inserts without .select() chain — the insert() itself resolves
    then: undefined,
  }
  return builder
}

/** R25.7A: первый вызов — поиск типа в реестре k24_order_types. */
const knownTypeBuilder = () => makeQueryBuilder([{ data: { key: 'sticker_cut' }, error: null }])

const VALID_BODY = {
  order_type: 'sticker_cut',
  width_mm: 50,
  height_mm: 50,
  qty: 100,
  client_name: 'Acme',
  deadline: '2026-06-01',
  notes: 'test',
  bitrix_deal_id: 'DEAL-123',
}

describe('POST /api/bitrix/incoming', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 405 for non-POST methods', async () => {
    const req = buildReq({ method: 'GET' })
    const res = buildRes()
    await handler(req, res)
    expect(res.statusCode).toBe(405)
    expect(res.body).toEqual({ error: 'Method not allowed' })
  })

  it('returns 401 when x-bitrix-secret header is missing', async () => {
    const req = buildReq({ headers: { 'x-bitrix-secret': '' }, body: VALID_BODY })
    const res = buildRes()
    await handler(req, res)
    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it('returns 401 when x-bitrix-secret header is wrong', async () => {
    const req = buildReq({ headers: { 'x-bitrix-secret': 'wrong' }, body: VALID_BODY })
    const res = buildRes()
    await handler(req, res)
    expect(res.statusCode).toBe(401)
  })

  it('returns 400 when required fields are missing (no qty)', async () => {
    const { qty: _omit, ...incomplete } = VALID_BODY
    const req = buildReq({ body: incomplete })
    const res = buildRes()
    await handler(req, res)
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toMatch(/Missing required fields/)
  })

  it('happy path: creates new client + order, returns 200 + order_id/number', async () => {
    // Call sequence:
    // 1) k24_clients .select().eq().limit().maybeSingle() → null (not found)
    // 2) k24_clients .insert().select().single() → newClient { id: 'client-1' }
    // 3) k24_orders .insert().select().single() → order { id: 'order-1', number: 42 }
    // 4) k24_order_status_history .insert() → { error: null }
    const clientSearchBuilder = makeQueryBuilder([{ data: null, error: null }])
    const clientInsertBuilder = makeQueryBuilder([{ data: { id: 'client-1' }, error: null }])
    const orderInsertBuilder = makeQueryBuilder([
      { data: { id: 'order-1', number: 42 }, error: null },
    ])
    // History insert doesn't chain .single — it's awaited directly. Return a resolved promise.
    const historyBuilder = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    }

    mockSupabase.from
      .mockReturnValueOnce(knownTypeBuilder()) // order type lookup
      .mockReturnValueOnce(clientSearchBuilder) // client search
      .mockReturnValueOnce(clientInsertBuilder) // client insert
      .mockReturnValueOnce(orderInsertBuilder) // order insert
      .mockReturnValueOnce(historyBuilder) // history insert

    const req = buildReq({ body: VALID_BODY })
    const res = buildRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({
      success: true,
      order_id: 'order-1',
      order_number: 42,
    })
    expect(res.body.kontora_url).toMatch(/\/orders\/order-1$/)
    // Verify call order
    expect(mockSupabase.from).toHaveBeenNthCalledWith(1, 'k24_order_types')
    expect(mockSupabase.from).toHaveBeenNthCalledWith(2, 'k24_clients')
    expect(mockSupabase.from).toHaveBeenNthCalledWith(3, 'k24_clients')
    expect(mockSupabase.from).toHaveBeenNthCalledWith(4, 'k24_orders')
    expect(mockSupabase.from).toHaveBeenNthCalledWith(5, 'k24_order_status_history')
    expect(orderInsertBuilder.insert.mock.calls[0][0].order_type).toBe('sticker_cut')
    // history error was null → no impact
  })

  it('returns 500 with detail when k24_clients insert fails (H2 behaviour)', async () => {
    // 1) client search → not found
    // 2) client insert → error
    const clientSearchBuilder = makeQueryBuilder([{ data: null, error: null }])
    const clientInsertBuilder = makeQueryBuilder([
      { data: null, error: { code: '23505', message: 'duplicate key value' } },
    ])

    mockSupabase.from
      .mockReturnValueOnce(knownTypeBuilder())
      .mockReturnValueOnce(clientSearchBuilder)
      .mockReturnValueOnce(clientInsertBuilder)

    const req = buildReq({ body: VALID_BODY })
    const res = buildRes()
    await handler(req, res)

    expect(res.statusCode).toBe(500)
    expect(res.body).toMatchObject({
      error: 'Client create failed',
      detail: 'duplicate key value',
    })
    // Order should NOT have been touched
    expect(mockSupabase.from).toHaveBeenCalledTimes(3)
  })

  it('dedup: when client with same name exists, reuses id and skips insert', async () => {
    // 1) client search → existing { id: 'existing-client' }
    // 2) order insert → order
    // 3) history insert → ok
    const clientSearchBuilder = makeQueryBuilder([
      { data: { id: 'existing-client' }, error: null },
    ])
    const orderInsertBuilder = makeQueryBuilder([
      { data: { id: 'order-2', number: 7 }, error: null },
    ])
    const historyBuilder = { insert: vi.fn().mockResolvedValue({ error: null }) }

    mockSupabase.from
      .mockReturnValueOnce(knownTypeBuilder())
      .mockReturnValueOnce(clientSearchBuilder)
      .mockReturnValueOnce(orderInsertBuilder)
      .mockReturnValueOnce(historyBuilder)

    const req = buildReq({ body: VALID_BODY })
    const res = buildRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body.order_id).toBe('order-2')
    // Only 4 .from() calls (type lookup + client search + order + history) — no client insert
    expect(mockSupabase.from).toHaveBeenCalledTimes(4)
    expect(mockSupabase.from).toHaveBeenNthCalledWith(3, 'k24_orders')
    // Verify the order was inserted with the existing client_id
    const insertArgs = orderInsertBuilder.insert.mock.calls[0][0]
    expect(insertArgs.client_id).toBe('existing-client')
  })

  it('R25.7A: неизвестный тип → заказ без типа (NULL) + предупреждение в k24_integration_log', async () => {
    const typeBuilder = makeQueryBuilder([{ data: null, error: null }])
    const clientSearchBuilder = makeQueryBuilder([{ data: { id: 'existing-client' }, error: null }])
    const orderInsertBuilder = makeQueryBuilder([{ data: { id: 'order-3', number: 8 }, error: null }])
    const logBuilder = { insert: vi.fn().mockResolvedValue({ error: null }) }
    const historyBuilder = { insert: vi.fn().mockResolvedValue({ error: null }) }

    mockSupabase.from
      .mockReturnValueOnce(typeBuilder)
      .mockReturnValueOnce(clientSearchBuilder)
      .mockReturnValueOnce(orderInsertBuilder)
      .mockReturnValueOnce(logBuilder)
      .mockReturnValueOnce(historyBuilder)

    const req = buildReq({ body: { ...VALID_BODY, order_type: 'magnets_xxl' } })
    const res = buildRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(orderInsertBuilder.insert.mock.calls[0][0].order_type).toBeNull()
    expect(mockSupabase.from).toHaveBeenNthCalledWith(4, 'k24_integration_log')
    const logRow = logBuilder.insert.mock.calls[0][0]
    expect(logRow).toMatchObject({ direction: 'incoming', status: 'warning', order_id: 'order-3' })
    expect(logRow.payload.order_type).toBe('magnets_xxl')
  })

  it('R25.7A: ошибка поиска типа не ломает создание — тип пишется как пришёл', async () => {
    const typeBuilder = makeQueryBuilder([{ data: null, error: { code: '42P01', message: 'relation does not exist' } }])
    const clientSearchBuilder = makeQueryBuilder([{ data: { id: 'existing-client' }, error: null }])
    const orderInsertBuilder = makeQueryBuilder([{ data: { id: 'order-4', number: 9 }, error: null }])
    const historyBuilder = { insert: vi.fn().mockResolvedValue({ error: null }) }

    mockSupabase.from
      .mockReturnValueOnce(typeBuilder)
      .mockReturnValueOnce(clientSearchBuilder)
      .mockReturnValueOnce(orderInsertBuilder)
      .mockReturnValueOnce(historyBuilder)

    const req = buildReq({ body: VALID_BODY })
    const res = buildRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(orderInsertBuilder.insert.mock.calls[0][0].order_type).toBe('sticker_cut')
    expect(mockSupabase.from).toHaveBeenCalledTimes(4)
  })
})
