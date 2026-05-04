import { useState, useEffect } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { formatDateTime } from '@/shared/lib/utils'

const STATUS_COLORS = {
  success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  retry: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
}

export function IntegrationLog() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    async function fetchLogs() {
      const { data } = await supabase
        .from('k24_integration_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      setLogs(data || [])
      setLoading(false)
    }
    fetchLogs()
  }, [])

  const directionLabel = (d) => d === 'incoming' ? 'Входящий' : 'Исходящий'

  if (loading) {
    return (
      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="font-semibold mb-4">Логи интеграции</h2>
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-border/50 rounded" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <h2 className="font-semibold mb-4">Логи интеграции</h2>

      {logs.length === 0 ? (
        <p className="text-text-muted text-sm">Нет записей</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Логи интеграции с Bitrix24</caption>
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 font-medium text-text-muted">Дата</th>
                <th className="text-left py-2 font-medium text-text-muted">Направление</th>
                <th className="text-left py-2 font-medium text-text-muted">Статус</th>
                <th className="text-left py-2 font-medium text-text-muted">Endpoint</th>
                <th className="text-left py-2 font-medium text-text-muted">Ошибка</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-border last:border-0 cursor-pointer hover:bg-surface-dim transition-colors"
                  onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                >
                  <td className="py-2.5 whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                  <td className="py-2.5">{directionLabel(log.direction)}</td>
                  <td className="py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[log.status] || 'bg-gray-100 text-gray-800'}`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="py-2.5 text-text-muted text-xs max-w-[200px] truncate">{log.endpoint || '---'}</td>
                  <td className="py-2.5 text-text-muted text-xs max-w-[200px] truncate">{log.error_message || '---'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {expandedId && (() => {
            const log = logs.find((l) => l.id === expandedId)
            if (!log) return null
            return (
              <div className="mt-3 p-3 bg-surface-dim rounded-lg text-xs space-y-2">
                {log.payload && (
                  <div>
                    <span className="font-medium text-text-muted">Payload:</span>
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-text-muted">
                      {JSON.stringify(log.payload, null, 2)}
                    </pre>
                  </div>
                )}
                {log.response && (
                  <div>
                    <span className="font-medium text-text-muted">Response:</span>
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-text-muted">
                      {JSON.stringify(log.response, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
