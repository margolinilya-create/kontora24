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
      // Ревью R25: UPDATE статуса идёт с .eq('status', from).select('id') —
      // по умолчанию «обновлена одна строка».
      update: vi.fn().mockImplementation(function (...args) {
        this._calls.update.push(args)
        this._resolveValue = this._updateResult ?? { data: [{ id: 'order-1' }], error: null }
        return this
      }),
      is: vi.fn().mockImplementation(function () { return this }),
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
import { updateOrderStatus, addProductionLogAndCheckAdvance, stageRequiresCompletion, buildStatusHistoryRows } from './useOrders'

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
    // Ревью R25: заказ читается всегда (гейт допечаток / оплата), но force
    // пропускает проверку маршрута. notifyBitrix — ещё один .single().
    singleQueue.push({ data: SAMPLE_REGULAR_ORDER, error: null })
    singleQueue.push({ data: { number: 42, bitrix_deal_id: null, price_final: null, cost_total: null }, error: null })

    await expect(
      updateOrderStatus('order-1', 'print', 'pouring', { force: true })
    ).resolves.toEqual({ status: 'pouring' })

    // Security phase 3: под admin (canSeeFinance) notifyBitrix читает финансы
    // через маскирующее view k24_orders_full, а UPDATE статуса идёт по базовой
    // k24_orders. Подтверждаем, что оба обращения произошли.
    const orderUpdateCalls = mockSupabase.from.mock.calls.filter(([t]) => t === 'k24_orders')
    expect(orderUpdateCalls.length).toBeGreaterThanOrEqual(1) // status update
    const notifyQuery = mockSupabase._recentQueriesByTable['k24_orders_full']
    expect(notifyQuery).toBeDefined() // notifyBitrix finance select via view
    expect(notifyQuery.select).toHaveBeenCalled()
    // history insert was called on the right table
    expect(mockSupabase._recentQueriesByTable['k24_order_status_history']).toBeDefined()
  })

  it('with { isRollback: true } skips route + STAGES_REQUIRING_COMPLETION RPC (cutting → print)', async () => {
    singleQueue.push({ data: SAMPLE_REGULAR_ORDER, error: null }) // route
    // notifyBitrix → 1 select.single() call
    singleQueue.push({ data: { number: 42, bitrix_deal_id: null }, error: null })

    await expect(
      updateOrderStatus('order-1', 'cutting', 'print', { isRollback: true })
    ).resolves.toEqual({ status: 'print' })

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

  // ─── QA 04.07: регрессия бага №4 — bopp_bag в select маршрута ──────────
  it('cutting → packaging проходит для не-3D заказа с БОПП (баг №4)', async () => {
    singleQueue.push({ data: SAMPLE_REGULAR_ORDER, error: null }) // route (bopp_bag=true)
    singleQueue.push({ data: ACTOR_ADMIN, error: null }) // actor
    singleQueue.push({ data: { number: 42, bitrix_deal_id: null }, error: null }) // notifyBitrix

    await expect(
      updateOrderStatus('order-1', 'cutting', 'packaging')
    ).resolves.toEqual({ status: 'packaging' })
  })

  it('route-check запрашивает bopp_bag у k24_orders (баг №4: без него «Упаковка» терялась)', async () => {
    const selects = []
    mockSupabase.from.mockImplementation((table) => {
      const q = mockSupabase._defaultFromImpl(table)
      const orig = q.select
      q.select = vi.fn().mockImplementation(function (...args) {
        selects.push({ table, fields: args[0] })
        return orig.apply(this, args)
      })
      return q
    })
    singleQueue.push({ data: SAMPLE_REGULAR_ORDER, error: null })
    singleQueue.push({ data: ACTOR_ADMIN, error: null })
    singleQueue.push({ data: { number: 42, bitrix_deal_id: null }, error: null })

    await updateOrderStatus('order-1', 'cutting', 'packaging')

    const routeSelect = selects.find((s) => s.table === 'k24_orders')
    expect(routeSelect.fields).toContain('bopp_bag')
  })
})

