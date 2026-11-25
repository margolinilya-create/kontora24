import { useEffect, useRef, useState } from 'react'
import Modal from '@/shared/components/Modal'
import Input from '@/shared/components/Input'
import Button from '@/shared/components/Button'
import { ClientCombobox } from '@/features/clients/components/ClientCombobox'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { captureError } from '@/shared/lib/sentry'
import { createContact, updateContact } from '../lib/crm-api'
import { identityError } from '../lib/identity'
import { IdentityEditor } from './IdentityEditor'
import { DuplicateWarning } from './DuplicateWarning'

const EMPTY = { first_name: '', last_name: '', position: '', notes: '' }

/**
 * R28.0 — создание/редактирование контакта (человека) с каналами связи.
 * contact=null → создание; defaultClient — предвыбранная компания (из карточки).
 */
export function ContactFormModal({ isOpen, onClose, contact = null, defaultClient = null, onSaved }) {
  const [values, setValues] = useState(EMPTY)
  const [client, setClient] = useState(null)
  const [rows, setRows] = useState([])
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState(null)

  // Инициализация формы только при открытии / смене контакта. Новые объекты
  // contact/defaultClient после refetch-on-focus не должны стирать ввод.
  const initRef = useRef({ contact, defaultClient })
  useEffect(() => { initRef.current = { contact, defaultClient } })
  const contactId = contact?.id ?? null

  useEffect(() => {
    if (!isOpen) return
    const { contact, defaultClient } = initRef.current
    setNameError(null)
    if (contact) {
      setValues({
        first_name: contact.first_name || '',
        last_name: contact.last_name || '',
        position: contact.position || '',
        notes: contact.notes || '',
      })
      setClient(contact.client || null)
      setRows((contact.identities || []).map(({ kind, value, is_primary }) => ({ kind, value, is_primary })))
    } else {
      setValues(EMPTY)
      setClient(defaultClient)
      setRows([{ kind: 'phone', value: '', is_primary: true }])
    }
  }, [isOpen, contactId])

  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }))
  const hasIdentityErrors = rows.some((r) => identityError(r.kind, r.value))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!values.first_name.trim()) {
      setNameError('Укажите имя')
      return
    }
    if (hasIdentityErrors) return
    setSaving(true)
    try {
      const payload = { ...values, client_id: client?.id || null, owner_id: contact?.owner_id ?? null }
      if (contact) await updateContact(contact.id, payload, rows, contact.identities)
      else await createContact(payload, rows)
      toast.success(contact ? 'Контакт сохранён' : 'Контакт создан')
      onSaved?.()
      onClose()
    } catch (err) {
      captureError(err, { tags: { source: 'crm.ContactFormModal.submit' } })
      toast.error(translateError(err).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={contact ? 'Редактировать контакт' : 'Новый контакт'} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Имя *"
            value={values.first_name}
            onChange={(e) => { setNameError(null); set('first_name')(e) }}
            error={nameError}
            autoFocus
          />
          <Input label="Фамилия" value={values.last_name} onChange={set('last_name')} />
        </div>
        <Input label="Должность" value={values.position} onChange={set('position')} />
        <div>
          <span className="block text-sm font-medium mb-1.5">Компания</span>
          <ClientCombobox currentClient={client} onChange={(_id, c) => setClient(c)} placeholder="Без компании" />
        </div>

        <IdentityEditor rows={rows} onChange={setRows} />

        <label className="block text-sm">
          <span className="block font-medium mb-1.5">Заметка</span>
          <textarea
            value={values.notes}
            onChange={set('notes')}
            rows={2}
            className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent/60"
          />
        </label>

        <DuplicateWarning identities={rows} excludeContactId={contact?.id || null} onNavigate={onClose} />

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit" loading={saving} disabled={hasIdentityErrors}>{contact ? 'Сохранить' : 'Создать'}</Button>
        </div>
      </form>
    </Modal>
  )
}
