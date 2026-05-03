import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useOrders } from '../hooks/useOrders'
import { StatusBadge } from '../components/StatusBadge'
import { ORDER_STATUSES, ORDER_TYPES, PRIORITIES } from '@/shared/constants'
import { formatPrice, formatRelative } from '@/shared/lib/utils'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { updateOrderStatus } from '../hooks/useOrders'
import { exportCSV } from '@/shared/lib/export'
import { toast } from '@/shared/stores/toast-store'
import { Pagination } from '@/shared/components/Pagination'
import { TableSkeleton } from '@/shared/components/Skeleton'
import { OrdersKanban } from '../components/OrdersKanban'
import { SavedFilters } from '../components/SavedFilters'
import Button from '@/shared/components/Button'
import SearchInput from '@/shared/components/SearchInput'

function SortHeader({ col, sortBy, sortAsc, onSort, children }) {
  const isSorted = sortBy === col
  const ariaSort = isSorted ? (sortAsc ? 'ascending' : 'descending') : 'none'

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSort(col)
    }
  }

  return (
    <th
      className="text-left px-4 py-3 font-medium text-text-muted cursor-pointer hover:text-text select-none"
      onClick={() => onSort(col)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-sort={ariaSort}
    >
      {children}
      {isSorted && <span className="ml-1">{sortAsc ? '↑' : '↓'}</span>}
    </th>
  )
}

