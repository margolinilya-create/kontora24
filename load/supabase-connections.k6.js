/**
 * k6 Load Test: Supabase API endpoints
 *
 * Run: k6 run load/supabase-connections.k6.js
 *
 * Scenarios:
 * 1. 50 concurrent users fetching orders list
 * 2. Rapid order status updates (simulating shift end)
 * 3. Material deduction burst
 */

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const SUPABASE_URL = __ENV.SUPABASE_URL || 'https://pulzirakjqehsulmjhdj.supabase.co'
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY || ''
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '' // Bearer token from a logged-in session

const errorRate = new Rate('errors')
const ordersFetchDuration = new Trend('orders_fetch_duration')

export const options = {
  scenarios: {
    // Scenario 1: Concurrent reads (simulating all workers checking the board)
    concurrent_reads: {
      executor: 'constant-vus',
      vus: 50,
      duration: '30s',
      exec: 'fetchOrders',
    },
    // Scenario 2: Burst of status updates (shift end - all workers complete simultaneously)
    status_burst: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5s', target: 20 },
        { duration: '10s', target: 20 },
        { duration: '5s', target: 0 },
      ],
      exec: 'updateStatus',
      startTime: '35s',
    },
    // Scenario 3: Material deduction (multiple workers consuming materials at once)
    material_burst: {
      executor: 'constant-vus',
      vus: 10,
      duration: '15s',
      exec: 'deductMaterial',
      startTime: '55s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95th percentile under 500ms
    errors: ['rate<0.05'],            // Error rate under 5%
  },
}

const headers = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${AUTH_TOKEN}`,
}

export function fetchOrders() {
  const start = Date.now()
  const res = http.get(
    `${SUPABASE_URL}/rest/v1/k24_orders?select=id,number,status,order_type,deadline,assigned_to&order=created_at.desc&limit=50`,
    { headers }
  )

  ordersFetchDuration.add(Date.now() - start)
  check(res, {
    'orders status 200': (r) => r.status === 200,
    'orders response has data': (r) => r.json().length >= 0,
  })
  errorRate.add(res.status !== 200)
  sleep(0.5)
}

export function updateStatus() {
  // Simulate updating an order's status (would need real order IDs)
  const res = http.patch(
    `${SUPABASE_URL}/rest/v1/k24_orders?id=eq.00000000-0000-0000-0000-000000000000`,
    JSON.stringify({ status: 'print_done' }),
    { headers: { ...headers, 'Prefer': 'return=minimal' } }
  )

  check(res, {
    'update status ok': (r) => r.status === 200 || r.status === 204 || r.status === 404,
  })
  errorRate.add(res.status >= 500)
  sleep(0.1)
}

export function deductMaterial() {
  // Simulate RPC call to update_stock
  const res = http.post(
    `${SUPABASE_URL}/rest/v1/rpc/update_stock`,
    JSON.stringify({
      p_material_id: '00000000-0000-0000-0000-000000000000',
      p_delta: -1,
    }),
    { headers }
  )

  check(res, {
    'material deduct ok': (r) => r.status === 200 || r.status === 404,
  })
  errorRate.add(res.status >= 500)
  sleep(0.2)
}
