// R28.1 — общий сценарий переноса сделки на этап (доска + карточка сделки):
// для «проиграна» сначала спрашиваем причину, затем запрос с оптимистичной проверкой.
import { useState } from 'react'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { captureError } from '@/shared/lib/sentry'
import { moveDeal } from '../lib/deals-api'
import { needsLostReason } from '../lib/deals'

/**
 * @param {{ onOptimistic?: (deal, stage) => void, onDone: () => void }} handlers
 *   onOptimistic — мгновенно передвинуть карточку; onDone — перечитать данные
 *   (и после успеха, и после ошибки — это же откатывает оптимистичное состояние).
 */
export function useDealMove({ onOptimistic, onDone }) {
  const [pendingLost, setPendingLost] = useState(null) // { deal, stage }
  const [saving, setSaving] = useState(false)

  async function run(deal, stage, extra) {
    setSaving(true)
    onOptimistic?.(deal, stage)
    try {
      await moveDeal(deal.id, deal.stage_id, stage.id, extra)
      if (stage.kind === 'won') toast.success(`Сделка № ${deal.number} выиграна`)
    } catch (err) {
      captureError(err, { tags: { source: 'crm.useDealMove' } })
      toast.error(translateError(err).message)
    } finally {
      setSaving(false)
      setPendingLost(null)
      onDone()
    }
  }

  function requestMove(deal, stage) {
    if (needsLostReason(stage)) setPendingLost({ deal, stage })
    else run(deal, stage)
  }

  return {
    requestMove,
    saving,
    lostModal: {
      isOpen: !!pendingLost,
      onClose: () => setPendingLost(null),
      onConfirm: (extra) => pendingLost && run(pendingLost.deal, pendingLost.stage, extra),
      saving,
    },
  }
}
