import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useReprintSubtask } from '../hooks/useReprintSubtask'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { SubtaskRouteChain } from '../components/SubtaskRouteChain'
import { SubtaskLogForm } from '../components/logs/SubtaskLogForm'
import { computeSubtaskOverallProgress } from '../lib/production-logs'
import {
  REPRINT_STATUS_LABELS, REPRINT_REASONS, ORDER_TYPES, FILM_TYPES, reprintViewLabel,
} from '@/shared/constants'
import { formatOrderNumber } from '@/shared/lib/utils'
import { DryingTimer } from '@/features/orders/components/DryingTimer'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import Spinner from '@/shared/components/Spinner'
import ErrorState from '@/shared/components/ErrorState'
import Button from '@/shared/components/Button'
import ConfirmDialog from '@/shared/components/ConfirmDialog'

export default function SubtaskDetailPage() {
  const { subtaskId } = useParams()
  const navigate = useNavigate()
  const { hasRole } = useAuth()
  const canManage = hasRole(['admin', 'manager'])
  const { subtask, order, logs, loading, error, refetch, addLogAndAdvance, forceAdvance, deleteSubtask } = useReprintSubtask(subtaskId)
  const [savedFlash, setSavedFlash] = useState(false)
  const [pendingForce, setPendingForce] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(false)
  const [busy, setBusy] = useState(false)

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
  const viewLabel = reprintViewLabel(order.order_type, subtask.view_ref)

  async function handleSubmit(stage, data) {
    const res = await addLogAndAdvance(stage, data)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1500)
    return res
  }

  async function confirmForce() {
    setPendingForce(false)
    setBusy(true)
    try {
      const res = await forceAdvance()
      toast.success(res?.done ? 'Допечатка завершена' : `Этап завершён → ${REPRINT_STATUS_LABELS[res?.new_status] || res?.new_status}`)
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    setPendingDelete(false)
    setBusy(true)
    try {
      await deleteSubtask()
      toast.success('Допечатка удалена')
      navigate(`/orders/${order.id}`)
    } catch (err) {
      toast.error(translateError(err).message)
      setBusy(false)
    }
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
              {viewLabel && (
                <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-accent/10 text-accent">{viewLabel}</span>
              )}
              <h1 className="text-xl font-bold font-display truncate">{subtask.title}</h1>
            </div>
            <p className="text-text-muted text-sm mt-1">
              Заказ <Link to={`/orders/${order.id}`} className="text-accent underline">#{num}</Link>
              {order.client?.name ? ` · ${order.client.name}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-sm px-2.5 py-1 rounded-lg font-medium ${
              isDone ? 'bg-success/15 text-success' : 'bg-accent/15 text-accent'
            }`}>
              {REPRINT_STATUS_LABELS[subtask.status] || subtask.status}
            </span>
            {canManage && !isDone && (
              <button
                type="button"
                onClick={() => setPendingDelete(true)}
                disabled={busy}
                className="text-xs text-text-muted hover:text-danger px-2 py-1 rounded hover:bg-danger/10 transition-colors disabled:opacity-50"
                title="Удалить допечатку"
              >
                Удалить
              </button>
            )}
          </div>
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
          {/* R23.5: таймер 36ч на сушке допечатки (drying_started_at ставит триггер 044). */}
          {subtask.status === 'drying' && (
            <div className="mb-4">
              <DryingTimer startedAt={subtask.drying_started_at} />
            </div>
          )}
          {isDone ? (
            <p className="text-sm text-text-muted">Допечатка завершена. Учёт закрыт.</p>
          ) : (
            <>
              <SubtaskLogForm stage={subtask.status} subtask={subtask} order={order} logs={logs} onSubmit={handleSubmit} />
              {/* R23.5: досрочный переход (менеджер/админ) — минует количественную сверку. */}
              {canManage && (
                <div className="mt-4 pt-4 border-t border-border">
                  <Button variant="secondary" size="sm" onClick={() => setPendingForce(true)} loading={busy} className="w-full">
                    Перейти на следующий этап →
                  </Button>
                  <p className="text-[11px] text-text-muted mt-1.5">
                    Досрочный переход без ожидания количества (только руководитель).
                  </p>
                </div>
              )}
            </>
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

      <ConfirmDialog
        isOpen={pendingForce}
        onClose={() => setPendingForce(false)}
        onConfirm={confirmForce}
        title="Перейти на следующий этап?"
        message={`Допечатка перейдёт на следующий этап маршрута без проверки внесённого количества (этап «${REPRINT_STATUS_LABELS[subtask.status] || subtask.status}»).`}
        confirmText="Перейти"
        variant="primary"
      />
      <ConfirmDialog
        isOpen={pendingDelete}
        onClose={() => setPendingDelete(false)}
        onConfirm={confirmDelete}
        title="Удалить допечатку?"
        message={`«${subtask.title}» будет удалена. Доступно, только пока по допечатке нет внесённых данных.`}
        confirmText="Удалить"
        variant="danger"
      />
    </div>
  )
}