export default function OrdersPage() {
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('created_at')
  const [sortAsc, setSortAsc] = useState(false)
  const [viewMode, setViewMode] = useState(() => window.innerWidth < 640 ? 'kanban' : 'table') // 'table' | 'kanban'
  const [selected, setSelected] = useState(new Set())
  const [bulkAction, setBulkAction] = useState('')

  const debouncedSearch = useDebounce(search, 300)
  const [pPage, setPPage] = useState(1)
  const [pPerPage, setPPerPage] = useState(25)

  // Reset to page 1 when filters change
  useEffect(() => { setPPage(1) }, [statusFilter, debouncedSearch, sortBy, sortAsc])

  const from = (pPage - 1) * pPerPage
  const to = pPage * pPerPage - 1

  const { orders, totalCount, loading, error } = useOrders({
    status: statusFilter,
    search: debouncedSearch,
    sortBy,
    sortAsc,
    from,
    to,
  })

  const totalPages = Math.max(1, Math.ceil(totalCount / pPerPage))
  const pagination = {
    page: pPage, totalPages, totalCount, perPage: pPerPage,
    hasNext: pPage < totalPages, hasPrev: pPage > 1,
    nextPage: () => setPPage((p) => Math.min(p + 1, totalPages)),
    prevPage: () => setPPage((p) => Math.max(p - 1, 1)),
    changePerPage: (n) => { setPPerPage(n); setPPage(1) },
  }

  function handleSort(col) {
    if (sortBy === col) { setSortAsc(!sortAsc) }
    else { setSortBy(col); setSortAsc(false) }
  }

  function isDeadlinePast(order) {
    if (!order.deadline) return false
    const doneStatuses = ['done', 'cancelled']
    if (doneStatuses.includes(order.status)) return false
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
                { key: 'order_type', label: 'Тип' },
                { key: 'width_mm', label: 'Ширина' },
                { key: 'height_mm', label: 'Высота' },
                { key: 'qty', label: 'Тираж' },
                { key: 'status', label: 'Статус' },
                { key: 'price_final', label: 'Цена' },
                { key: 'cost_total', label: 'Себестоимость' },
                { key: 'created_at', label: 'Создан' },
              ], 'orders.csv')}
            >
              CSV
            </Button>
          )}
          <Link
            to="/calculator"
            className="bg-accent hover:bg-accent-hover text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
          >
            + Новый заказ
          </Link>
        </div>
      </div>

      {/* Search */}
      <SearchInput
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Поиск по номеру или заметкам..."
        ariaLabel="Поиск заказов"
        className="max-w-md"
      />

      {/* Status filters */}
      <div className="flex flex-wrap gap-2">
        <FilterBtn active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} label="Все" />
        {Object.entries(ORDER_STATUSES).map(([key, s]) => (
          <FilterBtn
            key={key}
            active={statusFilter === key}
            onClick={() => setStatusFilter(key)}
            label={s.label}
            colorClass={statusFilter === key ? s.color : ''}
          />
        ))}
      </div>

      {/* Saved filters */}
      <SavedFilters
        currentFilter={statusFilter}
        onApply={(f) => setStatusFilter(f)}
      />

      {/* Table */}
      {loading ? (
        <TableSkeleton rows={6} cols={9} />
      ) : error ? (
        <div className="bg-danger/10 text-danger rounded-xl p-4 text-sm" role="alert">{error}</div>
      ) : orders.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-12 text-center">
          <h3 className="text-lg font-semibold mb-1">{search ? 'Ничего не найдено' : 'Нет заказов'}</h3>
          <p className="text-text-muted text-sm mb-4">{search ? 'Попробуйте другой запрос' : 'Создайте первый заказ через калькулятор'}</p>
          {!search && (
            <Link to="/calculator" className="inline-flex bg-accent hover:bg-accent-hover text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors">
              Калькулятор
            </Link>
          )}
        </div>
      ) : viewMode === 'kanban' ? (
        <OrdersKanban orders={orders} onUpdated={() => { /* refetch handled by realtime */ }} />
      ) : (
        <>
          {/* Bulk actions bar */}
          {selected.size > 0 && (
            <div className="bg-accent/10 border border-accent/20 rounded-xl p-3 flex flex-wrap items-center gap-3 mb-4">
              <span className="text-sm font-medium">{selected.size} выбрано</span>
              <select
                value={bulkAction}
                onChange={(e) => setBulkAction(e.target.value)}
                aria-label="Массовое действие"
                className="rounded-lg border border-border px-2 py-1.5 text-sm"
              >
                <option value="">Действие...</option>
                <option value="cancelled">Отменить</option>
              </select>
              <Button
                size="sm"
                onClick={async () => {
                  if (!bulkAction) return
                  let succeeded = 0
                  let failed = 0
                  for (const id of selected) {
                    const order = orders.find((o) => o.id === id)
                    if (order) {
                      try {
                        await updateOrderStatus(id, order.status, bulkAction)
                        succeeded++
                      } catch {
                        failed++
                      }
                    }
                  }
                  if (failed > 0) {
                    toast.error(`${failed} из ${selected.size} заказов не обновлены`)
                  }
                  if (succeeded > 0) {
                    toast.success(`${succeeded} заказов обновлено`)
                  }
                  setSelected(new Set())
                  setBulkAction('')
                }}
                disabled={!bulkAction}
              >
                Применить
              </Button>
              <button onClick={() => setSelected(new Set())} className="text-sm text-text-muted hover:text-text">
                Снять выбор
              </button>
            </div>
          )}

          <div className="bg-surface rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Список заказов</caption>
                <thead>
                  <tr className="border-b border-border bg-surface-dim">
                    <th className="px-3 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={selected.size === orders.length && orders.length > 0}
                        onChange={(e) => setSelected(e.target.checked ? new Set(orders.map((o) => o.id)) : new Set())}
                        aria-label="Выбрать все заказы"
                        className="w-4 h-4 rounded border-border"
                      />
                    </th>
                    <SortHeader col="number" sortBy={sortBy} sortAsc={sortAsc} onSort={handleSort}>#</SortHeader>
                    <th className="text-left px-4 py-3 font-medium text-text-muted">Тип</th>
                    <th className="text-left px-4 py-3 font-medium text-text-muted">Размер</th>
                    <SortHeader col="qty" sortBy={sortBy} sortAsc={sortAsc} onSort={handleSort}>Тираж</SortHeader>
                    <th className="text-left px-4 py-3 font-medium text-text-muted">Статус</th>
                    <th className="text-left px-4 py-3 font-medium text-text-muted">Исполнитель</th>
                    <th className="text-left px-4 py-3 font-medium text-text-muted">Клиент</th>
                    <th className="text-left px-4 py-3 font-medium text-text-muted">Дедлайн</th>
                    <SortHeader col="price_final" sortBy={sortBy} sortAsc={sortAsc} onSort={handleSort}>Цена</SortHeader>
                    <SortHeader col="created_at" sortBy={sortBy} sortAsc={sortAsc} onSort={handleSort}>Создан</SortHeader>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className={`border-b border-border last:border-0 hover:bg-surface-dim/50 transition-colors ${selected.has(order.id) ? 'bg-accent/5' : ''}`}>
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(order.id)}
                          onChange={(e) => {
                            const next = new Set(selected)
                            e.target.checked ? next.add(order.id) : next.delete(order.id)
                            setSelected(next)
                          }}
                          aria-label={`Выбрать заказ #${order.number}`}
                          className="w-4 h-4 rounded border-border"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {(order.priority === 'urgent' || order.priority === 'high') && (
                            <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${order.priority === 'urgent' ? 'bg-red-500' : 'bg-orange-500'}`} title={PRIORITIES[order.priority]?.label} />
                          )}
                          <Link to={`/orders/${order.id}`} className="font-medium text-accent hover:underline">
                            {order.number}
                          </Link>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-muted">
                        {ORDER_TYPES[order.order_type]?.label || order.order_type}
                      </td>
                      <td className="px-4 py-3 text-text-muted">
                        {order.width_mm}x{order.height_mm}
                      </td>
                      <td className="px-4 py-3">{order.qty}</td>
                      <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                      <td className="px-4 py-3 text-text-muted">
                        {order.assignee?.display_name || '—'}
                      </td>
                      <td className="px-4 py-3 text-text-muted">
                        {order.client_name || order.clients?.name || '—'}
                      </td>
                      <td className={`px-4 py-3 ${isDeadlinePast(order) ? 'text-danger font-medium' : 'text-text-muted'}`}>
                        {formatDeadline(order.deadline)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{formatPrice(order.price_final)}</td>
                      <td className="px-4 py-3 text-right text-text-muted">{formatRelative(order.created_at)}</td>
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

function FilterBtn({ active, onClick, label, colorClass = '' }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`px-3 py-2.5 min-h-[44px] rounded-lg text-sm transition-colors ${
        active ? colorClass || 'bg-primary text-white' : 'bg-surface border border-border text-text-muted hover:bg-surface-dim'
      } ${active && colorClass ? 'font-medium' : ''}`}
    >
      {label}
    </button>
  )
}
