import { useState, useMemo, useEffect, Fragment } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchAllMovements, useTurnover } from '../hooks/useWarehouseJournal'
import {
  JOURNAL_PERIODS, periodRange, formatRangeLabel, enteredOnOtherDay,
  groupReceiptsByCategory, groupTurnoverByCategory, isTurnoverBalanced,
  buildReceiptsAoa, buildTurnoverAoa, buildParamsAoa, serializeJournalFilters,
  DEFAULT_JOURNAL_FILTERS, compareMovementsDesc,
} from '../lib/warehouse-journal'
import { ExportProgressButton } from './ExportProgressButton'
import { downloadXlsxBook } from '@/shared/lib/export-xlsx'
import { captureError } from '@/shared/lib/sentry'
import { formatNumber, formatPrice, formatDate, formatQty } from '@/shared/lib/utils'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import { useAuth } from '@/features/auth/hooks/useAuth'
import MultiSelect from '@/shared/components/MultiSelect'
import Spinner from '@/shared/components/Spinner'
import ErrorState from '@/shared/components/ErrorState'

const PERIODS = JOURNAL_PERIODS.filter((p) => p.value !== 'all')
const selectCls = 'rounded-lg border border-border bg-surface px-3 py-2 text-sm'

function Qty({ value, unit, mixed }) {
  if (mixed) return <span className="text-text-muted" title="разные единицы">—</span>
  if (value == null) return <span className="text-text-muted">—</span>
  return <span className="tabular-nums whitespace-nowrap">{formatNumber(value, 3)}{unit ? ` ${unit}` : ''}</span>
}

function NumCell({ value, unit, mixed, onClick }) {
  return (
    <td className="px-3 py-2 text-right">
      {onClick && !mixed && value != null && Number(value) !== 0 ? (
        <button type="button" onClick={onClick} className="hover:text-accent underline decoration-text-muted/30">
          <Qty value={value} unit={unit} mixed={mixed} />
        </button>
      ) : <Qty value={value} unit={unit} mixed={mixed} />}
    </td>
  )
}

/**
 * Загрузка поступлений периода (вид «Поступление», опц. «Начальный остаток»).
 */
function useReceipts(rpcFilters) {
  const key = JSON.stringify(rpcFilters)
  const [state, setState] = useState({ rows: [], loading: true, error: null })
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    fetchAllMovements(JSON.parse(key), 'date_desc')
      .then((rows) => { if (!cancelled) setState({ rows, loading: false, error: null }) })
      .catch((err) => {
        if (cancelled) return
        captureError(err, { tags: { source: 'ReceiptsTab.load' } })
        setState({ rows: [], loading: false, error: err })
      })
    return () => { cancelled = true }
  }, [key, nonce])
  return { ...state, reload: () => setNonce((n) => n + 1) }
}

/**
 * R25.8 (ТЗ 8.6) — вкладка «Поступления»: журнал поступлений по категориям и
 * сводка (оборотная ведомость) за период. Общий выбор периода (по умолчанию
 * текущий месяц) и категорий.
 */