// ─── R25.1 (ТЗ 17.11 Фаза 1): маршрут v2 ─────────────────────────────────
describe('updateOrderStatus — маршрут v2', () => {
  const V2_ORDER = {
    order_type: 'sticker_cut', design_status: 'needs_development', need_lam: true,
    number: 7, bopp_bag: false, route_version: 2, delivery_type: 'pickup',
    needs_montage_film: false, payment_status: 'not_paid',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    resetSingleQueue()
    mockSupabase._resetState()
    rpcResultRef.value = { data: { is_complete: true }, error: null }
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    mockSupabase.from.mockImplementation(mockSupabase._defaultFromImpl)
    mockSupabase.rpc.mockImplementation(() => Promise.resolve(rpcResultRef.value))
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete globalThis.fetch
  })

  it('оплата отмечена при приёме → «Ждёт оплаты» проходится автоматически, две записи истории', async () => {
    singleQueue.push({ data: { ...V2_ORDER, payment_status: 'cash' }, error: null }) // route
    singleQueue.push({ data: ACTOR_ADMIN, error: null }) // actor
    singleQueue.push({ data: { number: 7, bitrix_deal_id: null }, error: null }) // notify

    await expect(updateOrderStatus('order-1', 'new', 'awaiting_payment')).resolves.toEqual({ status: 'design' })

    const update = mockSupabase._recentQueriesByTable['k24_orders'].update.mock.calls[0][0]
    expect(update.status).toBe('design')
    const hist = mockSupabase._allInsertCalls.filter((c) => c.table === 'k24_order_status_history')
    expect(hist).toHaveLength(1)
    const rows = hist[0].payload
    expect(rows).toHaveLength(2)
    // Ревью R25 (12c): первая запись сохраняет пометку вызывающего (здесь —
    // никакой), paid_at_intake — только у автопрохода.
    expect(rows[0]).toMatchObject({ from_status: 'new', to_status: 'awaiting_payment' })
    expect(rows[0].kind).toBeUndefined()
    expect(rows[1]).toMatchObject({ from_status: 'awaiting_payment', to_status: 'design', kind: 'paid_at_intake', note: 'Оплата отмечена при приёме: Нал' })
    expect(rows[0].created_at).toBe(rows[1].created_at)
  })

  it('без оплаты выход из «Ждёт оплаты» требует подтверждения', async () => {
    singleQueue.push({ data: V2_ORDER, error: null })
    singleQueue.push({ data: ACTOR_ADMIN, error: null })

    await expect(updateOrderStatus('order-1', 'awaiting_payment', 'design'))
      .rejects.toMatchObject({ code: 'PAYMENT_CONFIRM_REQUIRED' })
  })

  it('подтверждённый запуск без оплаты пишет «Запущен без оплаты»', async () => {
    singleQueue.push({ data: V2_ORDER, error: null })
    singleQueue.push({ data: ACTOR_ADMIN, error: null })
    singleQueue.push({ data: { number: 7, bitrix_deal_id: null }, error: null })

    await expect(updateOrderStatus('order-1', 'awaiting_payment', 'design', { confirmNoPayment: true }))
      .resolves.toEqual({ status: 'design' })
    const hist = mockSupabase._allInsertCalls.filter((c) => c.table === 'k24_order_status_history')
    expect(hist[0].payload).toMatchObject({ from_status: 'awaiting_payment', to_status: 'design', kind: 'no_payment', note: 'Запущен без оплаты' })
  })

  it('обычный переход v1 пишет историю без kind/note (как до R25.1)', async () => {
    singleQueue.push({ data: { ...V2_ORDER, route_version: 1, bopp_bag: true }, error: null })
    singleQueue.push({ data: ACTOR_ADMIN, error: null })
    singleQueue.push({ data: { number: 7, bitrix_deal_id: null }, error: null })

    await updateOrderStatus('order-1', 'design', 'sample_layout')
    const hist = mockSupabase._allInsertCalls.filter((c) => c.table === 'k24_order_status_history')
    expect(hist[0].payload).toEqual({ order_id: 'order-1', from_status: 'design', to_status: 'sample_layout', changed_by: 'user-1' })
  })

  it('выход с ТК блокируется незавершённой допечаткой (v2)', async () => {
    singleQueue.push({ data: V2_ORDER, error: null })
    singleQueue.push({ data: ACTOR_ADMIN, error: null })
    mockSupabase.from.mockImplementation((table) => {
      const q = mockSupabase._defaultFromImpl(table)
      if (table === 'k24_order_subtasks') {
        q.neq = vi.fn().mockReturnThis()
        q.limit = vi.fn().mockResolvedValue({ data: [{ id: 'sub-1' }], error: null })
      }
      return q
    })

    await expect(updateOrderStatus('order-1', 'otk', 'awaiting_pickup'))
      .rejects.toThrow(/Нельзя выпустить заказ с ТК/)
  })
})

