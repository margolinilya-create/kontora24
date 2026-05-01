import { create } from 'zustand'
import { supabase } from '@/shared/lib/supabase'

export const useSidebarStore = create((set) => ({
  collapsed: localStorage.getItem('sidebar-collapsed') === 'true',
  counts: {},
  lowStockCount: 0,

  toggleCollapsed: () => set((s) => {
    const next = !s.collapsed
    localStorage.setItem('sidebar-collapsed', next)
    return { collapsed: next }
  }),

  fetchCounts: async () => {
    const [ordersRes, materialsRes] = await Promise.all([
      supabase
        .from('k24_orders')
        .select('status')
        .in('status', ['new', 'design', 'print', 'post_processing', 'resin_pouring', 'assembly', 'packaging']),
      supabase
        .from('k24_materials')
        .select('stock_qty, min_qty'),
    ])

    const counts = {}
    if (ordersRes.data) {
      ordersRes.data.forEach((o) => { counts[o.status] = (counts[o.status] || 0) + 1 })
    }

    const lowStockCount = (materialsRes.data || []).filter(
      (m) => m.min_qty > 0 && Number(m.stock_qty) <= Number(m.min_qty)
    ).length

    set({ counts, lowStockCount })
  },
}))
