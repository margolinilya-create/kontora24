import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'
import { formatDateTime } from '@/shared/lib/utils'
import Spinner from '@/shared/components/Spinner'
import ErrorState from '@/shared/components/ErrorState'

const FILTER_OPTIONS = [
  { value: 'all', label: 'Все операции' },
  { value: 'manual', label: 'Только ручные' },
  { value: 'auto', label: 'Автоматические (производство)' },
]

const PAGE_SIZE = 100

/**
 * Глобальная история операций по складу: все записи k24_material_transactions
 * (приход, расход, авто-списание из заказов). Фильтры: ручные / авто.
 */
export function TransactionsHistory() {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')
  const [hasMore, setHasMore] = useState(false)

  const loadPage = async (offset = 0, append = false) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('k24_material_transactions')
        .select('*, material:k24_materials(name, type), created_by_profile:k24_profiles!created_by(display_name), order:k24_orders(number)')
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)
      if (err) throw err
      const rows = data || []
      setHasMore(rows.length === PAGE_SIZE)
      setTransactions((prev) => append ? [...prev, ...rows] : rows)
    } catch (err) {
      captureError(err, { tags: { source: 'TransactionsHistory.fetch' } })
      setError(err)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => { loadPage(0, false) }, [])

  const filtered = transactions.filter((t) => {
    if (filter === 'manual') return !t.reason?.startsWith('auto_')
    if (filter === 'auto') return t.reason?.startsWith('auto_')
    return true
  })

  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>
  if (error) return <ErrorState error={error} onRetry={() => loadPage(0, false)} />

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          {FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="text-xs text-text-muted">{filtered.length} операций</span>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border p-12 text-center text-text-muted text-sm">
          Нет операций
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-border shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-muted bg-surface-dim/50">
                  <th className="px-4 py-2 font-medium">Дата</th>
                  <th className="px-4 py-2 font-medium">Материал</th>
                  <th className="px-4 py-2 font-medium text-right">Изменение</th>
                  <th className="px-4 py-2 font-medium">Причина</th>
                  <th className="px-4 py-2 font-medium">Заказ</th>
                  <th className="px-4 py-2 font-medium">Кто</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const delta = Number(t.delta)
                  const isAuto = t.reason?.startsWith('auto_')
                  return (
                    <tr key={t.id} className="border-b border-border last:border-0 hover:bg-surface-2 transition-colors">
                      <td className="px-4 py-2.5 text-text-muted whitespace-nowrap">{formatDateTime(t.created_at)}</td>
                      <td className="px-4 py-2.5 font-medium">{t.material?.name || '—'}</td>
                      <td className={`px-4 py-2.5 text-right font-medium tabular-nums ${delta >= 0 ? 'text-success' : 'text-danger'}`}>
                        {delta >= 0 ? '+' : ''}{delta.toFixed(1)}
                      </td>
                      <td className="px-4 py-2.5 text-text-muted">
                        {isAuto && <span className="text-[10px] bg-info/15 text-info px-1.5 py-0.5 rounded mr-1.5">авто</span>}
                        {t.reason || '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        {t.order?.number ? (
                          <Link to={`/orders/${t.order_id}`} className="text-text hover:text-accent underline decoration-text-muted/40">
                            #{t.order.number}
                          </Link>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-text-muted">{t.created_by_profile?.display_name || (isAuto ? 'Система' : '—')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="border-t border-border p-3 flex justify-center">
              <button
                onClick={() => loadPage(transactions.length, true)}
                disabled={loadingMore}
                className="text-sm px-4 py-2 rounded-lg border border-border hover:bg-surface-2 transition-colors disabled:opacity-50"
              >
                {loadingMore ? 'Загружаем…' : 'Показать ещё 100'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
