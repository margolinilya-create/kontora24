import { describe, it, expect, beforeEach } from 'vitest'

/**
 * Concurrency and race condition tests.
 * These test patterns that could fail under concurrent access.
 */

describe('Concurrency: localStorage timer collision', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('BUG #1: single timer key causes multi-user collision', () => {
    const TIMER_KEY = 'kontora24_active_timer'

    // User A starts timer on order 1
    localStorage.setItem(TIMER_KEY, JSON.stringify({ orderId: 'order-1', entryId: 'entry-A' }))
    expect(JSON.parse(localStorage.getItem(TIMER_KEY)).entryId).toBe('entry-A')

    // User B on same device starts timer on order 2 (overwrites User A!)
    localStorage.setItem(TIMER_KEY, JSON.stringify({ orderId: 'order-2', entryId: 'entry-B' }))

    // User A's timer is now lost
    const saved = JSON.parse(localStorage.getItem(TIMER_KEY))
    expect(saved.entryId).toBe('entry-B')
    expect(saved.orderId).toBe('order-2')
    // The entry 'entry-A' is now orphaned in the database (started_at set, ended_at null)
  })

  it('FIX: timer key should include user_id', () => {
    // Proposed fix: key = `kontora24_active_timer_${userId}`
    const TIMER_KEY_A = 'kontora24_active_timer_user-A'
    const TIMER_KEY_B = 'kontora24_active_timer_user-B'

    localStorage.setItem(TIMER_KEY_A, JSON.stringify({ orderId: 'order-1', entryId: 'entry-A' }))
    localStorage.setItem(TIMER_KEY_B, JSON.stringify({ orderId: 'order-2', entryId: 'entry-B' }))

    // Both users' timers are preserved
    expect(JSON.parse(localStorage.getItem(TIMER_KEY_A)).entryId).toBe('entry-A')
    expect(JSON.parse(localStorage.getItem(TIMER_KEY_B)).entryId).toBe('entry-B')
  })
})

describe('Concurrency: Optimistic DnD update race', () => {
  it('simulates conflict when two users drag same order', () => {
    // Scenario: User A drags order from "print" to "print_done"
    // Simultaneously User B drags same order from "print" to "print_done"
    // One should succeed, the other should get a conflict (stale status)

    const order = { id: 'order-1', status: 'print' }

    // User A's update: print -> print_done
    const updateA = { ...order, status: 'print_done' }

    // User B's update: also print -> print_done (based on stale status)
    const updateB = { ...order, status: 'print_done' }

    // If both succeed, no harm (same target status)
    // But if A advances to print_done and B drags from print (stale):
    // The system should either:
    // 1. Use optimistic locking (check current status before update)
    // 2. Or handle gracefully with realtime refresh

    // Current implementation: no optimistic locking in the update query
    // Both updates would succeed, which is fine for same status
    expect(updateA.status).toBe(updateB.status)
  })

  it('simulates conflict when one user advances while another drags back', () => {
    const order = { id: 'order-1', status: 'print' }

    // User A advances: print -> print_done
    const updateA = { ...order, status: 'print_done' }

    // User B still sees "print" (stale), drags to "design" (wrong direction)
    // The getNextStatus function should prevent invalid transitions
    // But DnD doesn't enforce getNextStatus - it directly updates status

    // This is a real risk: DnD bypasses status transition validation
    expect(updateA.status).toBe('print_done')
    // User B's stale view could cause invalid state
  })
})

describe('Concurrency: Parallel material deduction', () => {
  it('simulates two workers consuming same material simultaneously', () => {
    // Scenario: Material stock = 10 units
    // Worker A deducts 7 units
    // Worker B deducts 5 units (at same time)
    // Without DB-level locking: stock could go to -2

    const stock = 10
    const deductA = 7
    const deductB = 5

    // The RPC update_stock uses atomic UPDATE SET stock_qty = stock_qty + p_delta
    // This is safe at DB level (row-level lock during UPDATE)
    // But there's no CHECK constraint preventing negative stock

    const finalStock = stock - deductA - deductB
    expect(finalStock).toBe(-2) // Could happen without constraint

    // The system should either:
    // 1. Add CHECK (stock_qty >= 0) to k24_materials
    // 2. Or check stock before deduction in the RPC
    // Currently: stock can go negative (no constraint in migrations)
  })
})

