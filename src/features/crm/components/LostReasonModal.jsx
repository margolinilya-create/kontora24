import { useEffect, useState } from 'react'
import Modal from '@/shared/components/Modal'
import Button from '@/shared/components/Button'

/**
 * R28.1 — причина проигрыша (обязательна при переносе на этап kind='lost').
 * onConfirm({ lostReasonId, lostComment })
 */
export function LostReasonModal({ isOpen, onClose, reasons, onConfirm, saving = false }) {
  const [reasonId, setReasonId] = useState('')
  const [comment, setComment] = useState('')

  useEffect(() => {
    if (isOpen) {
      setReasonId('')
      setComment('')
    }
  }, [isOpen])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Почему сделка проиграна?">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Причина">
          {reasons.map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={reasonId === r.id}
              onClick={() => setReasonId(r.id)}
              className={`px-3 py-2 min-h-[40px] rounded-xl text-sm border ${
                reasonId === r.id ? 'border-accent bg-accent/10 text-text' : 'border-border text-text-muted hover:text-text'
              }`}
            >
              {r.name}
            </button>
          ))}
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          placeholder="Комментарий (необязательно)"
          aria-label="Комментарий"
          className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent/60"
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button
            variant="danger"
            disabled={!reasonId}
            loading={saving}
            onClick={() => onConfirm({ lostReasonId: reasonId, lostComment: comment })}
          >
            Проиграна
          </Button>
        </div>
      </div>
    </Modal>
  )
}