// ─── Ревью R25: optimistic-lock, гейт допечаток, оплата при force ─────────
describe('updateOrderStatus — ревью R25', () => {
  const V2_ORDER = {
    order_type: 'sticker_cut', design_status: 'needs_development', need_lam: true,
    number: 7, bopp_bag: false, route_version: 2, delivery_type: 'pickup',
    needs_montage_film: false, payment_status: 'not_paid',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    resetSingleQueue()
    mockSupabase._resetState()
    rpcResultRef.value = { data: { is_complete: true }, error: null }
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    mockSupabase.from.mockImplementation(mockSupabase._defaultFromImpl)
    mockSupabase.rpc.mockImplementation(() => Promise.resolve(rpcResultRef.value))
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete globalThis.fetch
  })

  it('UPDATE фильтруется по исходному статусу; 0 строк → ошибка без записи истории', async () => {
    singleQueue.push({ data: SAMPLE_REGULAR_ORDER, error: null })
    singleQueue.push({ data: ACTOR_ADMIN, error: null })
    mockSupabase.from.mockImplementation((table) => {
      const q = mockSupabase._defaultFromImpl(table)
      if (table === 'k24_orders') q._updateResult = { data: [], error: null }
      return q
    })

    await expect(updateOrderStatus('order-1', 'design', 'prepress'))
      .rejects.toThrow('Статус заказа изменился, обновите страницу')
    const q = mockSupabase._recentQueriesByTable['k24_orders']
    expect(q._calls.eq).toContainEqual(['status', 'design'])
    expect(mockSupabase._allInsertCalls.filter((c) => c.table === 'k24_order_status_history')).toHaveLength(0)
  })

  it('ошибка чтения заказа не глотается', async () => {
    singleQueue.push({ data: null, error: { message: 'read failed' } })
    await expect(updateOrderStatus('order-1', 'design', 'prepress', { force: true }))
      .rejects.toMatchObject({ message: 'read failed' })
  })

  it('прыжок с force мимо ТК (v2) блокируется незавершённой допечаткой', async () => {
    singleQueue.push({ data: V2_ORDER, error: null })
    mockSupabase.from.mockImplementation((table) => {
      const q = mockSupabase._defaultFromImpl(table)
      if (table === 'k24_order_subtasks') {
        q.neq = vi.fn().mockReturnThis()
        q.limit = vi.fn().mockResolvedValue({ data: [{ id: 'sub-1' }], error: null })
      }
      return q
    })
    await expect(updateOrderStatus('order-1', 'packaging', 'awaiting_pickup', { force: true, kind: 'manual_skip' }))
      .rejects.toThrow(/Нельзя выпустить заказ с ТК/)
  })

  it('прыжок с force мимо «Ждёт оплаты» без оплаты требует подтверждения и пишет no_payment', async () => {
    singleQueue.push({ data: V2_ORDER, error: null })
    await expect(updateOrderStatus('order-1', 'new', 'design', { force: true, kind: 'manual_skip', note: 'Пропущен вручную: Ждёт оплаты' }))
      .rejects.toMatchObject({ code: 'PAYMENT_CONFIRM_REQUIRED' })

    singleQueue.push({ data: V2_ORDER, error: null })
    singleQueue.push({ data: { number: 7, bitrix_deal_id: null }, error: null })
    await updateOrderStatus('order-1', 'new', 'design', { force: true, kind: 'manual_skip', note: 'Пропущен вручную: Ждёт оплаты', confirmNoPayment: true })
    const hist = mockSupabase._allInsertCalls.filter((c) => c.table === 'k24_order_status_history')
    expect(hist[0].payload).toMatchObject({ kind: 'no_payment' })
    expect(hist[0].payload.note).toMatch(/Запущен без оплаты/)
  })

  it('перенос назад без пометки пишется как откат', async () => {
    singleQueue.push({ data: SAMPLE_REGULAR_ORDER, error: null })
    singleQueue.push({ data: ACTOR_ADMIN, error: null })
    singleQueue.push({ data: { number: 42, bitrix_deal_id: null }, error: null })
    await updateOrderStatus('order-1', 'cutting', 'print')
    const hist = mockSupabase._allInsertCalls.filter((c) => c.table === 'k24_order_status_history')
    expect(hist[0].payload).toMatchObject({ from_status: 'cutting', to_status: 'print', kind: 'rollback' })
  })
})

