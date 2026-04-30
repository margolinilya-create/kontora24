import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useOrders } from '../hooks/useOrders'
import { StatusBadge } from '../components/StatusBadge'
import { ORDER_STATUSES, ORDER_TYPES } from '@/shared/constants'
import { TableSkeleton } from '@/shared/components/Skeleton'
import { formatPrice, formatDate, formatRelative } from '@/shared/lib/utils'

export default function OrdersPage() {
  const [statusFilter, setStatusFilter] = useState('all')
  const { orders, loading, error } = useOrders({ status: statusFilter })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Заказы</h1>
          <p className="text-text-muted">
            {orders.length > 0 ? `${orders.length} заказов` : 'Управление заказами производства'}
          </p>
        </div>
        <Link
          to="/calculator"
          className="bg-accent hover:bg-accent-hover text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
        >
          + Новый заказ
        </Link>
      </div>

      {/* Status filters */}
      <div className="flex flex-wrap gap-2">
        <FilterButton
          active={statusFilter === 'all'}
          onClick={() => setStatusFilter('all')}
          label="Все"
        />
        {Object.entries(ORDER_STATUSES).map(([key, s]) => (
          <FilterButton
            key={key}
            active={statusFilter === key}
            onClick={() => setStatusFilter(key)}
            label={s.label}
            colorClass={statusFilter === key ? s.color : ''}
          />
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <TableSkeleton rows={6} cols={7} />
      ) : error ? (
        <div className="bg-red-50 text-danger rounded-xl p-4 text-sm">{error}</div>
      ) : orders.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-dim">
                  <th className="text-left px-4 py-3 font-medium text-text-muted">#</th>
                  <th className="text-left px-4 py-3 font-medium text-text-muted">Тип</th>
                  <th className="text-left px-4 py-3 font-medium text-text-muted">Размер</th>
                  <th className="text-left px-4 py-3 font-medium text-text-muted">Тираж</th>
                  <th className="text-left px-4 py-3 font-medium text-text-muted">Статус</th>
                  <th className="text-left px-4 py-3 font-medium text-text-muted">Клиент</th>
                  <th className="text-right px-4 py-3 font-medium text-text-muted">Цена</th>
                  <th className="text-right px-4 py-3 font-medium text-text-muted">Создан</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-border last:border-0 hover:bg-surface-dim/50 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/orders/${order.id}`} className="font-medium text-accent hover:underline">
                        {order.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-text-muted">
                      {ORDER_TYPES[order.order_type]?.label || order.order_type}
                    </td>
                    <td className="px-4 py-3 text-text-muted">
                      {order.width_mm}×{order.height_mm} мм
                    </td>
                    <td className="px-4 py-3">{order.qty} шт</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3 text-text-muted">
                      {order.client?.name || '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatPrice(order.price_final)}
                    </td>
                    <td className="px-4 py-3 text-right text-text-muted">
                      {formatRelative(order.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function FilterButton({ active, onClick, label, colorClass = '' }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
        active
          ? colorClass || 'bg-primary text-white'
          : 'bg-surface border border-border text-text-muted hover:bg-surface-dim'
      } ${active && colorClass ? 'font-medium' : ''}`}
    >
      {label}
    </button>
  )
}

function EmptyState() {
  return (
    <div className="bg-surface rounded-xl border border-border p-12 text-center">
      <div className="w-16 h-16 rounded-full bg-surface-dim flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold mb-1">Нет заказов</h3>
      <p className="text-text-muted text-sm mb-4">Создайте первый заказ через калькулятор</p>
      <Link
        to="/calculator"
        className="inline-flex bg-accent hover:bg-accent-hover text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
      >
        Открыть калькулятор
      </Link>
    </div>
  )
}
