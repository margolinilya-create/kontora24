import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/shared/lib/supabase'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths,
  format, isSameDay, isSameMonth, startOfDay,
} from 'date-fns'
import { ru } from 'date-fns/locale'
import { captureError } from '@/shared/lib/sentry'
import Spinner from '@/shared/components/Spinner'
import Sheet from '@/shared/components/Sheet'
import { ORDER_TYPES, PRIORITIES } from '@/shared/constants'
import { stageDotClass } from '@/shared/lib/department-mapping'
import { getDeadlineDotClass } from '@/shared/lib/deadline'

const LOAD_COLORS = {
  empty: 'bg-surface',
  light: 'bg-deadline-ok/10 border-deadline-ok/30',
  medium: 'bg-deadline-warn/10 border-deadline-warn/30',
  heavy: 'bg-deadline-urgent/10 border-deadline-urgent/30',
}

function loadLevel(count) {
  if (count === 0) return 'empty'
  if (count <= 2) return 'light'
  if (count <= 5) return 'medium'
  return 'heavy'
}

/**
 * Календарь дедлайнов на месяц с возможностью переключения месяцев
 * и bottom-sheet'ом на мобильном при тапе по дню.
 */
export function ProductionCalendar() {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [openDay, setOpenDay] = useState(null)

  useEffect(() => {
    async function fetch() {
      setLoading(true)
      try {
        const monthStart = startOfMonth(cursor)
        const monthEnd = endOfMonth(cursor)
        // Захватываем неделю до и неделю после, чтобы календарь полностью заполнился
        const fromDate = startOfWeek(monthStart, { weekStartsOn: 1 })
        const toDate = endOfWeek(monthEnd, { weekStartsOn: 1 })
        const { data, error: err } = await supabase
          .from('k24_orders')
          .select('id, number, order_type, deadline, status, qty, priority, client:k24_clients(name)')
          .not('status', 'in', '("done","cancelled")')
          .not('deadline', 'is', null)
          .gte('deadline', fromDate.toISOString().split('T')[0])
          .lte('deadline', toDate.toISOString().split('T')[0])
          .order('deadline')
        if (err) throw err
        setOrders(data || [])
        setLoadError(null)
      } catch (err) {
        captureError(err, { tags: { source: 'ProductionCalendar.fetchOrders' } })
        setLoadError(err)
        setOrders([])
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [cursor])

  const days = useMemo(() => {
    const monthStart = startOfMonth(cursor)
    const monthEnd = endOfMonth(cursor)
    const fromDate = startOfWeek(monthStart, { weekStartsOn: 1 })
    const toDate = endOfWeek(monthEnd, { weekStartsOn: 1 })
    const totalDays = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24)) + 1
    return Array.from({ length: totalDays }, (_, i) => {
      const date = addDays(fromDate, i)
      const dayOrders = orders.filter((o) => isSameDay(new Date(o.deadline), date))
      const totalQty = dayOrders.reduce((s, o) => s + (o.qty || 0), 0)
      return {
        date,
        orders: dayOrders,
        totalQty,
        load: loadLevel(dayOrders.length),
        inMonth: isSameMonth(date, cursor),
      }
    })
  }, [orders, cursor])

  // Просрочено — слева от календаря
  const overdue = useMemo(() => {
    const today = startOfDay(new Date())
    return orders.filter((o) => new Date(o.deadline) < today)
  }, [orders])

  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>

  return (
    <div className="space-y-4">
      {loadError && (
        <div role="alert" className="bg-danger/10 border border-danger/30 text-danger rounded-lg px-4 py-2 text-sm">
          Не удалось загрузить дедлайны. Обновите страницу.
        </div>
      )}

      {/* Header — month switcher */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCursor((c) => addMonths(c, -1))}
            aria-label="Предыдущий месяц"
            className="w-9 h-9 rounded-lg border border-border text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            ←
          </button>
          <h3 className="font-semibold capitalize text-base sm:text-lg min-w-[140px] text-center">
            {format(cursor, 'LLLL yyyy', { locale: ru })}
          </h3>
          <button
            onClick={() => setCursor((c) => addMonths(c, 1))}
            aria-label="Следующий месяц"
            className="w-9 h-9 rounded-lg border border-border text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            →
          </button>
        </div>
        <button
          onClick={() => setCursor(startOfMonth(new Date()))}
          className="text-xs text-text-muted hover:text-text px-3 py-1.5 rounded-lg border border-border hover:bg-surface-2 transition-colors"
        >
          Сегодня
        </button>
      </div>

      {/* Overdue */}
      {overdue.length > 0 && (
        <div className="bg-danger/10 border border-danger/20 rounded-xl p-3">
          <h4 className="font-semibold text-danger text-sm mb-2">Просрочено ({overdue.length})</h4>
          <div className="flex flex-wrap gap-2">
            {overdue.map((o) => (
              <Link key={o.id} to={`/orders/${o.id}`} className="text-xs bg-danger/15 text-danger px-2 py-1 rounded-lg hover:bg-danger/25">
                #{o.number} — {format(new Date(o.deadline), 'd MMM', { locale: ru })}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1.5 text-center text-xs text-text-muted font-medium">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => <div key={d}>{d}</div>)}
      </div>

      {/* Calendar grid — desktop full cells, mobile compact */}
      <div className="grid grid-cols-7 gap-1.5">
        {days.map(({ date, orders: dayOrders, totalQty, load, inMonth }) => {
          const isToday = isSameDay(date, new Date())
          const isClickable = dayOrders.length > 0
          return (
            <button
              key={date.toISOString()}
              onClick={() => isClickable && setOpenDay({ date, orders: dayOrders })}
              disabled={!isClickable}
              className={`text-left rounded-lg border p-1.5 sm:p-2 min-h-[72px] sm:min-h-[100px] transition-colors
                ${LOAD_COLORS[load]}
                ${isToday ? 'ring-2 ring-accent/40' : 'border-border'}
                ${!inMonth ? 'opacity-40' : ''}
                ${isClickable ? 'hover:border-accent/40 cursor-pointer' : 'cursor-default'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs sm:text-sm font-medium ${isToday ? 'text-accent' : ''}`}>
                  {format(date, 'd', { locale: ru })}
                </span>
                {dayOrders.length > 0 && (
                  <span className="text-[10px] text-text-muted bg-surface-2 px-1.5 py-0.5 rounded">
                    {dayOrders.length}
                  </span>
                )}
              </div>
              {/* Desktop: показать первые 3 заказа inline */}
              <div className="hidden sm:block space-y-0.5">
                {dayOrders.slice(0, 3).map((o) => (
                  <div key={o.id} className="text-[11px] truncate flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${stageDotClass(o.status)}`} aria-hidden="true" />
                    <span className="truncate">#{o.number}</span>
                  </div>
                ))}
                {dayOrders.length > 3 && (
                  <p className="text-[10px] text-text-muted">+{dayOrders.length - 3}</p>
                )}
              </div>
              {/* Mobile: bottom marker */}
              {dayOrders.length > 0 && (
                <div className="sm:hidden mt-1">
                  <span className="text-[10px] font-medium text-text">{totalQty} шт</span>
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Bottom sheet: список заказов на выбранный день */}
      <Sheet
        isOpen={!!openDay}
        onClose={() => setOpenDay(null)}
        title={openDay ? format(openDay.date, 'd MMMM yyyy', { locale: ru }) : ''}
      >
        <div className="space-y-2">
          {openDay?.orders.map((o) => {
            const dotCls = getDeadlineDotClass(o.deadline)
            return (
              <Link
                key={o.id}
                to={`/orders/${o.id}`}
                onClick={() => setOpenDay(null)}
                className="block rounded-xl border border-border p-3 hover:border-accent/40 hover:bg-surface-2 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    {dotCls && <span className={`w-2 h-2 rounded-full ${dotCls}`} aria-hidden="true" />}
                    <span className="font-semibold text-sm">#{o.number}</span>
                    <span className="text-xs text-text-muted truncate">{o.client?.name || ''}</span>
                  </div>
                  {o.priority && o.priority !== 'normal' && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PRIORITIES[o.priority]?.color}`}>
                      {PRIORITIES[o.priority]?.label}
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-muted">
                  {ORDER_TYPES[o.order_type]?.label || o.order_type} · {o.qty} шт
                </p>
              </Link>
            )
          })}
        </div>
      </Sheet>
    </div>
  )
}
