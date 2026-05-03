import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

/**
 * Render component wrapped in MemoryRouter and any providers needed.
 */
export function renderWithRouter(ui, { route = '/' } = {}) {
  return render(ui, {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    ),
  })
}

/**
 * Factory for a mock order object.
 */
export function createMockOrder(overrides = {}) {
  return {
    id: 'order-uuid-1',
    number: 1,
    order_type: 'sticker_cut',
    status: 'new',
    width_mm: 50,
    height_mm: 50,
    qty: 100,
    design_variants: 1,
    need_lam: false,
    client_id: 'client-uuid-1',
    assigned_to: null,
    deadline: new Date(Date.now() + 86400000 * 3).toISOString(),
    notes: '',
    priority: 'normal',
    price_final: 5000,
    cost_total: 1500,
    checklist: null,
    dry_until: null,
    created_at: new Date().toISOString(),
    status_changed_at: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Factory for a mock profile object.
 */
export function createMockProfile(overrides = {}) {
  return {
    id: 'profile-uuid-1',
    user_id: 'user-uuid-1',
    display_name: 'Test User',
    role: 'admin',
    email: 'test@test.com',
    ...overrides,
  }
}

/**
 * Create a mock Supabase client for testing hooks/components.
 */
export function createMockSupabase() {
  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
    unsubscribe: vi.fn(),
  }

  const mockQuery = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: vi.fn(),
  }

  return {
    from: vi.fn(() => mockQuery),
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    storage: {
      from: vi.fn(() => ({
        getPublicUrl: vi.fn((path) => ({ data: { publicUrl: `https://storage.test/${path}` } })),
        upload: vi.fn().mockResolvedValue({ data: { path: 'test.png' }, error: null }),
      })),
    },
    _mockQuery: mockQuery,
    _mockChannel: mockChannel,
  }
}
