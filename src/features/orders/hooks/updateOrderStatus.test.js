import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Mocks ────────────────────────────────────────────────────────────────
const { mockSupabase, singleQueue, rpcResultRef } = vi.hoisted(() => {
  // FIFO queue of values returned by .single() in order of calls.
  // Tests push expected results before calling updateOrderStatus.
  const singleQueue = []
  // What supabase.rpc('check_stage_completion', ...) resolves to.
  const rpcResultRef = { value: { data: { is_complete: true }, error: null } }

  function makeQuery() {
    const q = {
      _calls: { select: [], eq: [], update: [], insert: [], single: 0 },
      select: vi.fn().mockImplementation(function (...args) { this._calls.select.push(args); return this }),
      eq: vi.fn().mockImplementation(function (...args) { this._calls.eq.push(args); return this }),
      update: vi.fn().mockImplementation(function (...args) { this._calls.update.push(args); return this }),
      insert: vi.fn().mockImplementation(function (...args) { this._calls.insert.push(args); return this }),
      single: vi.fn().mockImplementation(function () {
        this._calls.single += 1
        const next = singleQueue.shift()
        return Promise.resolve(next ?? { data: null, error: null })
      }),
      // For .update().eq() — the chain must be directly awaitable
      // We implement `then` so awaiting the query (after update/insert) resolves
      // with { error: null } unless someone overrides via _resolveValue.
      _resolveValue: { error: null },
      then(resolve, reject) {
        try { return Promise.resolve(this._resolveValue).then(resolve, reject) } catch (e) { return reject(e) }
      },
    }
    return q
  }

  // We expose the most-recent query created via from() for assertions in tests.
  const recentQueriesByTable = {}
  // Track every insert call payload across all tables for easy assertions.
  const allInsertCalls = []

  const defaultFromImpl = (table) => {
    const q = makeQuery()
    // Wrap insert to record across-table
    const origInsert = q.insert
    q.insert = vi.fn().mockImplementation(function (payload) {
      allInsertCalls.push({ table, payload })
      return origInsert.call(this, payload)
    })
    recentQueriesByTable[table] = q
    return q
  }

  const mockSupabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
    from: vi.fn().mockImplementation(defaultFromImpl),
    rpc: vi.fn().mockImplementation(() => Promise.resolve(rpcResultRef.value)),
    _recentQueriesByTable: recentQueriesByTable,
    _allInsertCalls: allInsertCalls,
    _defaultFromImpl: defaultFromImpl,
    _resetState: () => {
      allInsertCalls.length = 0
      for (const k of Object.keys(recentQueriesByTable)) delete recentQueriesByTable[k]
    },
  }

  return { mockSupabase, singleQueue, rpcResultRef }
})

vi.mock('@/shared/lib/supabase', () => ({ supabase: mockSupabase }))

// captureError must be a no-op (avoid Sentry init).
vi.mock('@/shared/lib/sentry', () => ({
  captureError: vi.fn(),
  initSentry: vi.fn(),
  getSentry: vi.fn(),
}))

// Role permissions store: return loaded=false so canAdvanceFrom falls back
// to static ROLE_STAGE_PERMISSIONS (admin/manager → true).
vi.mock('@/features/auth/role-permissions-store', () => ({
  useRolePermissionsStore: {
    getState: () => ({ loaded: false, permissions: {} }),
  },
  canRoleDo: () => true,
}))

// Auth store: profile is admin so notifyBitrix select includes finance fields.
vi.mock('@/features/auth/store', () => ({
  useAuthStore: {
    getState: () => ({ profile: { role: 'admin' } }),
  },
}))

vi.mock('@/shared/stores/role-switcher-store', () => ({
  useRoleSwitcherStore: {
    getState: () => ({ impersonatedProfile: null }),
  },
}))

// Now import the function under test.
import { updateOrderStatus } from './useOrders'

// ─── Helpers ──────────────────────────────────────────────────────────────
function resetSingleQueue() {
  singleQueue.length = 0
}

// Default routeOrder loaded by the route-check: sticker_cut, need_lam=true.
// For sticker_cut, route is: new → design → prepress → print → lamination
// → cutting → packaging (skipped unless bopp_bag) → otk → done.
// `bopp_bag=true` so packaging stays in route; `pouring` is NEVER allowed.
const SAMPLE_REGULAR_ORDER = {
  order_type: 'sticker_cut',
  design_status: 'needs_development',
  need_lam: true,
  number: 42,
  bopp_bag: true,
}

const ACTOR_ADMIN = { role: 'admin' }

