import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useOrders } from '../hooks/useOrders'
import { StatusBadge } from '../components/StatusBadge'
import { ORDER_TYPES } from '@/shared/constants'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { exportCSV } from '@/shared/lib/export'
import { Pagination } from '@/shared/components/Pagination'
import { TableSkeleton } from '@/shared/components/Skeleton'
import { OrdersKanban } from '../components/OrdersKanban'
import { DepartmentFilter } from '../components/DepartmentFilter'
import { DateRangeFilter } from '../components/DateRangeFilter'
import Button from '@/shared/components/Button'
import SearchInput from '@/shared/components/SearchInput'

export default function OrdersPage() {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('deadline')
  const [sortAsc, setSortAsc] = useState(true)
  const [viewMode, setViewMode] = useState(() => window.innerWidth < 640 ? 'kanban' : 'table')
  const [statusFilters, setStatusFilters] = useState([])
  const [deadlineFrom, setDeadlineFrom] = useState(null)
  const [deadlineTo, setDeadlineTo] = useState(null)

  const debouncedSearch = useDebounce(search, 300)
  const [pPage, setPPage] = useState(1)
  const [pPerPage, setPPerPage] = useState(25)

  // Reset to page 1 when filters change
  useEffect(() => { setPPage(1) }, [statusFilters, debouncedSearch, sortBy, sortAsc, deadlineFrom, deadlineTo])

  const from = (pPage - 1) * pPerPage
  const to = pPage * pPerPage - 1

  const { orders, totalCount, loading, error } = useOrders({
    statuses: statusFilters.length > 0 ? statusFilters : undefined,
    search: debouncedSearch,
    sortBy,
    sortAsc,
    from,
    to,
    deadlineFrom,
    deadlineTo,
  })

  const totalPages = Math.max(1, Math.ceil(totalCount / pPerPage))
  const pagination = {
    page: pPage, totalPages, totalCount, perPage: pPerPage,
    hasNext: pPage < totalPages, hasPrev: pPage > 1,
    nextPage: () => setPPage((p) => Math.min(p + 1, totalPages)),
    prevPage: () => setPPage((p) => Math.max(p - 1, 1)),
    changePerPage: (n) => { setPPerPage(n); setPPage(1) },
  }

  function handleSortChange(value) {
    if (value === 'deadline') {
      setSortBy('deadline')
      setSortAsc(true)
    } else {
      setSortBy('number')
      setSortAsc(false)
    }
  }

  function isDeadlinePast(order) {
    if (!order.deadline) return false
    if (['done', 'cancelled'].includes(order.status)) return false
    return new Date(order.deadline) < new Date()
  }

  function formatDeadline(deadline) {
    if (!deadline) return '—'
    return new Date(deadline).toLocaleDateString('ru-RU')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Заказы</h1>
          <p className="text-text-muted">
            {totalCount > 0 ? `${totalCount} заказов` : 'Управление заказами'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setViewMode('table')}
              className={`px-2.5 py-2 text-sm ${viewMode === 'table' ? 'bg-primary text-white' : 'text-text-muted hover:bg-surface-dim'}`}
              aria-label="Таблица"
              aria-pressed={viewMode === 'table'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M12 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M21.375 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M12 17.25v-5.25" /></svg>
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-2.5 py-2 text-sm ${viewMode === 'kanban' ? 'bg-primary text-white' : 'text-text-muted hover:bg-surface-dim'}`}
              aria-label="Канбан"
              aria-pressed={viewMode === 'kanban'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" /></svg>
            </button>
          </div>
          {orders.length > 0 && (
            <Button
              variant="secondary"
              onClick={() => exportCSV(orders, [
                { key: 'number', label: '№' },
                { key: 'order_type', label: 'Тип', format: (v) => ORDER_TYPES[v]?.label || v },
                { key: 'client', label: 'Заказчик', format: (_, o) => o.client?.name || '' },
                { key: 'status', label: 'Статус' },
                { key: 'deadline', label: 'Дедлайн', format: (v) => v ? new Date(v).toLocaleDateString('ru-RU') : '' },
                { key: 'width_mm', label: 'Ширина' },
                { key: 'height_mm', label: 'Высота' },
                { key: 'qty', label: 'Тираж' },
                { key: 'price_final', label: 'Цена' },
                { key: 'cost_total', label: 'Себестоимость' },
                { key: 'created_at', label: 'Создан' },
              ], 'orders.csv')}
            >
              Выгрузить
            </Button>
          )}
          <Link
            to="/orders/create"
            className="bg-accent hover:bg-accent-hover text-on-accent font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors shadow-card"
          >
            + Новый заказ
          </Link>
        </div>
      </div>

      {/* Search + Sort + Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по номеру или заметкам..."
          ariaLabel="Поиск заказов"
          className="flex-1 max-w-md"
        />
        <div className="flex items-center gap-2">
          <select
            value={sortBy === 'deadline' ? 'deadline' : 'number'}
            onChange={(e) => handleSortChange(e.target.value)}
            className="rounded-lg border border-border px-3 py-2.5 text-sm bg-surface min-h-[44px]"
            aria-label="Сортировка"
          >
            <option value="deadline">По сроку сдачи</option>
            <option value="number">По номеру заказа</option>
          </select>
          <DepartmentFilter
            selectedStatuses={statusFilters}
            onChange={setStatusFilters}
          />
        </div>
      </div>

      {/* Date range filter */}
      <DateRangeFilter
        from={deadlineFrom}
        to={deadlineTo}
        onChange={({ from: f, to: t }) => { setDeadlineFrom(f); setDeadlineTo(t) }}
      />

      {/* Table / Kanban / Mobile Cards */}
      {loading ? (
        <TableSkeleton rows={6} cols={5} />
      ) : error ? (
        <div className="bg-danger/10 text-danger rounded-xl p-4 text-sm" role="alert">{error}</div>
      ) : orders.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-12 text-center">
          <h3 className="text-lg font-semibold mb-1">{search ? 'Ничего не найдено' : 'Нет заказов'}</h3>
          <p className="text-text-muted text-sm mb-4">{search ? 'Попробуйте другой запрос' : 'Создайте первый заказ'}</p>
          {!search && (
            <Link to="/orders/create" className="inline-flex bg-accent hover:bg-accent-hover text-on-accent font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors shadow-card">
              Создать заказ
            </Link>
          )}
        </div>
      ) : viewMode === 'kanban' ? (
        <OrdersKanban orders={orders} onUpdated={() => {}} />
      ) : (
        <>
          {/* Mobile card view */}
          <div className="sm:hidden space-y-3">
            {orders.map((order) => (
              <Link
                key={order.id}
                to={`/orders/${order.id}`}
                className="block bg-surface rounded-2xl border border-border shadow-card p-4 hover:border-accent/40 transition-colors active:bg-surface-dim"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-text">#{order.number}</span>
                  <StatusBadge status={order.status} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text truncate mr-2">{order.client?.name || '—'}</span>
                  <span className="text-text-muted shrink-0">{ORDER_TYPES[order.order_type]?.label || order.order_type}</span>
                </div>
                {order.deadline && (
                  <div className={`text-xs mt-2 ${isDeadlinePast(order) ? 'text-danger font-medium' : 'text-text-muted'}`}>
                    Сдача: {formatDeadline(order.deadline)}
                  </div>
                )}
              </Link>
            ))}
          </div>
          {/* Desktop table */}
          <div className="hidden sm:block bg-surface rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Список заказов</caption>
                <thead>
                  <tr className="border-b border-border bg-surface-dim">
                    <th className="text-left px-4 py-3 font-medium text-text-muted">№</th>
                    <th className="text-left px-4 py-3 font-medium text-text-muted">Заказчик</th>
                    <th className="text-left px-4 py-3 font-medium text-text-muted">Тип</th>
                    <th className="text-left px-4 py-3 font-medium text-text-muted">Этап</th>
                    <th className="text-left px-4 py-3 font-medium text-text-muted">Срок сдачи</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-b border-border last:border-0 hover:bg-surface-dim/50 transition-colors cursor-pointer" onClick={() => window.location.href = `/orders/${order.id}`}>
                      <td className="px-4 py-3">
                        <Link to={`/orders/${order.id}`} className="font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
                          {order.number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-text-muted">
                        {order.client?.name || '—'}
                      </td>
                      <td className="px-4 py-3 text-text-muted">
                        {ORDER_TYPES[order.order_type]?.label || order.order_type}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={order.status} />
                      </td>
                      <td className={`px-4 py-3 ${isDeadlinePast(order) ? 'text-danger font-medium' : 'text-text-muted'}`}>
                        {formatDeadline(order.deadline)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination {...pagination} />
        </>
      )}
    </div>
  )
}
