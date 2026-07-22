import { create } from 'zustand'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'

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
    try {
      // R22.4 (ТЗ 20.07 Фаза 4А): + sample_layout/selection/drying; selection_pouring
      // убран (упразднён). Бейдж «Заливка» теперь считает реальный order.status='pouring'
      // (stickerpack3D больше не носит заливку в подзадаче).
      const [ordersRes, materialsRes] = await Promise.all([
        supabase
          .from('k24_orders')
          .select('status')
          .in('status', ['new', 'design', 'sample_layout', 'prepress', 'print', 'lamination', 'cutting', 'selection', 'pouring', 'drying', 'assembly_3d', 'packaging', 'otk']),
        supabase
          .from('k24_materials')
          .select('stock_qty, min_qty'),
      ])

      const counts = {}
      if (ordersRes.data) {
        ordersRes.data.forEach((o) => { counts[o.status] = (counts[o.status] || 0) + 1 })
      }
      // «Вёрстка образца» (sample_layout) показывается в очереди «Препресс»
      // (QueuePage extraStatuses) — счётчик должен это учитывать (ТЗ Фаза 4А).
      counts.prepress = (counts.prepress || 0) + (counts.sample_layout || 0)

      const lowStockCount = (materialsRes.data || []).filter(
        (m) => m.min_qty > 0 && Number(m.stock_qty) <= Number(m.min_qty)
      ).length

      set({ counts, lowStockCount })
    } catch (err) {
      captureError(err, { tags: { source: 'sidebar-store.fetchCounts' } })
    }
  },
}))
