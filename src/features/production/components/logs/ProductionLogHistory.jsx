import { useState } from 'react'
import { STAGE_FIELDS } from '../../lib/production-logs'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import ConfirmDialog from '@/shared/components/ConfirmDialog'
import { ProductionLogAuditModal } from './ProductionLogAuditModal'

/**
 * Список записей производственных логов.
 * Авторам своих записей и admin/manager — показывает действия Изменить/Удалить.
 */
export function ProductionLogHistory({ logs, stage, onUpdateLog, onDeleteLog }) {
  const { profile, hasRole } = useAuth()
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState({})
  const [deleteId, setDeleteId] = useState(null)
  const [auditLog, setAuditLog] = useState(null) // { id, stage } | null
  const [busy, setBusy] = useState(false)

  const filtered = stage ? logs.filter((l) => l.stage === stage) : logs
  if (filtered.length === 0) {
    return <p className="text-sm text-text-muted py-4 text-center">Нет записей</p>
  }

  const isPrivileged = hasRole(['admin', 'manager'])

  function startEdit(log) {
    const config = STAGE_FIELDS[log.stage]
    if (!config || !onUpdateLog) return
    const draft = {}
    config.fields.forEach((f) => { draft[f.key] = log[f.key] ?? '' })
    setEditDraft(draft)
    setEditingId(log.id)
  }

  async function saveEdit(logId) {
    setBusy(true)
    try {
      const patch = {}
      Object.entries(editDraft).forEach(([k, v]) => {
        if (v === '' || v === null || v === undefined) {
          patch[k] = null
        } else if (!Number.isNaN(Number(v)) && typeof v === 'string') {
          patch[k] = Number(v)
        } else {
          patch[k] = v
        }
      })
      await onUpdateLog(logId, patch)
      toast.success('Запись обновлена')
      setEditingId(null)
      setEditDraft({})
    } catch (err) {
      toast.error(translateError(err).message || err.message)
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!deleteId) return
    setBusy(true)
    try {
      await onDeleteLog(deleteId)
      toast.success('Запись удалена')
    } catch (err) {
      toast.error(translateError(err).message || err.message)
    } finally {
      setBusy(false)
      setDeleteId(null)
    }
  }

  return (
    <div className="space-y-2">
      {filtered.map((log) => {
        const config = STAGE_FIELDS[log.stage]
        const qtyField = config?.quantityField
        const mainQty = qtyField ? log[qtyField] : null
        const isOwn = profile?.id === log.worker_id
        const canEdit = (isOwn || isPrivileged) && !!onUpdateLog
        const canDelete = (isOwn || isPrivileged) && !!onDeleteLog
        const isEditing = editingId === log.id

        if (isEditing && config) {
          return (
            <div key={log.id} className="border border-accent/40 rounded-lg p-3 space-y-2">
              <div className="text-xs text-text-muted">{config.label} — редактирование</div>
              <div className="grid grid-cols-2 gap-2">
                {config.fields.map((f) => {
                  const isDecimal = !!f.step && /\./.test(f.step)
                  return (
                    <label key={f.key} className="text-xs text-text-muted block">
                      {f.label}{f.unit ? ` (${f.unit})` : ''}
                      <input
                        type={isDecimal ? 'text' : (f.type || 'number')}
                        inputMode={isDecimal ? 'decimal' : 'numeric'}
                        value={editDraft[f.key] ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value
                          if (isDecimal) {
                            if (raw !== '' && !/^[\d.,]*$/.test(raw)) return
                            setEditDraft((p) => ({ ...p, [f.key]: raw.replace(',', '.') }))
                          } else {
                            setEditDraft((p) => ({ ...p, [f.key]: raw }))
                          }
                        }}
                        className="w-full mt-0.5 rounded-md border border-border px-2 py-1 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/50"
                      />
                    </label>
                  )
                })}
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => { setEditingId(null); setEditDraft({}) }} className="text-xs text-text-muted hover:text-text px-2 py-1">Отмена</button>
                <button onClick={() => saveEdit(log.id)} disabled={busy} className="text-xs bg-accent text-on-accent px-3 py-1 rounded-md disabled:opacity-50">Сохранить</button>
              </div>
            </div>
          )
        }

        return (
          <div key={log.id} className="flex items-start justify-between py-2 border-b border-border last:border-0 group">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{log.worker?.display_name || 'Работник'}</span>
                <span className="text-text-muted text-xs">{config?.label}</span>
                {log.track === 'backgrounds' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-dept-print/15 text-dept-print">Фоны</span>}
                {log.track === 'stickers' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-dept-pouring/15 text-dept-pouring">Стикеры</span>}
                {log.design_index != null && <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-text-muted">Вид #{log.design_index}</span>}
              </div>
              <div className="flex items-center gap-3 text-xs text-text-muted mt-0.5 flex-wrap">
                {mainQty > 0 && <span className="font-medium text-text">{mainQty} шт</span>}
                {log.film_meters > 0 && <span>Плёнка: {log.film_meters} м</span>}
                {log.lamination_meters > 0 && <span>Ламинация: {log.lamination_meters} м</span>}
                {log.resin_grams > 0 && <span>Смола: {log.resin_grams} г</span>}
                {log.defects > 0 && <span className="text-warning">Брак: {log.defects} шт</span>}
              </div>
              {log.notes && <p className="text-xs text-text-muted mt-1">{log.notes}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              <span className="text-[11px] text-text-muted">
                {new Date(log.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
              {(canEdit || canDelete) && (
                <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                  {canEdit && (
                    <button onClick={() => startEdit(log)} className="text-[11px] text-text-muted hover:text-text px-1.5 py-0.5 rounded hover:bg-surface-2">Изм.</button>
                  )}
                  {isPrivileged && (
                    <button
                      onClick={() => setAuditLog({ id: log.id, stage: log.stage })}
                      title="История правок"
                      className="text-[11px] text-text-muted hover:text-text px-1.5 py-0.5 rounded hover:bg-surface-2"
                    >
                      История
                    </button>
                  )}
                  {canDelete && (
                    <button onClick={() => setDeleteId(log.id)} className="text-[11px] text-danger hover:bg-danger/10 px-1.5 py-0.5 rounded">Удал.</button>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        title="Удалить запись?"
        message="Запись будет помечена как удалённая. Прогресс этапа пересчитается."
        confirmText="Удалить"
        variant="danger"
      />

      {auditLog && (
        <ProductionLogAuditModal
          logId={auditLog.id}
          stage={auditLog.stage}
          onClose={() => setAuditLog(null)}
        />
      )}
    </div>
  )
}
