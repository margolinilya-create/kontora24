import { useState } from 'react'
import { useReprintSubtasks } from '../hooks/useReprintSubtasks'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { SubtaskCard } from '@/features/production/components/SubtaskCard'
import { ReprintRollbackDialog } from '@/features/production/components/ReprintRollbackDialog'
import { getReprintRollbackTargets } from '@/features/production/lib/production-logs'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import { REPRINT_STATUS_LABELS, SUBTASK_STATUS_LABELS, TRACK_LABELS, canCreateReprint, canRollbackReprintForOrder } from '@/shared/constants'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import Button from '@/shared/components/Button'
import Spinner from '@/shared/components/Spinner'
import ConfirmDialog from '@/shared/components/ConfirmDialog'
import { CreateReprintModal } from './CreateReprintModal'

/**
 * R22.1 (ТЗ 20.07 Фаза 1) — вкладка «Подзадачи» карточки заказа.
 * Инструмент контроля: список допечаток + создание. Ввод данных — на странице
 * подзадачи. Старая система (bg/stickers/extra_stickers) — read-only архив.
 */
export function OrderSubtasksTab({ order }) {
  const { reprints, legacy, loading, createReprint, deleteReprint, rollbackReprint } = useReprintSubtasks(order.id)
  const { hasRole } = useAuth()
  const canManage = hasRole(['admin', 'manager'])
  // R25.3: «Вернуть на этап…» — право subtask:rollback. Ревью R25 (п.15): не
  // показываем, когда родитель на ТК или дальше (RPC запрещает откат после ТК).
  const canRollback = useCanDo('subtask:rollback') && canRollbackReprintForOrder(order)
  const createAllowed = canCreateReprint(order)
  const [rollbackTarget, setRollbackTarget] = useState(null) // subtask | null
  const [showCreate, setShowCreate] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null) // subtask | null

  async function confirmDelete() {
    const st = pendingDelete
    setPendingDelete(null)
    if (!st) return
    try {
      await deleteReprint(st.id)
      toast.success('Допечатка удалена')
    } catch (err) {
      toast.error(translateError(err).message)
    }
  }

  // Итог с учётом допечаток: производство сверх тиража (может быть >100%).
  const producedExtra = reprints
    .filter((r) => r.status === 'done')
    .reduce((s, r) => s + (r.qty || 0), 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold">Подзадачи (допечатки)</h2>
          <p className="text-sm text-text-muted">
            Допечатка проходит полный маршрут от печати. Заказ нельзя завершить, пока есть незавершённые допечатки.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={!createAllowed.ok}
          title={createAllowed.ok ? undefined : createAllowed.reason}
          onClick={() => setShowCreate(true)}
        >
          + Создать допечатку
        </Button>
      </div>
      {!createAllowed.ok && (
        <p className="text-xs text-text-muted -mt-3">{createAllowed.reason}</p>
      )}

      {producedExtra > 0 && (
        <div className="bg-surface rounded-xl border border-border p-4 text-sm">
          <span className="text-text-muted">Допечатано сверх тиража: </span>
          <span className="font-medium">{producedExtra} шт</span>
          <span className="text-text-muted"> (тираж заказа {order.qty} шт)</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : reprints.length === 0 ? (
        <p className="text-sm text-text-muted">Допечаток нет.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {reprints.map((r) => (
            <SubtaskCard
              key={r.id}
              subtask={r}
              order={order}
              overall={r.overall}
              uiStatus={r.uiStatus}
              onDelete={canManage && r.status !== 'done' ? () => setPendingDelete(r) : undefined}
              onRollback={canRollback && getReprintRollbackTargets(r).length > 0 ? () => setRollbackTarget(r) : undefined}
            />
          ))}
        </div>
      )}

      {/* Архив старой системы (read-only) */}
      {legacy.length > 0 && (
        <details className="bg-surface rounded-xl border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium text-text-muted">
            Архив (старая система подзадач) — {legacy.length}
          </summary>
          <div className="mt-3 space-y-2">
            {legacy.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                <span>{TRACK_LABELS[s.track] || s.track}{s.item_idx ? ` #${s.item_idx}` : ''}</span>
                <span className="text-xs text-text-muted">{SUBTASK_STATUS_LABELS[s.status] || REPRINT_STATUS_LABELS[s.status] || s.status}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {showCreate && createAllowed.ok && (
        <CreateReprintModal order={order} createReprint={createReprint} onClose={() => setShowCreate(false)} />
      )}

      <ReprintRollbackDialog
        subtask={rollbackTarget}
        onConfirm={(target, comment) => rollbackReprint(rollbackTarget, target, comment)}
        onClose={() => setRollbackTarget(null)}
      />

      <ConfirmDialog
        isOpen={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="Удалить допечатку?"
        message={pendingDelete
          ? `«${pendingDelete.title}» будет удалена. Действие доступно только пока по допечатке нет внесённых данных.`
          : ''}
        confirmText="Удалить"
        variant="danger"
      />
    </div>
  )
}
