import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useOrders, deleteOrder } from '../hooks/useOrders'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { StatusBadge } from '../components/StatusBadge'
import { ORDER_TYPES, PRIORITIES, ACTIVE_ORDER_STATUSES } from '@/shared/constants'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { Pagination } from '@/shared/components/Pagination'
import { OrdersKanban } from '../components/OrdersKanban'
import { ProductionCalendar } from '@/features/production/components/ProductionCalendar'
import { DepartmentFilter } from '../components/DepartmentFilter'
import { DateRangeFilter } from '../components/DateRangeFilter'
import { SavedFilters } from '../components/SavedFilters'
import SearchInput from '@/shared/components/SearchInput'
import Tabs from '@/shared/components/Tabs'
import DropdownMenu from '@/shared/components/DropdownMenu'
import ConfirmDialog from '@/shared/components/ConfirmDialog'
import { getDeadlineLevel, getDeadlineClasses, getDeadlineDotClass, getDeadlineBorderClass } from '@/shared/lib/deadline'
import { stageDotClass, DEPT_GROUPS } from '@/shared/lib/department-mapping'
import { toast } from '@/shared/stores/toast-store'
import { formatOrderNumber } from '@/shared/lib/utils'
import { useActiveReprints } from '../hooks/useActiveReprints'
import { matchesReprintFilters, interleaveReprints, countActiveReprintsByOrder } from '../lib/active-reprints'
import { ReprintMobileRow, ReprintDesktopRow, ReprintsChip } from '../components/ReprintRows'

// R25.1: списки статусов строятся из констант/описания отделов — новый этап
// не может «потеряться» в фильтрах и группах (см. тест-«сторож» routes-v2).
const ACTIVE_STATUSES = ACTIVE_ORDER_STATUSES
const ARCHIVED_STATUSES = ['done', 'cancelled']

// Группы по отделам — таблица заказов разбивается на эти секции.
const GROUP_LABELS = { sales: 'Продажи', design: 'Дизайн', print: 'Печать', pouring: 'Заливка', finish: 'Финиш' }
const ORDER_GROUPS = [
  ...Object.entries(DEPT_GROUPS).map(([id, g]) => ({
    id,
    label: GROUP_LABELS[id] || g.label,
    statuses: g.stages.filter((s) => s !== 'done'),
    dotStatus: g.stages[0],
  })),
  { id: 'archive', label: 'Завершённые', statuses: ['done', 'cancelled'], dotStatus: 'done' },
]