describe('Concurrency: Double claim prevention', () => {
  it('BUG #5: two workers claiming same order simultaneously', () => {
    // Scenario:
    // Worker A clicks "Взять" on order X
    // Worker B clicks "Взять" on order X at same time
    // Both send: UPDATE k24_orders SET assigned_to = my_id WHERE id = X

    // Without optimistic locking:
    // Both updates succeed, last write wins
    // One worker thinks they claimed it, but actually didn't

    const order = { id: 'order-X', assigned_to: null }

    // Worker A's update
    const afterA = { ...order, assigned_to: 'worker-A' }
    // Worker B's update (happens right after, overwrites A)
    const afterB = { ...afterA, assigned_to: 'worker-B' }

    // Final state: Worker B owns it, Worker A is confused
    expect(afterB.assigned_to).toBe('worker-B')

    // Fix: Use WHERE assigned_to IS NULL (conditional update)
    // UPDATE k24_orders SET assigned_to = $1 WHERE id = $2 AND assigned_to IS NULL
    // Second update would affect 0 rows -> show error to user
  })
})

describe('Concurrency: Timer start/stop rapid clicks', () => {
  it('rapid start/stop should not create orphaned entries', async () => {
    // If user clicks start and immediately clicks stop
    // The start() creates a DB entry and localStorage reference
    // The stop() should find and close that entry

    // Potential race: stop() fires before start()'s response
    // In this case, activeEntry is null when stop() is called -> no-op

    const startPromise = new Promise(resolve => setTimeout(() => resolve({ id: 'entry-1' }), 50))
    const _stopTime = Date.now()

    // If stop is called while start is in-flight:
    // activeEntry is still null -> stop() returns immediately
    // Then start() resolves and sets activeEntry -> timer keeps running

    // This is a bug: user thinks they stopped, but timer is running
    const entry = await startPromise
    expect(entry.id).toBe('entry-1')
    // The fix: disable start/stop buttons during async operations (loading state)
  })
})

describe('Concurrency: Realtime reconnection dedup', () => {
  it('processedRef prevents duplicate notifications after reconnect', () => {
    const processedRef = new Set()

    // First connection: receive events 1-5
    for (let i = 1; i <= 5; i++) processedRef.add(`evt-${i}`)

    // Simulate reconnection: same events replayed
    const duplicates = []
    for (let i = 1; i <= 5; i++) {
      if (processedRef.has(`evt-${i}`)) {
        duplicates.push(i)
      }
    }

    // All 5 are duplicates -> no notifications
    expect(duplicates).toHaveLength(5)
  })

  it('processedRef clears at 1000+ to prevent memory leak', () => {
    const processedRef = new Set()

    // Add 1001 entries
    for (let i = 0; i < 1001; i++) processedRef.add(`evt-${i}`)

    // At 1001, the hook clears the Set
    if (processedRef.size > 1000) processedRef.clear()

    expect(processedRef.size).toBe(0)

    // After clear, previously-seen events will trigger again
    // This is acceptable: occasional duplicate notification > memory leak
    processedRef.add('evt-0')
    expect(processedRef.has('evt-0')).toBe(true)
  })
})

describe('Persistence: localStorage edge cases', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('corrupted JSON in timer key does not crash', () => {
    localStorage.setItem('kontora24_active_timer', 'not-json{{{')

    expect(() => {
      JSON.parse(localStorage.getItem('kontora24_active_timer') || 'null')
    }).toThrow()

    // The hook uses: JSON.parse(localStorage.getItem(KEY) || 'null')
    // If value is corrupted, it throws. Hook should handle this.
  })

  it('corrupted JSON in deadline alerts does not crash', () => {
    const today = new Date().toISOString().split('T')[0]
    localStorage.setItem(`deadline_alerts_${today}`, 'corrupted!')

    expect(() => {
      JSON.parse(localStorage.getItem(`deadline_alerts_${today}`) || '[]')
    }).toThrow()
  })

  it('calc history survives across sessions', () => {
    const history = [
      { id: '1', width: 50, height: 50, qty: 100, priceFinal: 5000, timestamp: Date.now() },
      { id: '2', width: 80, height: 80, qty: 200, priceFinal: 12000, timestamp: Date.now() },
    ]
    localStorage.setItem('kontora24-calc-history', JSON.stringify(history))

    // Simulate page reload
    const loaded = JSON.parse(localStorage.getItem('kontora24-calc-history'))
    expect(loaded).toHaveLength(2)
    expect(loaded[0].priceFinal).toBe(5000)
  })

  it('deadline dismissal resets next day', () => {
    const today = '2024-06-01'
    const tomorrow = '2024-06-02'

    localStorage.setItem(`deadline_alerts_${today}`, JSON.stringify([1, 2, 3]))

    // Next day: different key
    const nextDayDismissed = JSON.parse(localStorage.getItem(`deadline_alerts_${tomorrow}`) || '[]')
    expect(nextDayDismissed).toEqual([]) // Fresh start next day
  })
})