describe('stageRequiresCompletion / buildStatusHistoryRows', () => {
  it('свои этапы custom_N требуют проверки завершения', () => {
    expect(stageRequiresCompletion('custom_3')).toBe(true)
    expect(stageRequiresCompletion('print')).toBe(true)
    expect(stageRequiresCompletion('otk')).toBe(false)
    expect(stageRequiresCompletion('customer')).toBe(false)
  })

  it('автопроход: первая запись с пометкой вызывающего, вторая — paid_at_intake', () => {
    const rows = buildStatusHistoryRows({
      orderId: 'o', userId: 'u', fromStatus: 'new', toStatus: 'awaiting_payment', finalStatus: 'design',
      kind: 'manual_skip', note: 'x', autoPass: 'design', paidNote: 'Оплата отмечена при приёме: Нал', nowIso: 't',
    })
    expect(rows[0]).toMatchObject({ to_status: 'awaiting_payment', kind: 'manual_skip', note: 'x', created_at: 't' })
    expect(rows[1]).toMatchObject({ from_status: 'awaiting_payment', to_status: 'design', kind: 'paid_at_intake', note: 'Оплата отмечена при приёме: Нал' })
  })
})

// ─── QA 04.07: регрессия бага №5 — p_track обязан присутствовать в RPC ────
describe('addProductionLogAndCheckAdvance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetSingleQueue()
    mockSupabase._resetState()
    rpcResultRef.value = { data: { is_complete: true }, error: null }
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } }, error: null,
    })
    mockSupabase.from.mockImplementation(mockSupabase._defaultFromImpl)
    mockSupabase.rpc.mockImplementation(() => Promise.resolve(rpcResultRef.value))
  })

  it('одиночный трек вызывает check_stage_completion с явным p_track (null)', async () => {
    // Пока в БД жили две перегрузки функции, вызов без p_track падал с
    // PGRST203 и completion молча не работал (баг №5).
    singleQueue.push({ data: { role: 'printer' }, error: null }) // workerProfile

    const order = { id: 'order-1', order_type: 'sticker_cut', status: 'print', bopp_bag: true }
    await addProductionLogAndCheckAdvance('order-1', 'print', { stickers_printed: 10 }, order)

    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      'check_stage_completion',
      expect.objectContaining({ p_order_id: 'order-1', p_stage: 'print', p_track: null }),
    )
  })
})