export default function OrdersPage() {
  const { hasRole } = useAuth()
  const isManager = hasRole(['admin', 'manager'])
  const isAdmin = hasRole(['admin'])
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('deadline')
  const [sortAsc, setSortAsc] = useState(true)
  const [viewMode, setViewMode] = useState('list')
  const [statusFilters, setStatusFilters] = useState([])
  const [deptFilter, setDeptFilter] = useState([])
  const [includeArchived, setIncludeArchived] = useState(false)
  const [deadlineFrom, setDeadlineFrom] = useState(null)
  const [deadlineTo, setDeadlineTo] = useState(null)
  const [collapsedGroups, setCollapsedGroups] = useState({})
  // R25.3 (ТЗ 3.1): показывать допечатки в списке (сохраняется в сохранённых фильтрах).
  const [showReprints, setShowReprints] = useState(true)
  const [deletingOrder, setDeletingOrder] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const toggleGroup = useCallback((id) => {
    setCollapsedGroups((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  function applySavedFilter(config) {
    if (!config) return
    setStatusFilters(config.statusFilters || [])
    setDeptFilter(config.deptFilter || [])
    setIncludeArchived(!!config.includeArchived)
    setSortBy(config.sortBy || 'deadline')
    setSortAsc(config.sortAsc ?? true)
    setSearch(config.search || '')
    setShowReprints(config.showReprints ?? true)
  }

  const currentFilter = { statusFilters, deptFilter, includeArchived, sortBy, sortAsc, search, showReprints }

  const debouncedSearch = useDebounce(search, 300)
  const [pPage, setPPage] = useState(1)
  const [pPerPage, setPPerPage] = useState(50)

  // Reset to page 1 when filters change
  useEffect(() => { setPPage(1) }, [statusFilters, debouncedSearch, sortBy, sortAsc, deadlineFrom, deadlineTo, includeArchived])

  const fromIdx = (pPage - 1) * pPerPage
  const toIdx = pPage * pPerPage - 1

  // Если выбран фильтр статусов — используем его. Иначе — все активные (или + архив).
  const effectiveStatuses = statusFilters.length > 0
    ? statusFilters
    : includeArchived
      ? [...ACTIVE_STATUSES, ...ARCHIVED_STATUSES]
      : ACTIVE_STATUSES

  const { orders, totalCount, loading, error, refetch } = useOrders({
    statuses: effectiveStatuses,
    search: debouncedSearch,
    sortBy,
    sortAsc,
    from: fromIdx,
    to: toIdx,
    deadlineFrom,
    deadlineTo,
  })

  // R25.3: допечатки — общий источник для карточек, канбана и календаря.
  // Завершённые подгружаются только в архивном режиме (как готовые заказы).
  const { reprints } = useActiveReprints({ includeDone: includeArchived, enabled: showReprints })
  const reprintCountByOrder = useMemo(() => countActiveReprintsByOrder(reprints), [reprints])
  // Фильтры применяются к СОБСТВЕННОМУ этапу допечатки; срок/поиск — по родителю.
  const visibleReprints = reprints.filter((r) => matchesReprintFilters(r, {
    statuses: effectiveStatuses,
    search: debouncedSearch,
    deadlineFrom,
    deadlineTo,
  }))
  // Допечатки, чей родитель не на этой странице, показываем на первой странице.
  const includeOrphanReprints = pPage === 1

  async function handleConfirmDelete() {
    if (!deletingOrder) return
    setDeleting(true)
    try {
      await deleteOrder(deletingOrder.id)
      toast.success(`Заказ ${formatOrderNumber(deletingOrder)} удалён`)
      setDeletingOrder(null)
      refetch()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setDeleting(false)
    }
  }

  // Группировка orders по статусу→группе
  const grouped = useMemo(() => {
    const buckets = ORDER_GROUPS.map((g) => ({ ...g, orders: [], reprints: [] }))
    const idxByStatus = {}
    ORDER_GROUPS.forEach((g, i) => g.statuses.forEach((s) => { idxByStatus[s] = i }))
    orders.forEach((o) => {
      const idx = idxByStatus[o.status]
      if (idx !== undefined) buckets[idx].orders.push(o)
    })
    // R25.3: допечатка — в группе своего этапа, сразу после родителя (если он там).
    const pageOrderIds = new Set(orders.map((o) => o.id))
    visibleReprints.forEach((r) => {
      const idx = idxByStatus[r.status]
      if (idx === undefined) return
      if (!includeOrphanReprints && !pageOrderIds.has(r.order?.id)) return
      buckets[idx].reprints.push(r)
    })
    return buckets
      .map((g) => ({ ...g, rows: interleaveReprints(g.orders, g.reprints) }))
      .filter((g) => g.rows.length > 0)
  }, [orders, visibleReprints, includeOrphanReprints])

  const flatRows = useMemo(
    () => interleaveReprints(orders, visibleReprints, { includeOrphans: includeOrphanReprints }),
    [orders, visibleReprints, includeOrphanReprints],
  )
  const shownReprintsCount = flatRows.length - orders.length

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
            {viewMode === 'list' && (totalCount > 0 ? `${totalCount} заказов${shownReprintsCount > 0 ? ` + ${shownReprintsCount} доп.` : ''}` : 'Управление заказами')}
            {viewMode === 'kanban' && 'Канбан с DnD'}
            {viewMode === 'calendar' && 'Календарь дедлайнов'}
            {viewMode === 'flat' && (totalCount > 0 ? `${totalCount} заказов${shownReprintsCount > 0 ? ` + ${shownReprintsCount} доп.` : ''} · единый список` : 'Все заказы')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(() => {
            const viewItems = [
              { key: 'list', label: 'По отделам' },
              { key: 'kanban', label: 'Канбан' },
              { key: 'calendar', label: 'Календарь' },
              { key: 'flat', label: 'Все заказы' },
            ]
            return (
              <>
                <div className="hidden md:inline-block">
                  <Tabs items={viewItems} active={viewMode} onChange={setViewMode} />
                </div>
                <DropdownMenu items={viewItems} active={viewMode} onChange={setViewMode} className="md:hidden" />
              </>
            )
          })()}
          {isManager && (
            <Link
              to="/orders/create"
              className="bg-accent hover:bg-accent-hover text-on-accent font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors shadow-card"
            >
              + Новый заказ
            </Link>
          )}
        </div>
      </div>

      {/* List/flat view filters (одинаковые для обоих списочных вьюх) */}
      {(viewMode === 'list' || viewMode === 'flat') && (
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
              <ReprintsToggle checked={showReprints} onChange={setShowReprints} />
            </div>
          </div>

          <DateRangeFilter
            from={deadlineFrom}
            to={deadlineTo}
            onChange={({ from: f, to: t }) => { setDeadlineFrom(f); setDeadlineTo(t) }}
          />

          <SavedFilters currentFilter={currentFilter} onApply={applySavedFilter} />
        </>
      )}

      {/* Content */}
      {(viewMode === 'kanban' || viewMode === 'calendar') && (
        <div className="flex">
          <ReprintsToggle checked={showReprints} onChange={setShowReprints} />
        </div>
      )}

      {viewMode === 'kanban' && (
        <OrdersKanban
          deptFilter={deptFilter}
          onDeptFilterChange={setDeptFilter}
          includeArchived={includeArchived}
          reprints={showReprints ? reprints : []}
          reprintCountByOrder={reprintCountByOrder}
        />
      )}

      {viewMode === 'calendar' && (
        <ProductionCalendar reprints={showReprints ? reprints.filter((r) => r.status !== 'done') : []} />
      )}

      <ConfirmDialog
        isOpen={!!deletingOrder}
        onClose={() => (!deleting ? setDeletingOrder(null) : null)}
        onConfirm={handleConfirmDelete}
        title="Удалить заказ?"
        message={
          deletingOrder
            ? `Заказ ${formatOrderNumber(deletingOrder)} «${deletingOrder.client?.name || 'без клиента'}» будет удалён без возможности восстановления. Вместе с ним пропадут история, комментарии, вложения и производственные логи.`
            : ''
        }
        confirmText={deleting ? 'Удаление…' : 'Удалить'}
      />

      {(viewMode === 'list' || viewMode === 'flat') && (
        loading ? (
          <div className="bg-surface rounded-2xl border border-border overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 border-b border-border last:border-0 animate-pulse bg-surface-dim/50" />
            ))}
          </div>
        ) : error ? (
          <div className="bg-danger/10 text-danger rounded-xl p-4 text-sm" role="alert">{String(error.message || error)}</div>
        ) : orders.length === 0 && flatRows.length === 0 ? (
          <div className="bg-surface rounded-xl border border-border p-12 text-center">
            <h3 className="text-lg font-semibold mb-1">{search ? 'Ничего не найдено' : 'Нет заказов'}</h3>
            <p className="text-text-muted text-sm mb-4">{search ? 'Попробуйте другой запрос' : 'Создайте первый заказ'}</p>
            {!search && (
              <Link to="/orders/create" className="inline-flex bg-accent hover:bg-accent-hover text-on-accent font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors shadow-card">
                Создать заказ
              </Link>
            )}
          </div>
        ) : viewMode === 'flat' ? (
          <>
            <section className="bg-surface rounded-2xl border border-border shadow-card overflow-hidden">
              {/* Mobile cards */}
              <ul className="sm:hidden divide-y divide-border">
                {flatRows.map((row) => renderMobile(row, isAdmin, setDeletingOrder, reprintCountByOrder))}
              </ul>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-text-muted bg-surface-dim/50">
                      <th className="px-4 py-2 font-medium w-16">№</th>
                      <th className="px-4 py-2 font-medium">Заказчик</th>
                      <th className="px-4 py-2 font-medium">Тип</th>
                      <th className="px-4 py-2 font-medium">Размер</th>
                      <th className="px-4 py-2 font-medium text-right">Тираж</th>
                      <th className="px-4 py-2 font-medium text-right">В паке</th>
                      <th className="px-4 py-2 font-medium">Этап</th>
                      <th className="px-4 py-2 font-medium">Срок</th>
                      {isAdmin && <th className="px-2 py-2 font-medium w-10 sr-only">Действия</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {flatRows.map((row) => renderDesktop(row, isAdmin, setDeletingOrder, reprintCountByOrder))}
                  </tbody>
                </table>
              </div>
            </section>
            <Pagination {...pagination} />
          </>
        ) : (
          <>
            {grouped.map((group) => {
              const isCollapsed = !!collapsedGroups[group.id]
              return (
                <section key={group.id} className="bg-surface rounded-2xl border border-border shadow-card overflow-hidden">
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className="w-full flex items-center gap-2.5 px-4 py-3 bg-surface-2 hover:bg-surface-dim transition-colors text-left border-b border-border"
                    aria-expanded={!isCollapsed}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${stageDotClass(group.dotStatus)}`} aria-hidden="true" />
                    <span className="font-semibold text-sm">{group.label}</span>
                    <span className="text-xs text-text-muted bg-surface px-2 py-0.5 rounded-full">
                      {group.orders.length}{group.reprints.length > 0 ? ` + ${group.reprints.length} доп.` : ''}
                    </span>
                    <svg
                      className={`ml-auto w-4 h-4 text-text-muted transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                      fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>

                  {!isCollapsed && (
                    <>
                      {/* Mobile cards */}
                      <ul className="sm:hidden divide-y divide-border">
                        {group.rows.map((row) => renderMobile(row, isAdmin, setDeletingOrder, reprintCountByOrder))}
                      </ul>

                      {/* Desktop table */}
                      <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-text-muted bg-surface-dim/50">
                              <th className="px-4 py-2 font-medium w-16">№</th>
                              <th className="px-4 py-2 font-medium">Заказчик</th>
                              <th className="px-4 py-2 font-medium">Тип</th>
                              <th className="px-4 py-2 font-medium">Размер</th>
                              <th className="px-4 py-2 font-medium text-right">Тираж</th>
                              <th className="px-4 py-2 font-medium text-right">В паке</th>
                              <th className="px-4 py-2 font-medium">Этап</th>
                              <th className="px-4 py-2 font-medium">Срок</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.rows.map((row) => renderDesktop(row, isAdmin, setDeletingOrder, reprintCountByOrder))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </section>
              )
            })}
            <Pagination {...pagination} />
          </>
        )
      )}
    </div>
  )
}

// R25.3: строка списка — заказ или допечатка (из interleaveReprints).
function renderMobile(row, isAdmin, onDelete, reprintCountByOrder) {
  if (row.kind === 'reprint') return <ReprintMobileRow key={`r-${row.reprint.id}`} reprint={row.reprint} />
  return (
    <MobileRow key={row.order.id} order={row.order} isAdmin={isAdmin} onDelete={onDelete}
      reprintCount={reprintCountByOrder[row.order.id] || 0} />
  )
}

function renderDesktop(row, isAdmin, onDelete, reprintCountByOrder) {
  if (row.kind === 'reprint') return <ReprintDesktopRow key={`r-${row.reprint.id}`} reprint={row.reprint} extraCell={isAdmin} />
  return (
    <DesktopRow key={row.order.id} order={row.order} isAdmin={isAdmin} onDelete={onDelete}
      reprintCount={reprintCountByOrder[row.order.id] || 0} />
  )
}

function ReprintsToggle({ checked, onChange }) {
  return (
    <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer rounded-lg border border-border px-3 py-2 hover:bg-surface-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-accent"
      />
      Подзадачи
    </label>
  )
}

function MobileRow({ order, isAdmin, onDelete, reprintCount = 0 }) {
  const dotCls = getDeadlineDotClass(order.deadline)
  const textCls = getDeadlineClasses(order.deadline) || 'text-text-muted'
  return (
    <li className="relative">
      <Link
        to={`/orders/${order.id}`}
        className="flex flex-col gap-1 px-4 py-3 hover:bg-surface-2 transition-colors active:bg-surface-dim"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {dotCls && <span className={`w-2 h-2 rounded-full shrink-0 ${dotCls}`} aria-hidden="true" />}
            <span className="font-semibold text-text">#{formatOrderNumber(order)}</span>
            <ReprintsChip count={reprintCount} />
            {order.priority && order.priority !== 'normal' && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${PRIORITIES[order.priority]?.color}`}>
                {PRIORITIES[order.priority]?.label}
              </span>
            )}
          </div>
          {order.deadline && (
            <span className={`text-xs whitespace-nowrap shrink-0 ${textCls} ${isAdmin ? 'mr-9' : ''}`}>
              {new Date(order.deadline).toLocaleDateString('ru-RU')}
            </span>
          )}
        </div>
        <p className="text-sm text-text truncate">{order.client?.name || '—'}</p>
        <div className="flex items-center justify-between gap-2 text-xs text-text-muted">
          <span className="truncate">
            {ORDER_TYPES[order.order_type]?.label || order.order_type}
            {order.width_mm && order.height_mm ? ` · ${order.width_mm}×${order.height_mm}` : ''}
            {' · '}{order.qty} шт
          </span>
          <StatusBadge status={order.status} />
        </div>
      </Link>
      {isAdmin && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(order) }}
          aria-label={`Удалить заказ #${formatOrderNumber(order)}`}
          title="Удалить заказ"
          className="absolute top-2 right-2 text-text-muted hover:text-danger transition-colors rounded-lg p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
        </button>
      )}
    </li>
  )
}

function DesktopRow({ order, isAdmin, onDelete, reprintCount = 0 }) {
  const deadlineLevel = getDeadlineLevel(order.deadline)
  const dotCls = getDeadlineDotClass(order.deadline)
  const borderCls = getDeadlineBorderClass(order.deadline) || 'border-l-transparent'
  const textCls = getDeadlineClasses(order.deadline) || 'text-text-muted'
  return (
    <tr
      onClick={() => { window.location.href = `/orders/${order.id}` }}
      className={`border-b border-border last:border-0 hover:bg-surface-2 transition-colors cursor-pointer border-l-4 ${borderCls}`}
    >
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          {dotCls && <span className={`w-2 h-2 rounded-full shrink-0 ${dotCls}`} aria-hidden="true" />}
          <Link
            to={`/orders/${order.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-text hover:text-accent transition-colors"
          >
            #{formatOrderNumber(order)}
          </Link>
          <ReprintsChip count={reprintCount} />
          {order.priority && order.priority !== 'normal' && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${PRIORITIES[order.priority]?.color}`}>
              {PRIORITIES[order.priority]?.label}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-2.5 text-text truncate max-w-[220px]">{order.client?.name || '—'}</td>
      <td className="px-4 py-2.5 text-text-muted">{ORDER_TYPES[order.order_type]?.label || order.order_type}</td>
      <td className="px-4 py-2.5 text-text-muted whitespace-nowrap">
        {order.width_mm && order.height_mm ? `${order.width_mm}×${order.height_mm} мм` : '—'}
      </td>
      <td className="px-4 py-2.5 text-right text-text-muted whitespace-nowrap">{order.qty} шт</td>
      <td className="px-4 py-2.5 text-right text-text-muted whitespace-nowrap">{order.stickers_per_pack || '—'}</td>
      <td className="px-4 py-2.5"><StatusBadge status={order.status} /></td>
      <td className={`px-4 py-2.5 whitespace-nowrap text-xs ${textCls} ${deadlineLevel === 'urgent' ? 'font-semibold' : ''}`}>
        {order.deadline ? new Date(order.deadline).toLocaleDateString('ru-RU') : '—'}
      </td>
      {isAdmin && (
        <td className="px-2 py-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => onDelete(order)}
            aria-label={`Удалить заказ #${formatOrderNumber(order)}`}
            title="Удалить заказ"
            className="text-text-muted hover:text-danger transition-colors rounded-lg p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
          </button>
        </td>
      )}
    </tr>
  )
}
