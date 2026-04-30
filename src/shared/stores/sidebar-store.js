import { create } from 'zustand'
import { supabase } from '@/shared/lib/supabase'

export const useSidebarStore = create((set) => ({
  collapsed: localStorage.getItem('sidebar-collapsed') === 'true',
  counts: {},

  toggleCollapsed: () => set((s) => {
    const next = !s.collapsed
    localStorage.setItem('sidebar-collapsed', next)
    return { collapsed: next }
  }),

  fetchCounts: async () => {
    const { data } = await supabase
      .from('orders')
      .select('status')
      .in('status', ['new', 'design', 'print', 'assembly'])

    if (!data) return

    const counts = {}
    data.forEach((o) => { counts[o.status] = (counts[o.status] || 0) + 1 })
    set({ counts })
  },
}))
