import { useState, useEffect } from 'react'
import { updateMaterialOperation, fetchOperationAudit, useSupplierSuggestions } from '../hooks/useWarehouseJournal'
import {
  editableKindsForDelta, operationKindLabel, moscowDateString,
} from '../lib/warehouse-journal'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { captureError } from '@/shared/lib/sentry'
import { formatNumber, formatDateTime } from '@/shared/lib/utils'
import Modal from '@/shared/components/Modal'
import Input from '@/shared/components/Input'
import Button from '@/shared/components/Button'

const FIELD_LABELS = {
  op_date: 'Дата',
  kind: 'Вид',
  supplier: 'Поставщик',
  doc_number: '№ документа',
  reason: 'Комментарий',
}

function auditValue(field, v) {
  if (v == null || v === '') return '—'
  if (field === 'kind') return operationKindLabel(v)
  if (field === 'op_date') return v.split('-').reverse().join('.')
  return v
}

/**
 * R25.8 (ТЗ 8.2): «Уточнить» ручную операцию — дата, вид, поставщик,
 * № документа, комментарий. Количество и сумма не редактируются (ошибку в
 * количестве исправляет инвентаризация). Право warehouse:edit_operation
 * проверяет RPC; каждое изменение пишется в аудит (виден ниже).
 */
export function ClarifyOperationModal({ operation, onClose, onSaved }) {
  const today = moscowDateString()
  const [form, setForm] = useState({
    opDate: operation.op_date || today,
    kind: operation.kind,
    supplier: operation.supplier || '',
    docNumber: operation.doc_number || '',
    reason: operation.reason || '',
  })
  const [saving, setSaving] = useState(false)
  const [audit, setAudit] = useState([])
  const suppliers = useSupplierSuggestions(true)
  const kinds = editableKindsForDelta(operation.delta)

  useEffect(() => {
    let cancelled = false
    fetchOperationAudit(operation.id)
      .then((rows) => { if (!cancelled) setAudit(rows) })
      .catch((err) => captureError(err, { tags: { source: 'ClarifyOperationModal.audit' } }))
    return () => { cancelled = true }
  }, [operation.id])

  function update(k, v) { setForm((p) => ({ ...p, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.opDate || form.opDate > today) {
      toast.error('Дата операции не может быть позже сегодняшней')
      return
    }
    setSaving(true)
    try {
      await updateMaterialOperation({ id: operation.id, ...form })
      toast.success('Операция уточнена')
      onSaved?.()
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setSaving(false)
    }
  }

  const delta = Number(operation.delta)

  return (
    <Modal isOpen onClose={onClose} title="Уточнить операцию">
      <p className="text-sm text-text-muted mb-4">
        {operation.material_name}:{' '}
        <span className={`font-semibold ${delta >= 0 ? 'text-success' : 'text-danger'}`}>
          {delta > 0 ? '+' : ''}{formatNumber(delta, 3)} {operation.unit}
        </span>
        <br />
        <span className="text-xs">Количество и сумма не меняются — ошибку в количестве исправляет инвентаризация.</span>
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input
          label="Дата операции"
          id="clarify-date"
          type="date"
          value={form.opDate}
          max={today}
          onChange={(e) => update('opDate', e.target.value)}
          required
        />
        <div>
          <label htmlFor="clarify-kind" className="block text-sm font-medium text-text mb-1.5">Вид операции</label>
          <select
            id="clarify-kind"
            value={form.kind}
            onChange={(e) => update('kind', e.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm"
          >
            {!kinds.includes(form.kind) && <option value={form.kind}>{operationKindLabel(form.kind)}</option>}
            {kinds.map((k) => <option key={k} value={k}>{operationKindLabel(k)}</option>)}
          </select>
        </div>
        <Input
          label="Поставщик"
          id="clarify-supplier"
          value={form.supplier}
          onChange={(e) => update('supplier', e.target.value)}
          list="clarify-supplier-list"
          autoComplete="off"
        />
        <datalist id="clarify-supplier-list">
          {suppliers.map((s) => <option key={s} value={s} />)}
        </datalist>
        <Input
          label="№ документа"
          id="clarify-doc"
          value={form.docNumber}
          onChange={(e) => update('docNumber', e.target.value)}
          placeholder="Накладная, УПД или счёт"
        />
        <Input
          label="Комментарий"
          id="clarify-reason"
          value={form.reason}
          onChange={(e) => update('reason', e.target.value)}
        />
        <Button type="submit" loading={saving} className="w-full">Сохранить</Button>
      </form>

      {audit.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold mb-2">История уточнений</h3>
          <ul className="space-y-1.5 text-xs text-text-muted">
            {audit.map((a) => (
              <li key={a.id}>
                <span className="text-text">{FIELD_LABELS[a.field_name] || a.field_name}:</span>{' '}
                {auditValue(a.field_name, a.old_value)} → {auditValue(a.field_name, a.new_value)}
                <span className="block">{a.changed_by_profile?.display_name || '—'}, {formatDateTime(a.changed_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  )
}
