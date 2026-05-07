import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useOrders } from '../hooks/useOrders'
import { StatusBadge } from '../components/StatusBadge'
import { ORDER_TYPES, PRIORITIES } from '@/shared/constants'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { Pagination } from '@/shared/components/Pagination'
import { OrdersKanban } from '../components/OrdersKanban'
import { ProductionCalendar } from '@/features/production/components/ProductionCalendar'
import { DepartmentFilter } from '../components/DepartmentFilter'
import { DateRangeFilter } from '../components/DateRangeFilter'
import SearchInput from '@/shared/components/SearchInput'
import Tabs from '@/shared/components/Tabs'
import { getDeadlineLevel, getDeadlineClasses, getDeadlineDotClass, getDeadlineBorderClass } from '@/shared/lib/deadline'

const ACTIVE_STATUSES = ['new', 'design', 'prepress', 'print', 'lamination', 'cutting', 'selection_pouring', 'pouring', 'assembly_3d', 'packaging', 'otk']
const ARCHIVED_STATUSES = ['done', 'cancelled']

export default function OrdersPage() {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('deadline')
  const [sortAsc, setSortAsc] = useState(true)
  const [viewMode, setViewMode] = useState('list')
  const [statusFilters, setStatusFilters] = useState([])
  const [deptFilter, setDeptFilter] = useState([])
  const [includeArchived, setIncludeArchived] = useState(false)
  const [deadlineFrom, setDeadlineFrom] = useState(null)
  const [deadlineTo, setDeadlineTo] = useState(null)

  const debouncedSearch = useDebounce(search, 300)
  const [pPage, setPPage] = useState(1)
  const [pPerPage, setPPerPage] = useState(25)

  // Reset to page 1 when filters change
  useEffect(() => { setPPage(1) }, [statusFilters, debouncedSearch, sortBy, sortAsc, deadlineFrom, deadlineTo, includeArchived])

  const from = (pPage - 1) * pPerPage
  const to = pPage * pPerPage - 1

  // Если выбран фильтр статусов — используем его. Иначе — все активные (или + архив).
  const effectiveStatuses = statusFilters.length > 0
    ? statusFilters
    : includeArchived
      ? [...ACTIVE_STATUSES, ...ARCHIVED_STATUSES]
      : ACTIVE_STATUSES

  const { orders, totalCount, loading, error } = useOrders({
    statuses: effectiveStatuses,
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
    if (value === 'deadline') { setSortBy('deadline'); setSortAsc(true) }
    else { setSortBy('number'); setSortAsc(false) }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight">Заказы</h1>
          <p className="text-text-muted">
            {viewMode === 'list' && (totalCount > 0 ? `${totalCount} заказов` : 'Управление заказами')}
            {viewMode === 'kanban' && 'Канбан с DnD'}
            {viewMode === 'calendar' && 'Календарь дедлайнов'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Tabs
            items={[
              { key: 'list', label: 'Список' },
              { key: 'kanban', label: 'Канбан' },
              { key: 'calendar', label: 'Календарь' },
            ]}
            active={viewMode}
            onChange={setViewMode}
          />
          <Link
            to="/orders/create"
            className="bg-accent hover:bg-accent-hover text-on-accent font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors shadow-card"
          >
            + Новый заказ
          </Link>
        </div>
      </div>

      {/* List view filters */}
      {viewMode === 'list' && (
        <>
          <div className="flex flex-col sm:flex-row gap-3">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по номеру или заметкам..."
              ariaLabel="Поиск заказов"
              className="flex-1 max-w-md"
            />
            <div className="flex items-center gap-2 flex-wrap">
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
              <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer rounded-lg border border-border px-3 py-2 hover:bg-surface-2">
                <input
                  type="checkbox"
                  checked={includeArchived}
                  onChange={(e) => setIncludeArchived(e.target.checked)}
                  className="accent-accent"
                />
                Завершённые
              </label>
            </div>
          </div>

          <DateRangeFilter
            from={deadlineFrom}
            to={deadlineTo}
            onChange={({ from: f, to: t }) => { setDeadlineFrom(f); setDeadlineTo(t) }}
          />
        </>
      )}

      {/* Content */}
      {viewMode === 'kanban' && (
        <OrdersKanban
          deptFilter={deptFilter}
          onDeptFilterChange={setDeptFilter}
          includeArchived={includeArchived}
        />
      )}

      {viewMode === 'calendar' && <ProductionCalendar />}

      {viewMode === 'list' && (
        loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-surface rounded-2xl border border-border p-4 animate-pulse">
                <div className="h-4 bg-surface-dim rounded w-24 mb-3" />
                <div className="h-3 bg-surface-dim rounded w-full mb-2" />
                <div className="h-3 bg-surface-dim rounded w-3/4" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-danger/10 text-danger rounded-xl p-4 text-sm" role="alert">{String(error.message || error)}</div>
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
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {orders.map((order) => {
                const deadlineLevel = getDeadlineLevel(order.deadline)
                const dotCls = getDeadlineDotClass(order.deadline)
                const borderCls = getDeadlineBorderClass(order.deadline) || 'border-l-border'
                const textCls = getDeadlineClasses(order.deadline) || 'text-text-muted'
                return (
                  <Link
                    key={order.id}
                    to={`/orders/${order.id}`}
                    className={`block bg-surface rounded-2xl border border-border shadow-card p-4 hover:border-accent/40 hover:shadow-modal transition-[border-color,box-shadow] active:bg-surface-2 border-l-4 ${borderCls}`}
                  >
                    {/* Top row: number + deadline (right) */}
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        {dotCls && <span className={`w-2 h-2 rounded-full shrink-0 ${dotCls}`} aria-hidden="true" />}
                        <span className="font-semibold text-text">#{order.number}</span>
                        {order.priority && order.priority !== 'normal' && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${PRIORITIES[order.priority]?.color}`}>
                            {PRIORITIES[order.priority]?.label}
                          </span>
                        )}
                      </div>
                      {order.deadline && (
                        <span className={`text-xs whitespace-nowrap shrink-0 ${textCls} ${deadlineLevel === 'urgent' ? 'font-medium' : ''}`}>
                          {new Date(order.deadline).toLocaleDateString('ru-RU')}
                        </span>
                      )}
                    </div>

                    {/* Client */}
                    <p className="text-sm text-text mb-1 truncate">{order.client?.name || '—'}</p>

                    {/* Type / size / qty */}
                    <p className="text-xs text-text-muted mb-2">
                      {ORDER_TYPES[order.order_type]?.label || order.order_type}
                      {order.width_mm && order.height_mm ? ` · ${order.width_mm}×${order.height_mm}мм` : ''}
                      {' · '}{order.qty} шт
                    </p>

                    {/* Status */}
                    <StatusBadge status={order.status} />
                  </Link>
                )
              })}
            </div>
            <Pagination {...pagination} />
          </>
        )
      )}
    </div>
  )
}
