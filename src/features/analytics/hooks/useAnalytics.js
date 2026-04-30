import { useState, useEffect } from 'react'
import { supabase } from '@/shared/lib/supabase'

export function useAnalytics() {
  const [stats, setStats] = useState({
    totalOrders: 0,
    revenue: 0,
    avgCheck: 0,
    byStatus: {},
    byType: {},
    recentOrders: [],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      setLoading(true)

      const { data: orders } = await supabase
        .from('orders')
        .select('id, status, order_type, price_final, cost_total, created_at')
        .order('created_at', { ascending: false })

      if (!orders) {
        setLoading(false)
        return
      }

      const doneOrders = orders.filter((o) => o.status === 'done')
      const revenue = doneOrders.reduce((sum, o) => sum + (Number(o.price_final) || 0), 0)
      const avgCheck = doneOrders.length > 0 ? revenue / doneOrders.length : 0

      // Count by status
      const byStatus = {}
      orders.forEach((o) => {
        byStatus[o.status] = (byStatus[o.status] || 0) + 1
      })

      // Revenue by type
      const byType = {}
      doneOrders.forEach((o) => {
        if (!byType[o.order_type]) byType[o.order_type] = { revenue: 0, count: 0, cost: 0 }
        byType[o.order_type].revenue += Number(o.price_final) || 0
        byType[o.order_type].cost += Number(o.cost_total) || 0
        byType[o.order_type].count += 1
      })

      setStats({
        totalOrders: orders.length,
        revenue,
        avgCheck,
        byStatus,
        byType,
        recentOrders: orders.slice(0, 10),
      })
      setLoading(false)
    }

    fetch()
  }, [])

  return { stats, loading }
}