describe('updateOrderStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetSingleQueue()
    mockSupabase._resetState()
    rpcResultRef.value = { data: { is_complete: true }, error: null }

    // Restore the auth.getUser default (cleared by clearAllMocks).
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } }, error: null,
    })
    mockSupabase.from.mockImplementation(mockSupabase._defaultFromImpl)
    mockSupabase.rpc.mockImplementation(() => Promise.resolve(rpcResultRef.value))

    // Global fetch mock for notifyBitrix.
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete globalThis.fetch
  })

  it('throws on illegal route transition (sticker_cut: print → pouring)', async () => {
    // 1st single() call: route check against k24_orders.
    singleQueue.push({ data: SAMPLE_REGULAR_ORDER, error: null })

    await expect(
      updateOrderStatus('order-1', 'print', 'pouring')
    ).rejects.toThrow(/Этап «Заливка» не входит в маршрут заказа/)
  })

  it('with { force: true } skips the route check and updates the order', async () => {
    // No order pre-fetch (force skips it). notifyBitrix will trigger one
    // .select().eq().single() — return order with no bitrix_deal_id.
    singleQueue.push({ data: { number: 42, bitrix_deal_id: null, price_final: null, cost_total: null }, error: null })

    await expect(
      updateOrderStatus('order-1', 'print', 'pouring', { force: true })
    ).resolves.toBeUndefined()

    const ordersQuery = mockSupabase._recentQueriesByTable['k24_orders']
    // Last call to `from('k24_orders')` is for notifyBitrix select, but
    // the update was performed on an earlier k24_orders query. Check the
    // overall from() history to confirm an update happened.
    const updatedCalls = mockSupabase.from.mock.calls.filter(([t]) => t === 'k24_orders')
    expect(updatedCalls.length).toBeGreaterThanOrEqual(2) // at least update + notifyBitrix select
    // history insert was called on the right table
    expect(mockSupabase._recentQueriesByTable['k24_order_status_history']).toBeDefined()
    // sanity: the most-recent k24_orders query did call .select (notifyBitrix)
    expect(ordersQuery.select).toHaveBeenCalled()
  })

  it('with { isRollback: true } skips route + STAGES_REQUIRING_COMPLETION RPC (cutting → print)', async () => {
    // notifyBitrix → 1 select.single() call
    singleQueue.push({ data: { number: 42, bitrix_deal_id: null }, error: null })

    await expect(
      updateOrderStatus('order-1', 'cutting', 'print', { isRollback: true })
    ).resolves.toBeUndefined()

    // The crucial assertion: check_stage_completion was NOT called.
    expect(mockSupabase.rpc).not.toHaveBeenCalled()
  })

  it('inserts a status_history row after successful update', async () => {
    // 1st single() — route check
    singleQueue.push({ data: SAMPLE_REGULAR_ORDER, error: null })
    // 2nd single() — actorProfile (admin → bypass canAdvanceFrom)
    singleQueue.push({ data: ACTOR_ADMIN, error: null })
    // 3rd single() — notifyBitrix
    singleQueue.push({ data: { number: 42, bitrix_deal_id: null }, error: null })

    await updateOrderStatus('order-1', 'design', 'prepress')

    const historyInserts = mockSupabase._allInsertCalls.filter(c => c.table === 'k24_order_status_history')
    expect(historyInserts).toHaveLength(1)
    expect(historyInserts[0].payload).toMatchObject({
      order_id: 'order-1',
      from_status: 'design',
      to_status: 'prepress',
      changed_by: 'user-1',
    })
  })

  it('throws when history insert fails', async () => {
    singleQueue.push({ data: SAMPLE_REGULAR_ORDER, error: null }) // route
    singleQueue.push({ data: ACTOR_ADMIN, error: null }) // actor

    // Override the k24_order_status_history query so its insert resolves with an error.
    mockSupabase.from.mockImplementation((table) => {
      const q = mockSupabase._defaultFromImpl(table)
      if (table === 'k24_order_status_history') {
        q._resolveValue = { error: { message: 'history insert failed' } }
      }
      return q
    })

    await expect(
      updateOrderStatus('order-1', 'design', 'prepress')
    ).rejects.toMatchObject({ message: 'history insert failed' })
  })

  it('throws "Не удалось проверить права..." when actorProfile fetch fails', async () => {
    // 1st single() — route check OK
    singleQueue.push({ data: SAMPLE_REGULAR_ORDER, error: null })
    // 2nd single() — actorProfile fails (H2 fix: must throw, not silent fail)
    singleQueue.push({ data: null, error: { message: 'profile fetch failed' } })

    await expect(
      updateOrderStatus('order-1', 'design', 'prepress')
    ).rejects.toThrow(/Не удалось проверить права\. Обновите страницу/)
  })

  it('does NOT call /api/bitrix/status-update when order has no bitrix_deal_id', async () => {
    singleQueue.push({ data: SAMPLE_REGULAR_ORDER, error: null }) // route
    singleQueue.push({ data: ACTOR_ADMIN, error: null }) // actor
    singleQueue.push({ data: { number: 42, bitrix_deal_id: null }, error: null }) // notifyBitrix

    await updateOrderStatus('order-1', 'design', 'prepress')

    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
