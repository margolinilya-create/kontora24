import { useState } from 'react'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import {
  useContractors, saveContractor, setContractorArchived, deleteContractor, CONTRACTOR_HAS_ORDERS,
} from '@/features/contractors/hooks/useContractors'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'
import Modal from '@/shared/components/Modal'
import Spinner from '@/shared/components/Spinner'
import ConfirmDialog from '@/shared/components/ConfirmDialog'
import ErrorState from '@/shared/components/ErrorState'

const EMPTY = { name: '', specialization: '', contact_person: '', phone: '', contact: '', notes: '' }

/**
 * R25.4 (ТЗ 4.2): вкладка «Подрядчики» — справочник для субподряда.
 * Архивный подрядчик не предлагается в новых заказах и остаётся в старых.
 * Удалить можно только подрядчика без заказов — иначе предлагаем архив.
 */
export function ContractorsSettings() {
  const canManage = useCanDo('contractor:manage')
  const [showArchived, setShowArchived] = useState(false)
  const { contractors, loading, error, refetch } = useContractors({ includeArchived: true })
  const [editing, setEditing] = useState(null) // { id|null, values }
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [pendingArchive, setPendingArchive] = useState(null) // подрядчик с заказами

  const visible = contractors.filter((c) => showArchived || !c.archived_at)
  const archivedCount = contractors.filter((c) => c.archived_at).length

  async function handleSave(e) {
    e.preventDefault()
    if (!editing.values.name.trim()) { toast.error('Укажите название'); return }
    setSaving(true)
    try {
      await saveContractor(editing.id, editing.values)
      toast.success(editing.id ? 'Подрядчик обновлён' : 'Подрядчик добавлен')
      setEditing(null)
      await refetch()
    } catch (err) {
      const msg = err?.code === '23505' ? 'Подрядчик с таким названием уже есть' : translateError(err).message
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive(c, archived) {
    try {
      await setContractorArchived(c.id, archived)
      toast.success(archived ? 'Подрядчик в архиве' : 'Подрядчик возвращён из архива')
      await refetch()
    } catch (err) {
      toast.error(translateError(err).message)
    }
  }

  async function confirmDelete() {
    const c = pendingDelete
    setPendingDelete(null)
    if (!c) return
    try {
      await deleteContractor(c.id)
      toast.success('Подрядчик удалён')
      await refetch()
    } catch (err) {
      if (err?.code === CONTRACTOR_HAS_ORDERS) {
        setPendingArchive(c)
        return
      }
      toast.error(translateError(err).message)
    }
  }

  function setField(field, value) {
    setEditing((prev) => ({ ...prev, values: { ...prev.values, [field]: value } }))
  }

  if (loading && contractors.length === 0) return <div className="py-8 flex justify-center"><Spinner /></div>
  if (error) return <ErrorState error={error} onRetry={refetch} />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Подрядчики</h2>
          <p className="text-sm text-text-muted">Выбираются в заказе при включённом «Субподряде».</p>
        </div>
        <div className="flex items-center gap-2">
          {archivedCount > 0 && (
            <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="w-4 h-4" />
              Показать архив ({archivedCount})
            </label>
          )}
          {canManage && (
            <Button onClick={() => setEditing({ id: null, values: { ...EMPTY } })}>+ Добавить</Button>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-text-muted py-6 text-center">Подрядчиков пока нет.</p>
      ) : (
        <div className="space-y-2">
          {visible.map((c) => (
            <div key={c.id} className={`bg-surface rounded-xl border border-border p-4 flex flex-col sm:flex-row sm:items-start gap-3 ${c.archived_at ? 'opacity-60' : ''}`}>
              <div className="flex-1 min-w-0">
                <p className="font-medium break-words">
                  {c.name}
                  {c.archived_at && <span className="ml-2 text-xs text-text-muted">(архив)</span>}
                </p>
                {c.specialization && <p className="text-sm text-text-muted break-words">{c.specialization}</p>}
                <p className="text-sm break-words mt-1">
                  {[c.contact_person, c.phone, c.contact].filter(Boolean).join(' · ') || <span className="text-text-muted">Контакты не указаны</span>}
                </p>
                {c.notes && <p className="text-xs text-text-muted mt-1 whitespace-pre-wrap break-words">{c.notes}</p>}
              </div>
              {canManage && (
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="secondary" onClick={() => setEditing({ id: c.id, values: { ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, c[k] ?? ''])) } })}>
                    Изменить
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => handleArchive(c, !c.archived_at)}>
                    {c.archived_at ? 'Из архива' : 'В архив'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setPendingDelete(c)}>Удалить</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={!!editing} onClose={() => !saving && setEditing(null)} title={editing?.id ? 'Подрядчик' : 'Новый подрядчик'}>
        {editing && (
          <form onSubmit={handleSave} className="space-y-3">
            <Input label="Название *" value={editing.values.name} onChange={(e) => setField('name', e.target.value)} autoFocus />
            <Input label="Специализация" placeholder="Например, УФ-печать, магниты" value={editing.values.specialization} onChange={(e) => setField('specialization', e.target.value)} />
            <Input label="Контактное лицо" value={editing.values.contact_person} onChange={(e) => setField('contact_person', e.target.value)} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Телефон" inputMode="tel" value={editing.values.phone} onChange={(e) => setField('phone', e.target.value)} />
              <Input label="Почта или мессенджер" value={editing.values.contact} onChange={(e) => setField('contact', e.target.value)} />
            </div>
            <label className="block">
              <span className="block text-sm font-medium mb-1">Комментарий</span>
              <textarea
                value={editing.values.notes}
                onChange={(e) => setField('notes', e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm resize-none"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)} disabled={saving}>Отмена</Button>
              <Button type="submit" loading={saving}>Сохранить</Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="Удалить подрядчика?"
        message={pendingDelete ? `«${pendingDelete.name}» будет удалён без возможности восстановления.` : ''}
        confirmText="Удалить"
        variant="danger"
      />

      <ConfirmDialog
        isOpen={!!pendingArchive}
        onClose={() => setPendingArchive(null)}
        onConfirm={() => { const c = pendingArchive; setPendingArchive(null); if (c) handleArchive(c, true) }}
        title="У подрядчика есть заказы"
        message={pendingArchive ? `«${pendingArchive.name}» указан в заказах — удалить нельзя. Отправить в архив? Он перестанет предлагаться в новых заказах и останется в старых.` : ''}
        confirmText="В архив"
        variant="warning"
      />
    </div>
  )
}
