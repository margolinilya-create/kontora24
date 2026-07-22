import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useReprintSubtask } from '../hooks/useReprintSubtask'
import { SubtaskRouteChain } from '../components/SubtaskRouteChain'
import { SubtaskLogForm } from '../components/logs/SubtaskLogForm'
import { computeSubtaskOverallProgress } from '../lib/production-logs'
import {
  REPRINT_STATUS_LABELS, REPRINT_REASONS, ORDER_TYPES, FILM_TYPES,
} from '@/shared/constants'
import { formatOrderNumber } from '@/shared/lib/utils'
import Spinner from '@/shared/components/Spinner'
import ErrorState from '@/shared/components/ErrorState'

export default function SubtaskDetailPage() {
  const { subtaskId } = useParams()
  const { subtask, order, logs, loading, error, refetch, addLogAndAdvance } = useReprintSubtask(subtaskId)
  const [savedFlash, setSavedFlash] = useState(false)

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>
  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (!subtask || !order) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-2">Допечатка не найдена</h2>
        <Link to="/orders" className="text-accent underline">← К заказам</Link>
      </div>
    )
  }

  const num = formatOrderNumber(order)
  const isDone = subtask.status === 'done'
  const overall = computeSubtaskOverallProgress(subtask, logs)
  const filmName = order.film_material?.name || FILM_TYPES[order.film_type]?.label || order.film_type

  async function handleSubmit(stage, data) {
    const res = await addLogAndAdvance(stage, data)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1500)
    return res
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <Link to={`/orders/${order.id}`} className="text-text-muted hover:text-text transition-colors text-sm inline-block">
        ← К заказу #{num}
      </Link>

      {/* Шапка */}
      <div className="bg-surface rounded-xl border border-border p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-warning/15 text-warning">Допечатка</span>
              <h1 className="text-xl font-bold font-display truncate">{subtask.title}</h1>
            </div>
            <p className="text-text-muted text-sm mt-1">
              Заказ <Link to={`/orders/${order.id}`} className="text-accent underline">#{num}</Link>
              {order.client?.name ? ` · ${order.client.name}` : ''}
            </p>
          </div>
          <span className={`text-sm px-2.5 py-1 rounded-lg font-medium shrink-0 ${
            isDone ? 'bg-success/15 text-success' : 'bg-accent/15 text-accent'
          }`}>
            {REPRINT_STATUS_LABELS[subtask.status] || subtask.status}
          </span>
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
          <div><dt className="text-text-muted text-xs">Изделие</dt><dd>{ORDER_TYPES[order.order_type]?.label || order.order_type}</dd></div>
          <div><dt className="text-text-muted text-xs">Размер</dt><dd>{order.width_mm}×{order.height_mm} мм</dd></div>
          <div><dt className="text-text-muted text-xs">Материал</dt><dd>{filmName || '—'}</dd></div>
          <div><dt className="text-text-muted text-xs">Тираж допечатки</dt><dd>{subtask.qty} шт</dd></div>
          {subtask.reason && <div><dt className="text-text-muted text-xs">Причина</dt><dd>{REPRINT_REASONS[subtask.reason]}</dd></div>}
          {order.deadline && <div><dt className="text-text-muted text-xs">Срок</dt><dd>{new Date(order.deadline).toLocaleDateString('ru-RU')}</dd></div>}
        </dl>

        {subtask.comment && <p className="text-sm text-text-muted border-t border-border pt-2">{subtask.comment}</p>}

        {/* Общий прогресс */}
        <div>
          <div className="flex items-center justify-between text-xs text-text-muted mb-1">
            <span>Общий прогресс</span>
            <span>{overall.percentage}%</span>
          </div>
          <div className="h-2 bg-surface-dim rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${isDone ? 'bg-success' : 'bg-accent'}`} style={{ width: `${Math.min(100, overall.percentage)}%` }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Маршрут */}
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4">Маршрут допечатки</h2>
          <SubtaskRouteChain subtask={subtask} logs={logs} />
        </div>

        {/* Форма учёта */}
        <div className="bg-surface rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Учёт: {REPRINT_STATUS_LABELS[subtask.status] || subtask.status}</h2>
            {savedFlash && <span className="text-xs text-success">✓ Сохранено</span>}
          </div>
          {isDone ? (
            <p className="text-sm text-text-muted">Допечатка завершена. Учёт закрыт.</p>
          ) : (
            <SubtaskLogForm stage={subtask.status} subtask={subtask} order={order} logs={logs} onSubmit={handleSubmit} />
          )}
        </div>
      </div>

      {/* История логов */}
      {logs.length > 0 && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-3">История учёта</h2>
          <div className="space-y-2">
            {logs.map((l) => (
              <div key={l.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                <span>{REPRINT_STATUS_LABELS[l.stage] || l.stage}{l.worker?.display_name ? ` · ${l.worker.display_name}` : ''}</span>
                <span className="text-xs text-text-muted">{new Date(l.created_at).toLocaleString('ru-RU')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
