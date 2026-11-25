import { useEffect, useRef, useState } from 'react'
import Modal from '@/shared/components/Modal'
import Input from '@/shared/components/Input'
import Button from '@/shared/components/Button'
import { ORDER_SOURCES } from '@/shared/constants'
import { useProfiles } from '@/features/orders/hooks/useOrders'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { captureError } from '@/shared/lib/sentry'
import { createCompany, updateCompany } from '../lib/crm-api'
import { DuplicateWarning } from './DuplicateWarning'

const EMPTY = { name: '', kind: 'company', inn: '', website: '', phone: '', email: '', comment: '', source: '', owner_id: '' }

const SELECT_CLS = 'w-full rounded-xl border border-border px-3.5 py-2.5 text-sm bg-surface text-text min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent/60'

/**
 * R28.0 — создание/редактирование клиента (компания или физлицо). company=null → создание.
 */
export function CompanyFormModal({ isOpen, onClose, company = null, onSaved }) {
  const [values, setValues] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState(null)
  const { profiles } = useProfiles()

  // Инициализация только при открытии / смене записи: новый объект company
  // после refetch-on-focus не должен стирать ввод.
  const companyRef = useRef(company)
  useEffect(() => { companyRef.current = company })
  const companyId = company?.id ?? null

  useEffect(() => {
    if (!isOpen) return
    const c = companyRef.current
    setNameError(null)
    setValues(c ? Object.fromEntries(Object.keys(EMPTY).map((k) => [k, c[k] ?? EMPTY[k]])) : EMPTY)
  }, [isOpen, companyId])

  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!values.name.trim()) {
      setNameError('Укажите название')
      return
    }
    setSaving(true)
    try {
      const saved = company ? await updateCompany(company.id, values) : await createCompany(values)
      toast.success(company ? 'Клиент сохранён' : 'Клиент создан')
      onSaved?.(saved)
      onClose()
    } catch (err) {
      captureError(err, { tags: { source: 'crm.CompanyFormModal.submit' } })
      toast.error(translateError(err).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={company ? 'Редактировать клиента' : 'Новый клиент'} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="inline-flex gap-1 bg-surface-2 rounded-xl p-1" role="radiogroup" aria-label="Тип клиента">
          {[['company', 'Компания'], ['person', 'Физлицо']].map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={values.kind === k}
              onClick={() => setValues((v) => ({ ...v, kind: k }))}
              className={`px-3.5 py-1.5 min-h-[40px] rounded-lg text-sm font-medium ${
                values.kind === k ? 'bg-accent text-on-accent' : 'text-text-muted hover:text-text'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <Input
          label={values.kind === 'person' ? 'ФИО *' : 'Название *'}
          value={values.name}
          onChange={(e) => { setNameError(null); set('name')(e) }}
          error={nameError}
          autoFocus
        />
        {values.kind === 'company' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="ИНН" value={values.inn || ''} onChange={set('inn')} inputMode="numeric" />
            <Input label="Сайт" value={values.website || ''} onChange={set('website')} placeholder="kontora.su" />
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Общий телефон" value={values.phone || ''} onChange={set('phone')} inputMode="tel" />
          <Input label="Общий email" value={values.email || ''} onChange={set('email')} inputMode="email" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="block font-medium mb-1.5">Источник</span>
            <select value={values.source || ''} onChange={set('source')} className={SELECT_CLS}>
              <option value="">Не указан</option>
              {Object.entries(ORDER_SOURCES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="block font-medium mb-1.5">Ответственный</span>
            <select value={values.owner_id || ''} onChange={set('owner_id')} className={SELECT_CLS}>
              <option value="">Не назначен</option>
              {profiles
                .filter((p) => p.role === 'admin' || p.role === 'manager')
                .map((p) => <option key={p.id} value={p.id}>{p.display_name || 'Без имени'}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-sm">
          <span className="block font-medium mb-1.5">Комментарий</span>
          <textarea
            value={values.comment || ''}
            onChange={set('comment')}
            rows={3}
            className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent/60"
          />
        </label>

        <DuplicateWarning
          companyName={values.name}
          inn={values.kind === 'company' ? values.inn || '' : ''}
          excludeCompanyId={company?.id || null}
          onNavigate={onClose}
        />

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit" loading={saving}>{company ? 'Сохранить' : 'Создать'}</Button>
        </div>
      </form>
    </Modal>
  )
}
