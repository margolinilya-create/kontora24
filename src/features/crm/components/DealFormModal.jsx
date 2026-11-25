import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from '@/shared/components/Modal'
import Input from '@/shared/components/Input'
import Button from '@/shared/components/Button'
import { ClientCombobox } from '@/features/clients/components/ClientCombobox'
import { ORDER_SOURCES } from '@/shared/constants'
import { useProfiles } from '@/features/orders/hooks/useOrders'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { captureError } from '@/shared/lib/sentry'
import { createDeal, updateDeal } from '../lib/deals-api'
import { listContacts } from '../lib/crm-api'
import { activeStages } from '../lib/deals'
import { contactFullName } from '../lib/client-metrics'

const SELECT_CLS = 'w-full rounded-xl border border-border px-3.5 py-2.5 text-sm bg-surface text-text min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent/60'

const EMPTY = { title: '', amount: '', expected_close: '', source: '', owner_id: '', notes: '', contact_id: '' }

/**
 * R28.1 — создание/редактирование сделки.
 * deal=null → создание (этап — defaultStageId или первый открытый выбранной воронки).
 * Этап существующей сделки здесь не меняется — только доской / кнопками этапов.
 */
export function DealFormModal({ isOpen, onClose, deal = null, pipelines, defaultPipelineId, defaultStageId, defaultClient = null, onSaved }) {
  const [values, setValues] = useState(EMPTY)
  const [pipelineId, setPipelineId] = useState('')
  const [stageId, setStageId] = useState('')
  const [client, setClient] = useState(null)
  const [contacts, setContacts] = useState([])
  const [saving, setSaving] = useState(false)
  const [titleError, setTitleError] = useState(null)
  const { profiles } = useProfiles()

  // Инициализация только при открытии / смене сделки: новые объекты пропсов
  // после refetch-on-focus не должны стирать ввод.
  const initRef = useRef({ deal, defaultPipelineId, defaultStageId, defaultClient, pipelines })
  useEffect(() => { initRef.current = { deal, defaultPipelineId, defaultStageId, defaultClient, pipelines } })
  const dealId = deal?.id ?? null

  useEffect(() => {
    if (!isOpen) return
    const { deal, defaultPipelineId, defaultStageId, defaultClient, pipelines } = initRef.current
    setTitleError(null)
    if (deal) {
      setValues({
        title: deal.title || '',
        amount: deal.amount ?? '',
        expected_close: deal.expected_close || '',
        source: deal.source || '',
        owner_id: deal.owner_id || '',
        notes: deal.notes || '',
        contact_id: deal.contact_id || '',
      })
      setPipelineId(deal.pipeline_id)
      setStageId(deal.stage_id)
      setClient(deal.client || null)
    } else {
      const pid = defaultPipelineId || pipelines?.find((p) => p.is_default)?.id || pipelines?.[0]?.id || ''
      const firstOpen = activeStages(pipelines?.find((p) => p.id === pid)?.stages).find((s) => s.kind === 'open')
      setValues(EMPTY)
      setPipelineId(pid)
      setStageId(defaultStageId || firstOpen?.id || '')
      setClient(defaultClient)
    }
  }, [isOpen, dealId])

  // Контакты выбранного клиента — для поля «Контактное лицо».
  const clientId = client?.id ?? null
  useEffect(() => {
    if (!isOpen || !clientId) {
      setContacts([])
      return undefined
    }
    let cancelled = false
    listContacts({ clientId })
      .then((res) => { if (!cancelled) setContacts(res.rows) })
      .catch((err) => captureError(err, { tags: { source: 'crm.DealFormModal.contacts' } }))
    return () => { cancelled = true }
  }, [isOpen, clientId])

  const stages = useMemo(
    () => activeStages(pipelines?.find((p) => p.id === pipelineId)?.stages).filter((s) => s.kind === 'open'),
    [pipelines, pipelineId],
  )
  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }))

  function changePipeline(pid) {
    setPipelineId(pid)
    const first = activeStages(pipelines.find((p) => p.id === pid)?.stages).find((s) => s.kind === 'open')
    setStageId(first?.id || '')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!values.title.trim()) {
      setTitleError('Укажите название сделки')
      return
    }
    if (!deal && !stageId) {
      toast.error('В воронке нет открытых этапов — настройте её в «Настройки → CRM»')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...values,
        pipeline_id: pipelineId,
        stage_id: stageId,
        client_id: clientId,
        contact_id: clientId ? values.contact_id || null : null,
      }
      if (deal) {
        await updateDeal(deal.id, payload)
        toast.success('Сделка сохранена')
        onSaved?.(deal)
      } else {
        const created = await createDeal(payload)
        toast.success(`Сделка № ${created.number} создана`)
        onSaved?.(created)
      }
      onClose()
    } catch (err) {
      captureError(err, { tags: { source: 'crm.DealFormModal.submit' } })
      toast.error(translateError(err).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={deal ? `Сделка № ${deal.number}` : 'Новая сделка'} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input
          label="Название *"
          value={values.title}
          onChange={(e) => { setTitleError(null); set('title')(e) }}
          error={titleError}
          placeholder="Например: 3D-стикеры для кофейни"
          autoFocus
        />

        {!deal && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pipelines?.filter((p) => !p.archived_at).length > 1 && (
              <label className="block text-sm">
                <span className="block font-medium mb-1.5">Воронка</span>
                <select value={pipelineId} onChange={(e) => changePipeline(e.target.value)} className={SELECT_CLS}>
                  {pipelines.filter((p) => !p.archived_at).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            )}
            <label className="block text-sm">
              <span className="block font-medium mb-1.5">Этап</span>
              <select value={stageId} onChange={(e) => setStageId(e.target.value)} className={SELECT_CLS}>
                {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>
        )}

        <div>
          <span className="block text-sm font-medium mb-1.5">Клиент</span>
          <ClientCombobox
            currentClient={client}
            onChange={(_id, c) => { setClient(c); setValues((v) => ({ ...v, contact_id: '' })) }}
            placeholder="Не выбран"
          />
        </div>
        {clientId && contacts.length > 0 && (
          <label className="block text-sm">
            <span className="block font-medium mb-1.5">Контактное лицо</span>
            <select value={values.contact_id} onChange={set('contact_id')} className={SELECT_CLS}>
              <option value="">Не выбрано</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{contactFullName(c)}</option>)}
            </select>
          </label>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Сумма, ₽" type="number" min="0" step="1" inputMode="decimal" value={values.amount} onChange={set('amount')} />
          <Input label="Ожидаемое закрытие" type="date" value={values.expected_close} onChange={set('expected_close')} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="block font-medium mb-1.5">Источник</span>
            <select value={values.source} onChange={set('source')} className={SELECT_CLS}>
              <option value="">Не указан</option>
              {Object.entries(ORDER_SOURCES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="block font-medium mb-1.5">Ответственный</span>
            <select value={values.owner_id} onChange={set('owner_id')} className={SELECT_CLS}>
              <option value="">Не назначен</option>
              {profiles
                .filter((p) => p.role === 'admin' || p.role === 'manager')
                .map((p) => <option key={p.id} value={p.id}>{p.display_name || 'Без имени'}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-sm">
          <span className="block font-medium mb-1.5">Описание</span>
          <textarea
            value={values.notes}
            onChange={set('notes')}
            rows={3}
            className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent/60"
          />
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit" loading={saving}>{deal ? 'Сохранить' : 'Создать'}</Button>
        </div>
      </form>
    </Modal>
  )
}
