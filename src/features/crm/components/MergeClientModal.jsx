import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '@/shared/components/Modal'
import Button from '@/shared/components/Button'
import { ClientCombobox } from '@/features/clients/components/ClientCombobox'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { captureError } from '@/shared/lib/sentry'
import { mergeClients } from '../lib/crm-ops'

/**
 * R28.3 — объединить текущего клиента с дублем. Выбирается основной;
 * заказы, контакты, сделки, заметки и задачи переходят к нему, второй
 * уходит в архив с пометкой «объединён».
 */
export function MergeClientModal({ isOpen, onClose, company, onMerged }) {
  const navigate = useNavigate()
  const [other, setOther] = useState(null)
  const [keepCurrent, setKeepCurrent] = useState(true)
  const [saving, setSaving] = useState(false)

  const keep = keepCurrent ? company : other
  const drop = keepCurrent ? other : company

  async function run() {
    if (!other) return
    setSaving(true)
    try {
      const res = await mergeClients(keep.id, drop.id)
      toast.success(`Объединено: заказов ${res?.orders ?? 0}, контактов ${res?.contacts ?? 0}, сделок ${res?.deals ?? 0}`)
      onClose()
      if (keep.id === company.id) onMerged?.()
      else navigate(`/crm/clients/${keep.id}`, { replace: true })
    } catch (err) {
      captureError(err, { tags: { source: 'crm.MergeClientModal' } })
      toast.error(translateError(err).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Объединить с дублем" maxWidth="max-w-lg">
      <div className="space-y-4">
        <div>
          <span className="block text-sm font-medium mb-1.5">Дубль клиента «{company.name}»</span>
          <ClientCombobox currentClient={other} onChange={(_id, c) => setOther(c && c.id !== company.id ? c : null)} placeholder="Найдите второго клиента" />
        </div>
        {other && (
          <>
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium mb-1">Кто остаётся основным?</legend>
              {[[true, company.name], [false, other.name]].map(([val, name]) => (
                <label key={String(val)} className="flex items-center gap-2 text-sm min-h-[40px]">
                  <input type="radio" name="keep" checked={keepCurrent === val} onChange={() => setKeepCurrent(val)} />
                  {name}
                </label>
              ))}
            </fieldset>
            <p className="text-sm text-text-muted rounded-xl bg-surface-2 p-3">
              Все заказы, контакты, сделки, заметки и задачи «{drop.name}» перейдут к «{keep.name}». Пустые поля
              основного заполнятся из второго. «{drop.name}» уйдёт в архив с пометкой «объединён» — данные не удаляются.
              Смена клиента у заказов попадёт в их журнал изменений.
            </p>
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button variant="danger" disabled={!other} loading={saving} onClick={run}>Объединить</Button>
        </div>
      </div>
    </Modal>
  )
}
