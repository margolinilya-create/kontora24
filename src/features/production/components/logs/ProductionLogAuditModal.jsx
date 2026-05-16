import { useEffect, useState } from 'react'
import Modal from '@/shared/components/Modal'
import Spinner from '@/shared/components/Spinner'
import { supabase } from '@/shared/lib/supabase'
import { STAGE_FIELDS } from '../../lib/production-logs'

const OP_LABELS = {
  INSERT: { label: 'Создано', color: 'bg-success/15 text-success' },
  UPDATE: { label: 'Изменено', color: 'bg-info/15 text-info' },
  SOFT_DELETE: { label: 'Удалено', color: 'bg-danger/15 text-danger' },
  DELETE: { label: 'Удалено (hard)', color: 'bg-danger/15 text-danger' },
}

// Поля для diff: показываем только те, что меняются в UI редактирования.
const DIFF_FIELDS_PER_STAGE = Object.fromEntries(
  Object.entries(STAGE_FIELDS).map(([stage, cfg]) => [stage, cfg.fields.map((f) => f.key)]),
)
const COMMON_DIFF_FIELDS = ['notes', 'deleted_at']

/**
 * Просмотр истории правок одного production_log из k24_production_log_audit.
 * Доступно admin/manager (RLS на таблице аудита ограничивает SELECT).
 */
export function ProductionLogAuditModal({ logId, stage, onClose }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error: err } = await supabase
        .from('k24_production_log_audit')
        .select('id, operation, old_data, new_data, actor_role, created_at, actor:k24_profiles!actor_id(display_name)')
        .eq('log_id', logId)
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (err) setError(err)
      else setEntries(data || [])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [logId])

  const fieldKeys = DIFF_FIELDS_PER_STAGE[stage] || []
  const fieldLabels = Object.fromEntries(
    (STAGE_FIELDS[stage]?.fields || []).map((f) => [f.key, f.label]),
  )

  function diffRows(old_data, new_data) {
    const rows = []
    for (const key of [...fieldKeys, ...COMMON_DIFF_FIELDS]) {
      const a = old_data ? old_data[key] : undefined
      const b = new_data ? new_data[key] : undefined
      // Считаем «значимое отличие» — игнорируем 0/null/undefined/'' эквивалентность
      const aNorm = a === undefined || a === null || a === '' ? null : a
      const bNorm = b === undefined || b === null || b === '' ? null : b
      if (String(aNorm) === String(bNorm)) continue
      rows.push({ key, label: fieldLabels[key] || key, from: aNorm, to: bNorm })
    }
    return rows
  }

  return (
    <Modal isOpen onClose={onClose} title="История правок записи" maxWidth="max-w-xl">
      {loading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : error ? (
        <p className="text-sm text-danger">Не удалось загрузить аудит: {error.message}</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-text-muted">Истории нет — запись не редактировалась.</p>
      ) : (
        <ul className="space-y-3 max-h-96 overflow-y-auto">
          {entries.map((e) => {
            const meta = OP_LABELS[e.operation] || { label: e.operation, color: 'bg-surface-2 text-text' }
            const diffs = diffRows(e.old_data, e.new_data)
            return (
              <li key={e.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className={`text-[11px] px-2 py-0.5 rounded ${meta.color} font-medium`}>{meta.label}</span>
                  <span className="text-xs text-text-muted">
                    {new Date(e.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-xs text-text-muted">·</span>
                  <span className="text-xs">{e.actor?.display_name || (e.actor_role || 'система')}</span>
                </div>
                {e.operation === 'INSERT' && diffs.length === 0 && (
                  <p className="text-xs text-text-muted">Запись создана</p>
                )}
                {diffs.length > 0 && (
                  <div className="text-xs space-y-0.5">
                    {diffs.map((d) => (
                      <div key={d.key} className="flex gap-2 flex-wrap">
                        <span className="text-text-muted">{d.label}:</span>
                        <span className="line-through text-text-muted">{d.from ?? '—'}</span>
                        <span className="text-text-muted">→</span>
                        <span className="text-text font-medium">{d.to ?? '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