export function ReceiptsTab({ categories = [] }) {
  const [, setSearchParams] = useSearchParams()
  const canSeeFinance = useCanDo('view:finance')
  const { profile } = useAuth()
  const [view, setView] = useState('journal') // 'journal' | 'summary'
  const [period, setPeriod] = useState('month')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [cats, setCats] = useState([])
  const [withOpening, setWithOpening] = useState(false)
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [expanded, setExpanded] = useState(() => new Set())

  const range = periodRange(period, undefined, custom)
  const rangeReady = !!(range.from && range.to)

  const receiptFilters = useMemo(() => {
    const f = { kinds: withOpening ? ['purchase', 'opening'] : ['purchase'] }
    if (range.from) f.from = range.from
    if (range.to) f.to = range.to
    if (cats.length) f.category_ids = cats
    return f
  }, [range.from, range.to, cats, withOpening])

  const receipts = useReceipts(receiptFilters)
  const turnover = useTurnover(rangeReady ? range.from : null, rangeReady ? range.to : null, cats)

  const grouped = useMemo(() => groupReceiptsByCategory(receipts.rows), [receipts.rows])
  const turnoverGroups = useMemo(() => groupTurnoverByCategory(turnover.rows), [turnover.rows])
  const unbalanced = turnover.rows.filter((r) => !isTurnoverBalanced(r)).length

  function toggle(setter, key) {
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  /** Клик по числу сводки → журнал с фильтром по позиции, виду и периоду. */
  function openJournal({ materialId, categoryId, kinds = [] }) {
    const f = {
      ...DEFAULT_JOURNAL_FILTERS,
      period: 'custom',
      from: range.from || '',
      to: range.to || '',
      material: materialId || '',
      categories: !materialId && categoryId ? [categoryId] : [],
      kinds,
    }
    setSearchParams(serializeJournalFilters(f, { tab: 'journal' }))
  }

  async function runExport(onProgress) {
    if (!rangeReady) throw new Error('Выберите период')
    const rows = await fetchAllMovements(receiptFilters, 'date_desc', { onProgress })
    const params = [
      ['Период', formatRangeLabel(range)],
      ['Категории', cats.map((id) => categories.find((c) => c.id === id)?.name || id).join(', ') || 'все'],
      ['С начальными остатками', withOpening ? 'да' : 'нет'],
    ]
    await downloadXlsxBook(`Склад — поступления ${formatRangeLabel(range)}`, [
      { name: 'Поступления', aoa: buildReceiptsAoa(rows, { showMoney: canSeeFinance }) },
      { name: 'Сводка', aoa: buildTurnoverAoa(turnover.rows, { showMoney: canSeeFinance }) },
      { name: 'Параметры', aoa: buildParamsAoa(params, { user: profile?.display_name }) },
    ])
  }

  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }))

  return (
    <div className="space-y-3">
      <div className="bg-surface rounded-2xl border border-border p-3 flex flex-wrap gap-2 items-end">
        <div className="flex rounded-lg border border-border overflow-hidden">
          {[['journal', 'Журнал поступлений'], ['summary', 'Сводка по категориям']].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setView(k)}
              className={`px-3 py-2 text-sm transition-colors ${view === k ? 'bg-accent text-on-accent' : 'hover:bg-surface-2'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Период
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className={selectCls}>
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>
        {period === 'custom' && (
          <>
            <label className="flex flex-col gap-1 text-xs text-text-muted">
              С
              <input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className={selectCls} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-muted">
              По
              <input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className={selectCls} />
            </label>
          </>
        )}
        <MultiSelect label="Категории" options={categoryOptions} value={cats} onChange={setCats} allLabel="Все категории" />
        {view === 'journal' && (
          <label className="flex items-center gap-2 text-sm py-2">
            <input type="checkbox" checked={withOpening} onChange={(e) => setWithOpening(e.target.checked)} />
            С начальными остатками
          </label>
        )}
        <div className="ml-auto">
          <ExportProgressButton run={runExport} disabled={!rangeReady} />
        </div>
      </div>

      {!rangeReady ? (
        <p className="text-sm text-text-muted">Выберите начало и конец периода.</p>
      ) : view === 'journal' ? (
        receipts.loading ? <div className="flex justify-center py-8"><Spinner /></div>
          : receipts.error ? <ErrorState error={receipts.error} onRetry={receipts.reload} />
            : grouped.groups.length === 0 ? (
              <div className="bg-surface rounded-2xl border border-border p-12 text-center text-text-muted text-sm">
                Поступлений за {formatRangeLabel(range)} нет
              </div>
            ) : (
              <div className="bg-surface rounded-2xl border border-border shadow-card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-text-muted bg-surface-dim">
                      <th className="px-3 py-2 font-medium">Дата поступления</th>
                      <th className="px-3 py-2 font-medium">Позиция</th>
                      <th className="px-3 py-2 font-medium text-right">Количество</th>
                      {canSeeFinance && <th className="px-3 py-2 font-medium text-right">Сумма</th>}
                      {canSeeFinance && <th className="px-3 py-2 font-medium text-right">Цена за ед.</th>}
                      <th className="px-3 py-2 font-medium">Поставщик</th>
                      <th className="px-3 py-2 font-medium">№ документа</th>
                      <th className="px-3 py-2 font-medium">Кто внёс</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped.groups.map((g) => {
                      const isCollapsed = collapsed.has(g.key)
                      return (
                        <Fragment key={g.key}>
                          <tr className="bg-surface-2/60 border-b border-border">
                            <td colSpan={2} className="px-3 py-2 font-semibold">
                              <button type="button" onClick={() => toggle(setCollapsed, g.key)} className="text-left">
                                {isCollapsed ? '▸' : '▾'} {g.name}
                                <span className="ml-2 text-xs font-normal text-text-muted">
                                  {g.count} пост. · последнее {formatDate(g.lastDate)}
                                </span>
                              </button>
                            </td>
                            <td className="px-3 py-2 text-right font-semibold"><Qty value={g.qty} unit={g.unit} mixed={g.mixedUnits} /></td>
                            {canSeeFinance && <td className="px-3 py-2 text-right font-semibold tabular-nums">{g.sum != null ? formatPrice(g.sum) : '—'}</td>}
                            {canSeeFinance && <td />}
                            <td colSpan={3} />
                          </tr>
                          {!isCollapsed && [...g.rows].sort(compareMovementsDesc).map((r) => (
                            <tr key={r.id} className="border-b border-border last:border-0">
                              <td className="px-3 py-2 whitespace-nowrap">
                                {formatDate(r.op_date)}
                                {r.kind === 'opening' && <span className="block text-[11px] text-info">начальный остаток</span>}
                              </td>
                              <td className="px-3 py-2">{r.material_name}</td>
                              <td className="px-3 py-2 text-right"><Qty value={r.delta} unit={r.unit} /></td>
                              {canSeeFinance && <td className="px-3 py-2 text-right tabular-nums">{r.total_cost != null ? formatPrice(r.total_cost) : '—'}</td>}
                              {canSeeFinance && <td className="px-3 py-2 text-right tabular-nums">{r.unit_cost != null ? formatPrice(r.unit_cost) : '—'}</td>}
                              <td className="px-3 py-2 text-text-muted">{r.supplier || '—'}</td>
                              <td className="px-3 py-2 text-text-muted">{r.doc_number || '—'}</td>
                              <td className="px-3 py-2 text-text-muted">
                                {r.created_by_name || '—'}
                                {enteredOnOtherDay(r) && (
                                  <span className="block text-[11px]">внесено {formatDate(r.created_at)}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-surface-dim font-semibold">
                      <td colSpan={3} className="px-3 py-2">Итого: {formatQty(grouped.total.count, 0)} пост.</td>
                      {canSeeFinance && <td className="px-3 py-2 text-right tabular-nums">{grouped.total.sum != null ? formatPrice(grouped.total.sum) : '—'}</td>}
                      {canSeeFinance && <td />}
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
      ) : (
        turnover.loading ? <div className="flex justify-center py-8"><Spinner /></div>
          : turnover.error ? <ErrorState error={turnover.error} onRetry={turnover.reload} />
            : (
              <div className="space-y-2">
                {unbalanced > 0 && (
                  <p role="alert" className="text-sm text-danger">
                    У {unbalanced} позиций не сходится равенство остатков — сообщите администратору.
                  </p>
                )}
                <div className="bg-surface rounded-2xl border border-border shadow-card overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-text-muted bg-surface-dim">
                        <th className="px-3 py-2 font-medium">Категория / позиция</th>
                        <th className="px-3 py-2 font-medium text-right">Остаток на начало</th>
                        <th className="px-3 py-2 font-medium text-right">Поступило</th>
                        <th className="px-3 py-2 font-medium text-right">Списано на заказы</th>
                        <th className="px-3 py-2 font-medium text-right">Расход вручную</th>
                        <th className="px-3 py-2 font-medium text-right">Инвентаризация, ±</th>
                        <th className="px-3 py-2 font-medium text-right">Возвраты и корр., ±</th>
                        <th className="px-3 py-2 font-medium text-right">Остаток на конец</th>
                        <th className="px-3 py-2 font-medium text-right">Поставок</th>
                        <th className="px-3 py-2 font-medium">Последнее поступление</th>
                        {canSeeFinance && <th className="px-3 py-2 font-medium text-right">Закуплено, ₽</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {turnoverGroups.map((g) => {
                        const open = expanded.has(g.key)
                        const t = g.totals
                        const catClick = (kinds) => () => openJournal({ categoryId: g.category_id, kinds })
                        return (
                          <Fragment key={g.key}>
                            <tr className="bg-surface-2/60 border-b border-border font-semibold">
                              <td className="px-3 py-2">
                                <button type="button" onClick={() => toggle(setExpanded, g.key)} className="text-left">
                                  {open ? '▾' : '▸'} {g.name}
                                  {g.mixedUnits && <span className="ml-2 text-xs font-normal text-text-muted">разные единицы</span>}
                                </button>
                              </td>
                              <NumCell value={t.opening} unit={g.unit} mixed={g.mixedUnits} />
                              <NumCell value={t.purchased} unit={g.unit} mixed={g.mixedUnits} onClick={catClick(['purchase'])} />
                              <NumCell value={t.order_consumption} unit={g.unit} mixed={g.mixedUnits} onClick={catClick(['order_consumption'])} />
                              <NumCell value={t.manual_consumption} unit={g.unit} mixed={g.mixedUnits} onClick={catClick(['manual_consumption'])} />
                              <NumCell value={t.inventory} unit={g.unit} mixed={g.mixedUnits} onClick={catClick(['inventory'])} />
                              <NumCell value={t.corrections} unit={g.unit} mixed={g.mixedUnits} onClick={catClick(['correction', 'opening'])} />
                              <NumCell value={t.closing} unit={g.unit} mixed={g.mixedUnits} />
                              <td className="px-3 py-2 text-right tabular-nums">{t.purchase_count}</td>
                              <td className="px-3 py-2 whitespace-nowrap">{t.last_purchase_date ? formatDate(t.last_purchase_date) : '—'}</td>
                              {canSeeFinance && <td className="px-3 py-2 text-right tabular-nums">{t.purchase_sum != null ? formatPrice(t.purchase_sum) : '—'}</td>}
                            </tr>
                            {open && g.rows.map((r) => {
                              const click = (kinds) => () => openJournal({ materialId: r.material_id, kinds })
                              const ok = isTurnoverBalanced(r)
                              return (
                                <tr key={r.material_id} className={`border-b border-border last:border-0 ${ok ? '' : 'bg-danger/10'}`}>
                                  <td className="px-3 py-2 pl-7">
                                    {r.material_name}
                                    {r.archived && <span className="ml-1 text-[10px] text-text-muted">(архив)</span>}
                                  </td>
                                  <NumCell value={r.opening} unit={r.unit} />
                                  <NumCell value={r.purchased} unit={r.unit} onClick={click(['purchase'])} />
                                  <NumCell value={r.order_consumption} unit={r.unit} onClick={click(['order_consumption'])} />
                                  <NumCell value={r.manual_consumption} unit={r.unit} onClick={click(['manual_consumption'])} />
                                  <NumCell value={r.inventory} unit={r.unit} onClick={click(['inventory'])} />
                                  <NumCell value={r.corrections} unit={r.unit} onClick={click(['correction', 'opening'])} />
                                  <NumCell value={r.closing} unit={r.unit} onClick={click([])} />
                                  <td className="px-3 py-2 text-right tabular-nums">{r.purchase_count}</td>
                                  <td className="px-3 py-2 whitespace-nowrap">{r.last_purchase_date ? formatDate(r.last_purchase_date) : '—'}</td>
                                  {canSeeFinance && <td className="px-3 py-2 text-right tabular-nums">{r.purchase_sum != null ? formatPrice(r.purchase_sum) : '—'}</td>}
                                </tr>
                              )
                            })}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
      )}
    </div>
  )
}
