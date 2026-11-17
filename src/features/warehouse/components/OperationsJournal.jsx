import { useMemo, useRef, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  useMovementsList, useMovementsTotals, useJournalLookups, fetchAllMovements,
} from '../hooks/useWarehouseJournal'
import {
  OPERATION_KINDS, JOURNAL_PERIODS, DEFAULT_JOURNAL_FILTERS,
  parseJournalFilters, serializeJournalFilters, buildRpcFilters,
  periodRange, formatRangeLabel, enteredOnOtherDay, describeJournalFilters,
  buildJournalAoa, buildParamsAoa,
} from '../lib/warehouse-journal'
import { OperationKindBadge } from './OperationKindBadge'
import { ClarifyOperationModal } from './ClarifyOperationModal'
import { ExportProgressButton } from './ExportProgressButton'
import { downloadXlsxBook } from '@/shared/lib/export-xlsx'
import { formatNumber, formatPrice, formatQty, formatDate } from '@/shared/lib/utils'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useDebounce } from '@/shared/hooks/useDebounce'
import MultiSelect from '@/shared/components/MultiSelect'
import Spinner from '@/shared/components/Spinner'
import ErrorState from '@/shared/components/ErrorState'

const VIRTUALIZE_AFTER = 2000

const selectCls = 'rounded-lg border border-border bg-surface px-3 py-2 text-sm'
const inputCls = 'rounded-lg border border-border bg-surface px-3 py-2 text-sm min-w-0'

/** Количество со знаком и единицей. */
function SignedQty({ delta, unit }) {
  const d = Number(delta)
  return (
    <span className={`font-medium tabular-nums whitespace-nowrap ${d >= 0 ? 'text-success' : 'text-danger'}`}>
      {d > 0 ? '+' : d < 0 ? '−' : ''}{formatNumber(Math.abs(d), 3)} {unit}
    </span>
  )
}

function OrderLink({ row }) {
  if (!row.order_id || row.order_number == null) return <span className="text-text-muted">—</span>
  return (
    <Link to={`/orders/${row.order_id}`} className="text-text hover:text-accent underline decoration-text-muted/40 whitespace-nowrap">
      #{row.order_custom_number || row.order_number}
    </Link>
  )
}

/**
 * R25.8 (ТЗ 8.4) — «Журнал операций» склада. Фильтры применяются на сервере
 * (RPC warehouse_movements) ко всей базе и живут в адресе страницы; строки
 * догружаются по 100 при прокрутке; итоги — по всему фильтру.
 */
