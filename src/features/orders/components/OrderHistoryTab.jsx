import { useMemo } from 'react'
import { ORDER_STATUSES } from '@/shared/constants'
import { STAGE_FIELDS } from '@/features/production/lib/production-logs'
import { useProductionLogs } from '@/features/production/hooks/useProductionLogs'
import { formatDateTime } from '@/shared/lib/utils'

const TYPE_DOT = {
  status: 'bg-accent',
  log: 'bg-success',
}

/**
 * Полная история заказа: смены статусов + ввод данных по производственным логам,
 * объединённые в один лог, отсортированный по времени (новые сверху).
 */
export function OrderHistoryTab({ order, history }) {
  const { logs } = useProductionLogs(order?.id, order?.qty)

  const items = useMemo(() => {
    const out = []
    for (const h of history || []) {
      out.push({
        id: `s-${h.id}`,
        type: 'status',
        ts: h.created_at,
        actor: h.changed_by_profile?.display_name || 'Система',
        from: h.from_status,
        to: h.to_status,
      })
    }
    for (const l of logs || []) {
      out.push({
        id: `l-${l.id}`,
        type: 'log',
        ts: l.created_at,
        actor: l.worker?.display_name || 'Сотрудник',
        stage: l.stage,
        track: l.track,
        log: l,
      })
    }
    out.sort((a, b) => new Date(b.ts) - new Date(a.ts))
    return out
  }, [history, logs])

  if (items.length === 0) {
    return (
      <div className="bg-surface rounded-2xl border border-border p-5 text-text-muted text-sm">
        Нет записей
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
      <h2 className="font-semibold text-lg mb-4">История заказа</h2>
      <ol className="space-y-2.5">
        {items.map((it) => (
          <li key={it.id} className="flex items-start gap-3 text-sm">
            <span className={`w-2 h-2 rounded-full mt-2 shrink-0 ${TYPE_DOT[it.type]}`} aria-hidden="true" />
            <div className="flex-1 min-w-0">
              {it.type === 'status' ? (
                <p>
                  {it.from && (
                    <><span className="text-text-muted">{ORDER_STATUSES[it.from]?.label || it.from}</span>{' → '}</>
                  )}
                  <span className="font-medium">{ORDER_STATUSES[it.to]?.label || it.to}</span>
                </p>
              ) : (
                <p className="break-words">
                  <span className="text-text-muted">Ввод данных:</span>{' '}
                  <span className="font-medium">{STAGE_FIELDS[it.stage]?.label || it.stage}</span>
                  {it.track && (
                    <span className="text-text-muted text-xs ml-1.5">
                      ({it.track === 'backgrounds' ? 'фоны' : 'стикеры'})
                    </span>
                  )}
                  <LogSummary log={it.log} stage={it.stage} />
                </p>
              )}
              <p className="text-xs text-text-muted">
                {it.actor} · {formatDateTime(it.ts)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function LogSummary({ log, stage }) {
  const config = STAGE_FIELDS[stage]
  if (!config) return null
  const parts = []
  for (const f of config.fields) {
    const v = log[f.key]
    if (v === undefined || v === null || v === '' || v === 0) continue
    parts.push(`${f.label}: ${v}${f.unit ? ' ' + f.unit : ''}`)
  }
  if (parts.length === 0) return null
  return (
    <span className="text-text-muted text-xs ml-1.5">— {parts.join(', ')}</span>
  )
}
