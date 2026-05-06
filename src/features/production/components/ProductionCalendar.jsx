import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/shared/lib/supabase'
import { addDays, format, startOfDay, isSameDay } from 'date-fns'
import { ru } from 'date-fns/locale'
import { captureError } from '@/shared/lib/sentry'
import Spinner from '@/shared/components/Spinner'

export function ProductionCalendar() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    async function fetch() {
      try {
        const today = startOfDay(new Date())
        const endDate = addDays(today, 14)

        const { data, error: err } = await supabase
          .from('k24_orders')
          .select('id, number, order_type, deadline, status, qty, width_mm, height_mm, assigned_to, assignee:k24_profiles!assigned_to(display_name)')
          .not('status', 'in', '("done","cancelled")')
          .not('deadline', 'is', null)
          .lte('deadline', endDate.toISOString().split('T')[0])
          .order('deadline')
        if (err) throw err

        setOrders(data || [])
      } catch (err) {
        captureError(err, { tags: { source: 'ProductionCalendar.fetchOrders' } })
        setLoadError(err)
        setOrders([])
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [])

  const days = useMemo(() => {
    const today = startOfDay(new Date())
    return Array.from({ length: 14 }, (_, i) => {
      const date = addDays(today, i)
      const dayOrders = orders.filter((o) => o.deadline && isSameDay(new Date(o.deadline), date))
      const totalQty = dayOrders.reduce((s, o) => s + (o.qty || 0), 0)

      // Load level: 0-2 orders = light, 3-5 = medium, 6+ = heavy
      const load = dayOrders.length === 0 ? 'empty' : dayOrders.length <= 2 ? 'light' : dayOrders.length <= 5 ? 'medium' : 'heavy'

      return { date, orders: dayOrders, totalQty, load }
    })
  }, [orders])

  // Also show overdue orders (deadline before today)
  const overdue = useMemo(() => {
    const today = startOfDay(new Date())
    return orders.filter((o) => o.deadline && new Date(o.deadline) < today)
  }, [orders])

  if (loading) {
    return <div className="flex justify-center py-8"><Spinner /></div>
  }

  const loadColors = {
    empty: 'bg-surface',
    light: 'bg-green-500/10 border-green-500/20',
    medium: 'bg-yellow-500/10 border-yellow-500/20',
    heavy: 'bg-red-500/10 border-red-500/20',
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <div role="alert" className="bg-danger/10 border border-danger/30 text-danger rounded-lg px-4 py-2 text-sm">
          Не удалось загрузить дедлайны. Обновите страницу.
        </div>
      )}
      {/* Overdue */}
      {overdue.length > 0 && (
        <div className="bg-danger/10 border border-danger/20 rounded-xl p-4">
          <h3 className="font-semibold text-danger text-sm mb-2">Просрочено ({overdue.length})</h3>
          <div className="flex flex-wrap gap-2">
            {overdue.map((o) => (
              <Link key={o.id} to={`/orders/${o.id}`} className="text-xs bg-danger/15 text-danger px-2 py-1 rounded-lg hover:bg-danger/25">
                #{o.number} — {format(new Date(o.deadline), 'd MMM', { locale: ru })}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-2">
        {/* Day headers */}
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
          <div key={d} className="text-center text-xs text-text-muted font-medium py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {days.map(({ date, orders: dayOrders, totalQty, load }) => (
          <div
            key={date.toISOString()}
            className={`rounded-xl border p-3 min-h-[100px] ${loadColors[load]} ${isSameDay(date, new Date()) ? 'ring-2 ring-accent/30' : 'border-border'}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm font-medium ${isSameDay(date, new Date()) ? 'text-accent' : ''}`}>
                {format(date, 'd MMM', { locale: ru })}
              </span>
              <span className="text-xs text-text-muted">
                {format(date, 'EEEEEE', { locale: ru })}
              </span>
            </div>

            {dayOrders.length === 0 ? (
              <p className="text-xs text-text-muted">—</p>
            ) : (
              <div className="space-y-1">
                <p className="text-xs font-medium">{dayOrders.length} заказов · {totalQty} шт</p>
                {dayOrders.slice(0, 3).map((o) => (
                  <Link key={o.id} to={`/orders/${o.id}`} className="block text-xs text-accent hover:underline truncate">
                    #{o.number} ({o.qty} шт)
                  </Link>
                ))}
                {dayOrders.length > 3 && (
                  <p className="text-xs text-text-muted">+{dayOrders.length - 3} ещё</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-text-muted">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500/20" /> 1-2 заказа</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-500/20" /> 3-5 заказов</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500/20" /> 6+ заказов</span>
      </div>
    </div>
  )
}
