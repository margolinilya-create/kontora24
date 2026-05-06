import { STAGE_FIELDS } from '../../lib/production-logs'

/**
 * Displays a list of production log entries for an order.
 * Shows who logged what and when.
 */
export function ProductionLogHistory({ logs, stage }) {
  const filtered = stage ? logs.filter((l) => l.stage === stage) : logs

  if (filtered.length === 0) {
    return <p className="text-sm text-text-muted py-4 text-center">Нет записей</p>
  }

  return (
    <div className="space-y-2">
      {filtered.map((log) => {
        const config = STAGE_FIELDS[log.stage]
        const qtyField = config?.quantityField
        const mainQty = qtyField ? log[qtyField] : null

        return (
          <div key={log.id} className="flex items-start justify-between py-2 border-b border-border last:border-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{log.worker?.display_name || 'Работник'}</span>
                <span className="text-text-muted text-xs">{config?.label}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-text-muted mt-0.5 flex-wrap">
                {mainQty > 0 && <span className="font-medium text-text">{mainQty} шт</span>}
                {log.film_meters > 0 && <span>Плёнка: {log.film_meters} м</span>}
                {log.resin_grams > 0 && <span>Смола: {log.resin_grams} г</span>}
                {log.stickers_poured > 0 && log.stickers_good > 0 && log.stickers_poured !== log.stickers_good && (
                  <span className="text-warning">Брак: {log.stickers_poured - log.stickers_good} шт</span>
                )}
                {log.packs_selected > 0 && <span>Выбрано: {log.packs_selected}</span>}
              </div>
              {log.notes && <p className="text-xs text-text-muted mt-1">{log.notes}</p>}
            </div>
            <span className="text-[11px] text-text-muted shrink-0 ml-2">
              {new Date(log.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )
      })}
    </div>
  )
}
