import { useState } from 'react'
import Modal from '@/shared/components/Modal'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'
import { REPRINT_STATUS_LABELS } from '@/shared/constants'
import { getReprintRollbackTargets } from '../lib/production-logs'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'

const stageLabel = (s) => REPRINT_STATUS_LABELS[s] || s

/**
 * R25.3 (ТЗ Фаза 3.2) — «Вернуть на этап…» для допечатки.
 * Список — только пройденные этапы снимка маршрута subtask.route. Подтверждение
 * с необязательным комментарием (пишется в аудит заказа). Внесённые данные учёта
 * сохраняются.
 *
 * @param {object} props
 * @param {object|null} props.subtask — { id, title, status, route } | null (закрыт)
 * @param {(target:string, comment:string) => Promise<any>} props.onConfirm
 * @param {() => void} props.onClose
 */
export function ReprintRollbackDialog({ subtask, onConfirm, onClose }) {
  if (!subtask) return null
  // key — сбрасываем состояние формы при открытии для другой допечатки/этапа.
  return <DialogBody key={`${subtask.id}:${subtask.status}`} subtask={subtask} onConfirm={onConfirm} onClose={onClose} />
}

function DialogBody({ subtask, onConfirm, onClose }) {
  const targets = getReprintRollbackTargets(subtask)
  const [target, setTarget] = useState(targets[targets.length - 1] || '')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const title = subtask.title || 'Допечатка'

  async function handleConfirm() {
    if (!target) return
    setBusy(true)
    try {
      const res = await onConfirm(target, comment)
      toast.success(res?.reopened
        ? `Допечатка снова в работе: «${stageLabel(target)}»`
        : `Допечатка возвращена на «${stageLabel(target)}»`)
      onClose()
    } catch (err) {
      toast.error(translateError(err).message)
      setBusy(false)
    }
  }

  return (
    <Modal isOpen onClose={busy ? () => {} : onClose} title="Вернуть на этап" maxWidth="max-w-sm">
      {targets.length === 0 ? (
        <>
          <p className="text-sm text-text-muted mb-6">Допечатка на первом этапе — возвращать некуда.</p>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>Закрыть</Button>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor="reprint-rollback-target" className="block text-sm font-medium text-text mb-1">Этап</label>
            <select
              id="reprint-rollback-target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent/50 min-h-[44px]"
            >
              {targets.map((s) => <option key={s} value={s}>{stageLabel(s)}</option>)}
            </select>
          </div>
          <p className="text-sm text-text-muted">
            Вернуть «{title}» с этапа «{stageLabel(subtask.status)}» на «{stageLabel(target)}»?
            Внесённые данные сохранятся.
            {subtask.status === 'done' && ' Завершённая допечатка откроется заново — заказ не выйдет с ТК, пока она не завершится.'}
          </p>
          <Input
            id="reprint-rollback-comment"
            label="Комментарий"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Необязательно"
            maxLength={500}
          />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={onClose} disabled={busy}>Отмена</Button>
            <Button variant="primary" onClick={handleConfirm} loading={busy} disabled={!target}>Вернуть</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
