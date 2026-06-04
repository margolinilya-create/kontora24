import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import Modal from '@/shared/components/Modal'
import { formatOrderNumber } from '@/shared/lib/utils'

/**
 * 4 production-виджета на AnalyticsPage: залито / выбрано / собрано / упаковано.
 * Каждый кликабельный → Modal с табами «По заказам» / «По сотрудникам».
 * Фидбэк менеджера 17.05.
 *
 * Принимает productionTotals из useAnalyticsData:
 *   - totals: { poured, selected, assembled, packaged }
 *   - byOrder: { op: { [order_id]: count } }
 *   - byWorker: { op: { [worker_id]: { name, count } } }
 *   - ordersById: { [order_id]: order }
 */
// R15.2 (бриф 04.06 #8): добавлены R11-этапы. Tile отображается только если
// value > 0 за выбранный период — иначе блок засоряется пустыми нулями.
const TILES = [
  { op: 'samplePrint', label: 'Образцов отпечатано', unit: 'шт', bg: 'bg-dept-design/10', fg: 'text-dept-design', alwaysShow: false },
  { op: 'prepared',    label: 'Препресс план',        unit: 'шт', bg: 'bg-dept-design/10', fg: 'text-dept-design', alwaysShow: false },
  { op: 'printed',     label: 'Напечатано (всего)',   unit: 'шт', bg: 'bg-dept-print/10',  fg: 'text-dept-print',  alwaysShow: false },
  { op: 'laminated',   label: 'Заламинировано',       unit: 'шт', bg: 'bg-dept-print/10',  fg: 'text-dept-print',  alwaysShow: false },
  { op: 'cut',         label: 'Нарезано',             unit: 'шт', bg: 'bg-dept-print/10',  fg: 'text-dept-print',  alwaysShow: false },
  { op: 'poured',      label: 'Залито стикеров',      unit: 'шт', bg: 'bg-dept-pouring/10', fg: 'text-dept-pouring', alwaysShow: true },
  { op: 'drying',      label: 'Брак на сушке',        unit: 'шт', bg: 'bg-danger/10',       fg: 'text-danger',       alwaysShow: false },
  { op: 'selection',   label: 'Выбрано штучных',      unit: 'шт', bg: 'bg-dept-pouring/10', fg: 'text-dept-pouring', alwaysShow: false },
  { op: 'selected',    label: 'Выбрано фонов',        unit: 'шт', bg: 'bg-dept-print/10',   fg: 'text-dept-print',   alwaysShow: true },
  { op: 'assembled',   label: 'Собрано 3D-паков',     unit: 'шт', bg: 'bg-dept-finish/10',  fg: 'text-dept-finish',  alwaysShow: true },
  { op: 'packaged',    label: 'Упаковано',            unit: 'шт', bg: 'bg-accent/10',       fg: 'text-accent',       alwaysShow: true },
]

export function ProductionWidgets({ productionTotals }) {
  const [openOp, setOpenOp] = useState(null)
  const tile = TILES.find((t) => t.op === openOp)

  const visibleTiles = TILES.filter((t) => t.alwaysShow || (productionTotals.totals[t.op] || 0) > 0)

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-card p-4">
      <h2 className="font-semibold mb-3">Производство — сводка</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {visibleTiles.map((t) => {
          const value = productionTotals.totals[t.op] || 0
          if (value === 0) {
            return (
              <div key={t.op} className={`${t.bg} rounded-xl p-3`}>
                <p className={`text-2xl font-bold font-display tracking-tight ${t.fg}`}>0</p>
                <p className="text-xs text-text-muted">{t.label}</p>
              </div>
            )
          }
          return (
            <button
              key={t.op}
              type="button"
              onClick={() => setOpenOp(t.op)}
              className={`${t.bg} rounded-xl p-3 text-left transition-all hover:ring-2 hover:ring-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60`}
            >
              <p className={`text-2xl font-bold font-display tracking-tight ${t.fg}`}>{value}</p>
              <p className="text-xs text-text-muted">{t.label}</p>
              <p className="text-[10px] text-text-muted mt-1 opacity-60">— открыть</p>
            </button>
          )
        })}
      </div>
      {openOp && tile && (
        <ProductionDetailsModal
          label={tile.label}
          unit={tile.unit}
          byOrder={productionTotals.byOrder[openOp] || {}}
          byWorker={productionTotals.byWorker[openOp] || {}}
          ordersById={productionTotals.ordersById || {}}
          onClose={() => setOpenOp(null)}
        />
      )}
    </div>
  )
}

function ProductionDetailsModal({ label, unit, byOrder, byWorker, ordersById, onClose }) {
  const [tab, setTab] = useState('orders')

  const ordersList = useMemo(() => {
    return Object.entries(byOrder)
      .map(([orderId, count]) => ({ orderId, order: ordersById[orderId], count }))
      .sort((a, b) => b.count - a.count)
  }, [byOrder, ordersById])

  const workersList = useMemo(() => {
    return Object.entries(byWorker)
      .map(([workerId, { name, count }]) => ({ workerId, name, count }))
      .sort((a, b) => b.count - a.count)
  }, [byWorker])

  return (
    <Modal isOpen onClose={onClose} title={label} maxWidth="max-w-lg">
      <div className="inline-flex gap-1 bg-surface-2 rounded-xl p-1 mb-3" role="tablist">
        {[
          { key: 'orders', label: `Заказы (${ordersList.length})` },
          { key: 'workers', label: `Сотрудники (${workersList.length})` },
        ].map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              tab === t.key ? 'bg-accent text-on-accent' : 'text-text-muted hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'orders' && (
        ordersList.length === 0 ? (
          <p className="text-sm text-text-muted">Нет заказов за период</p>
        ) : (
          <ul className="space-y-1.5 text-sm max-h-96 overflow-y-auto">
            {ordersList.map((o) => (
              <li key={o.orderId} className="flex items-center justify-between gap-3 py-1.5 border-b border-border last:border-0">
                <Link
                  to={`/orders/${o.orderId}`}
                  onClick={onClose}
                  className="font-medium text-text hover:text-accent truncate"
                >
                  #{o.order ? formatOrderNumber(o.order) : o.orderId.slice(0, 6)}
                  {o.order?.client?.name && <span className="text-text-muted text-xs ml-2">{o.order.client.name}</span>}
                </Link>
                <span className="text-text-muted tabular-nums whitespace-nowrap">{o.count} {unit}</span>
              </li>
            ))}
          </ul>
        )
      )}

      {tab === 'workers' && (
        workersList.length === 0 ? (
          <p className="text-sm text-text-muted">Нет данных по сотрудникам за период</p>
        ) : (
          <ul className="space-y-1.5 text-sm max-h-96 overflow-y-auto">
            {workersList.map((w) => (
              <li key={w.workerId} className="flex items-center justify-between gap-3 py-1.5 border-b border-border last:border-0">
                <span className="font-medium text-text truncate">{w.name}</span>
                <span className="text-text-muted tabular-nums whitespace-nowrap">{w.count} {unit}</span>
              </li>
            ))}
          </ul>
        )
      )}
    </Modal>
  )
}