export function OperationsJournal({ categories = [], onOpenMaterial }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = useMemo(() => parseJournalFilters(searchParams), [searchParams])
  const canSeeFinance = useCanDo('view:finance')
  const canEditOps = useCanDo('warehouse:edit_operation')
  const { profile } = useAuth()
  const { materials, users } = useJournalLookups()
  const [clarify, setClarify] = useState(null)

  // Текстовые поля: локальный ввод + debounce → URL.
  const [text, setText] = useState({ supplier: filters.supplier, order: filters.order, q: filters.q })
  const debouncedText = useDebounce(text, 400)
  useEffect(() => {
    if (debouncedText.supplier === filters.supplier && debouncedText.order === filters.order && debouncedText.q === filters.q) return
    setFilters({ ...filters, ...debouncedText })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedText])

  function setFilters(next) {
    const base = {}
    const tab = searchParams.get('tab')
    if (tab) base.tab = tab
    setSearchParams(serializeJournalFilters(next, base), { replace: true })
  }
  function patch(p) { setFilters({ ...filters, ...p }) }
  function resetFilters() {
    setText({ supplier: '', order: '', q: '' })
    setFilters(DEFAULT_JOURNAL_FILTERS)
  }

  const rpcFilters = useMemo(() => buildRpcFilters(filters), [filters])
  const { rows, total, loading, loadingMore, error, hasMore, loadMore, reload } = useMovementsList(rpcFilters, filters.sort)
  const { totals, reload: reloadTotals } = useMovementsTotals(rpcFilters)
  const showBalance = !!filters.material

  // Догрузка при прокрутке к концу списка.
  const scrollRef = useRef(null)
  const sentinelRef = useRef(null)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore()
    }, { root: scrollRef.current, rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [loadMore, rows.length])

  const virtualize = rows.length > VIRTUALIZE_AFTER

  function toggleSort(col) {
    const map = {
      date: filters.sort === 'date_desc' ? 'date_asc' : 'date_desc',
      material: 'material_asc',
      qty: filters.sort === 'qty_desc' ? 'qty_asc' : 'qty_desc',
    }
    patch({ sort: map[col] })
  }
  const sortMark = (col) => {
    if (col === 'date' && filters.sort.startsWith('date')) return filters.sort === 'date_desc' ? ' ↓' : ' ↑'
    if (col === 'material' && filters.sort === 'material_asc') return ' ↑'
    if (col === 'qty' && filters.sort.startsWith('qty')) return filters.sort === 'qty_desc' ? ' ↓' : ' ↑'
    return ''
  }

  const range = periodRange(filters.period, undefined, { from: filters.from, to: filters.to })

  async function runExport(onProgress) {
    const all = await fetchAllMovements(rpcFilters, filters.sort, { total: total ?? undefined, onProgress })
    const params = describeJournalFilters(filters, { categories, materials, users })
    await downloadXlsxBook(`Склад — журнал ${formatRangeLabel(range)}`, [
      { name: 'Операции', aoa: buildJournalAoa(all, { showMoney: canSeeFinance, showBalance }) },
      { name: 'Параметры', aoa: buildParamsAoa(params, { user: profile?.display_name }) },
    ])
  }

  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }))
  const kindOptions = Object.entries(OPERATION_KINDS).map(([value, k]) => ({ value, label: k.label }))
  const unitLabel = totals?.unit_count === 1 ? totals.unit : null

  const colCount = 9 + (showBalance ? 1 : 0) + (canSeeFinance ? 2 : 0) + (canEditOps ? 1 : 0)

  return (
    <div className="space-y-3">
      {/* Фильтры */}
      <div className="bg-surface rounded-2xl border border-border p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 items-end">
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Период
          <select value={filters.period} onChange={(e) => patch({ period: e.target.value })} className={selectCls}>
            {JOURNAL_PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>
        {filters.period === 'custom' && (
          <div className="flex gap-2">
            <label className="flex flex-col gap-1 text-xs text-text-muted flex-1 min-w-0">
              С
              <input type="date" value={filters.from} onChange={(e) => patch({ from: e.target.value })} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-muted flex-1 min-w-0">
              По
              <input type="date" value={filters.to} onChange={(e) => patch({ to: e.target.value })} className={inputCls} />
            </label>
          </div>
        )}
        <MultiSelect label="Категории" options={categoryOptions} value={filters.categories} onChange={(v) => patch({ categories: v })} allLabel="Все категории" />
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Позиция
          <input
            list="journal-materials"
            defaultValue={materials.find((m) => m.id === filters.material)?.name || ''}
            key={filters.material + materials.length}
            placeholder="Поиск позиции"
            onChange={(e) => {
              const v = e.target.value
              if (!v) { patch({ material: '' }); return }
              const m = materials.find((x) => x.name === v)
              if (m) patch({ material: m.id })
            }}
            className={inputCls}
          />
          <datalist id="journal-materials">
            {materials.map((m) => <option key={m.id} value={m.name}>{m.archived_at ? 'архив' : ''}</option>)}
          </datalist>
        </label>
        <MultiSelect label="Вид" options={kindOptions} value={filters.kinds} onChange={(v) => patch({ kinds: v })} allLabel="Все виды" />
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Ручные / автоматические
          <select value={filters.auto} onChange={(e) => patch({ auto: e.target.value })} className={selectCls}>
            <option value="">Все операции</option>
            <option value="manual">Только ручные</option>
            <option value="auto">Автоматические</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Поставщик
          <input value={text.supplier} onChange={(e) => setText((t) => ({ ...t, supplier: e.target.value }))} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Номер заказа
          <input value={text.order} inputMode="numeric" onChange={(e) => setText((t) => ({ ...t, order: e.target.value }))} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Сотрудник
          <select value={filters.user} onChange={(e) => patch({ user: e.target.value })} className={selectCls}>
            <option value="">Все</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.display_name || '—'}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Поиск по комментарию и № документа
          <input value={text.q} onChange={(e) => setText((t) => ({ ...t, q: e.target.value }))} className={inputCls} />
        </label>
        <label className="flex items-center gap-2 text-sm py-2">
          <input type="checkbox" checked={filters.review} onChange={(e) => patch({ review: e.target.checked })} />
          Проверить после переноса
        </label>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={resetFilters} className="text-sm px-3 py-2 rounded-lg border border-border hover:bg-surface-2">
            Сбросить
          </button>
          <ExportProgressButton run={runExport} disabled={!total} />
        </div>
      </div>

      {/* Итоги по всему фильтру */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <span className="text-text-muted">
          Показано <span className="text-text font-medium tabular-nums">{formatQty(rows.length, 0)}</span> из{' '}
          <span className="text-text font-medium tabular-nums">{total == null ? '…' : formatQty(total, 0)}</span>
        </span>
        {totals && unitLabel && (
          <>
            <span>Пришло: <span className="text-success font-medium tabular-nums">+{formatNumber(totals.qty_in, 3)} {unitLabel}</span></span>
            <span>Ушло: <span className="text-danger font-medium tabular-nums">−{formatNumber(totals.qty_out, 3)} {unitLabel}</span></span>
            <span>Изменение: <span className="font-medium tabular-nums">{Number(totals.qty_net) > 0 ? '+' : ''}{formatNumber(totals.qty_net, 3)} {unitLabel}</span></span>
          </>
        )}
        {totals && !unitLabel && Number(totals.op_count) > 0 && (
          <span className="text-text-muted" title="У операций фильтра разные единицы измерения">Операций: {formatQty(totals.op_count, 0)} (разные единицы)</span>
        )}
        {canSeeFinance && totals?.purchase_sum != null && (
          <span>Сумма прихода: <span className="font-medium tabular-nums">{formatPrice(totals.purchase_sum)}</span></span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => { reload(); reloadTotals() }} />
      ) : rows.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border p-12 text-center text-text-muted text-sm">
          Нет операций по выбранным фильтрам
        </div>
      ) : (
        <div className="relative bg-surface rounded-2xl border border-border shadow-card">
          <div
            ref={scrollRef}
            onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 400)}
            className="overflow-auto max-h-[70vh] rounded-2xl"
          >
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr className="text-left text-xs text-text-muted bg-surface-dim">
                  <th className="px-3 py-2 font-medium cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('date')}>Дата{sortMark('date')}</th>
                  <th className="px-3 py-2 font-medium">Категория</th>
                  <th className="px-3 py-2 font-medium cursor-pointer select-none" onClick={() => toggleSort('material')}>Позиция{sortMark('material')}</th>
                  <th className="px-3 py-2 font-medium">Вид</th>
                  <th className="px-3 py-2 font-medium text-right cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('qty')}>Количество{sortMark('qty')}</th>
                  {showBalance && <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Остаток после</th>}
                  {canSeeFinance && <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Сумма, ₽</th>}
                  {canSeeFinance && <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Цена за ед., ₽</th>}
                  <th className="px-3 py-2 font-medium">Поставщик, № док.</th>
                  <th className="px-3 py-2 font-medium">Заказ</th>
                  <th className="px-3 py-2 font-medium">Комментарий</th>
                  <th className="px-3 py-2 font-medium">Кто</th>
                  {canEditOps && <th className="px-3 py-2" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border last:border-0 hover:bg-surface-2 transition-colors align-top"
                    style={virtualize ? { contentVisibility: 'auto', containIntrinsicSize: 'auto 44px' } : undefined}
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatDate(r.op_date)}
                      {enteredOnOtherDay(r) && (
                        <span className="block text-[11px] text-text-muted" title="Время внесения в систему">
                          внесено {new Date(r.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-text-muted">{r.category_name || '—'}</td>
                    <td className="px-3 py-2 font-medium">
                      <button type="button" onClick={() => onOpenMaterial?.(r.material_id)} className="text-left hover:text-accent underline decoration-text-muted/30">
                        {r.material_name}
                      </button>
                      {r.material_archived && <span className="ml-1 text-[10px] text-text-muted">(архив)</span>}
                    </td>
                    <td className="px-3 py-2"><OperationKindBadge kind={r.kind} isAuto={r.is_auto} needsReview={r.needs_review} /></td>
                    <td className="px-3 py-2 text-right"><SignedQty delta={r.delta} unit={r.unit} /></td>
                    {showBalance && <td className="px-3 py-2 text-right tabular-nums">{formatNumber(r.balance_after, 3)} {r.unit}</td>}
                    {canSeeFinance && <td className="px-3 py-2 text-right tabular-nums">{r.total_cost != null ? formatPrice(r.total_cost) : '—'}</td>}
                    {canSeeFinance && <td className="px-3 py-2 text-right tabular-nums">{r.unit_cost != null ? formatPrice(r.unit_cost) : '—'}</td>}
                    <td className="px-3 py-2 text-text-muted">
                      {r.supplier || r.doc_number ? (
                        <>
                          {r.supplier && <span className="block">{r.supplier}</span>}
                          {r.doc_number && <span className="block text-xs">№ {r.doc_number}</span>}
                        </>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2"><OrderLink row={r} /></td>
                    <td className="px-3 py-2 text-text-muted max-w-[16rem]">{r.reason || '—'}</td>
                    <td className="px-3 py-2 text-text-muted whitespace-nowrap">{r.created_by_name || (r.is_auto ? 'Система' : '—')}</td>
                    {canEditOps && (
                      <td className="px-3 py-2">
                        {!r.is_auto && (
                          <button type="button" onClick={() => setClarify(r)} className="text-xs text-accent hover:underline whitespace-nowrap">
                            Уточнить
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                <tr>
                  <td colSpan={colCount} className="p-0">
                    <div ref={sentinelRef} className="h-1" />
                    {loadingMore && <div className="flex justify-center py-3"><Spinner size="sm" /></div>}
                    {!hasMore && rows.length > 0 && (
                      <p className="text-center text-xs text-text-muted py-3">Это все операции по фильтру</p>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {scrolled && (
            <button
              type="button"
              onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
              className="absolute right-4 bottom-4 text-sm px-3 py-2 rounded-full bg-accent text-on-accent shadow-card"
            >
              ↑ Наверх
            </button>
          )}
        </div>
      )}

      {clarify && (
        <ClarifyOperationModal
          operation={clarify}
          onClose={() => setClarify(null)}
          onSaved={() => { setClarify(null); reload(); reloadTotals() }}
        />
      )}
    </div>
  )
}
