import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { compute3DPouringReport } from '@/features/production/lib/production-logs'
import { downloadXlsx } from '@/shared/lib/export-xlsx'
import { formatOrderNumber } from '@/shared/lib/utils'
import Button from '@/shared/components/Button'
import Spinner from '@/shared/components/Spinner'
import { translateError } from '@/shared/lib/error-translator'
import { toast } from '@/shared/stores/toast-store'

function rangeFromPeriod(period) {
  const to = new Date()
  const from = new Date()
  if (period === '7')      from.setDate(to.getDate() - 7)
  else if (period === '30') from.setDate(to.getDate() - 30)
  else if (period === 'month') from.setDate(1)
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

const COLUMN_LABELS = [
  '№ заказа', 'Сделка', 'Тираж', 'Вид стикера',
  'Напечатано стикеров', 'С учётом запаса 15%', 'Итого зал. без учёта брака',
  'Забраковано', 'Итого хороших 3D', 'Излишки 3D', '% брака', '% излишков',
]

export function ThreeDPouringTab({ period }) {
  const range = rangeFromPeriod(period)
  const [orders, setOrders] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const { data: o, error: oe } = await supabase
          .from('k24_orders')
          .select('id, number, custom_number, qty, deal_name, order_type, status, created_at, designs:k24_pack_designs(design_index, name, qty_target, order_id)')
          .eq('order_type', 'stickerpack3D')
          .eq('status', 'done')
          .gte('created_at', range.from)
          .lte('created_at', range.to + 'T23:59:59')
          .order('created_at', { ascending: false })
        if (oe) throw oe
        const orderIds = (o || []).map((x) => x.id)
        let l = []
        if (orderIds.length) {
          const { data: rows, error: le } = await supabase
            .from('k24_production_logs')
            .select('order_id, stage, track, design_index, stickers_printed, stickers_good, defects, deleted_at')
            .in('order_id', orderIds)
            .in('stage', ['print', 'selection_pouring'])
            .eq('track', 'stickers')
            .is('deleted_at', null)
          if (le) throw le
          l = rows || []
        }
        if (!cancelled) { setOrders(o || []); setLogs(l); setLoading(false) }
      } catch (err) {
        if (!cancelled) { setLoading(false); toast.error(translateError(err).message || err.message) }
      }
    })()
    return () => { cancelled = true }
  }, [range.from, range.to])

  async function handleExportAll() {
    // R9.2B (бриф 26.05): xlsx вместо CSV.
    const aoa = [COLUMN_LABELS]
    for (const order of orders) {
      const olog = logs.filter((l) => l.order_id === order.id)
      const odes = (order.designs || []).sort((a, b) => a.design_index - b.design_index)
      const rows = compute3DPouringReport(order, olog, odes)
      const num = formatOrderNumber(order)
      for (const r of rows) {
        aoa.push([
          num,
          order.deal_name || '',
          r.qtyTarget,
          r.designName ? `${r.designIndex} · ${r.designName}` : String(r.designIndex),
          r.printed,
          r.target15,
          r.pouredRaw,
          r.defects,
          r.good,
          r.surplus,
          Number(r.defectsPct.toFixed(2)),
          Number(r.surplusPct.toFixed(2)),
        ])
      }
    }
    if (aoa.length <= 1) { toast.error('Нет данных за период'); return }
    try {
      await downloadXlsx(`3d-pouring-${range.from}_${range.to}`, '3D-заливка', aoa)
    } catch (err) {
      toast.error(translateError(err).message || err.message)
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>

  if (orders.length === 0) {
    return (
      <div className="bg-surface rounded-xl border border-border p-12 text-center">
        <p className="text-text-muted">Нет завершённых 3D-стикерпаков за период</p>
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Сводка по 3D-заливке</h2>
        <Button variant="secondary" size="sm" onClick={handleExportAll}>Excel (все строки)</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Сводка по 3D-заливке завершённых стикерпаков</caption>
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 font-medium text-text-muted">#</th>
              <th className="text-left py-2 font-medium text-text-muted">Сделка</th>
              <th className="text-right py-2 font-medium text-text-muted">Видов</th>
              <th className="text-right py-2 font-medium text-text-muted">Тираж</th>
              <th className="text-right py-2 font-medium text-text-muted">Напечатано</th>
              <th className="text-right py-2 font-medium text-text-muted">Залито</th>
              <th className="text-right py-2 font-medium text-text-muted">Брак</th>
              <th className="text-right py-2 font-medium text-text-muted">% брака</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const olog = logs.filter((l) => l.order_id === o.id)
              const odes = (o.designs || []).sort((a, b) => a.design_index - b.design_index)
              const rows = compute3DPouringReport(o, olog, odes)
              const printed = rows.reduce((s, r) => s + r.printed, 0)
              const good = rows.reduce((s, r) => s + r.good, 0)
              const defects = rows.reduce((s, r) => s + r.defects, 0)
              const pct = good + defects > 0 ? (defects / (good + defects)) * 100 : 0
              return (
                <tr key={o.id} className="border-b border-border last:border-0">
                  <td className="py-2 font-medium">{formatOrderNumber(o)}</td>
                  <td className="py-2 text-text-muted">{o.deal_name || '—'}</td>
                  <td className="py-2 text-right tabular-nums">{rows.length}</td>
                  <td className="py-2 text-right tabular-nums">{o.qty}</td>
                  <td className="py-2 text-right tabular-nums">{printed || '—'}</td>
                  <td className="py-2 text-right tabular-nums">{good || '—'}</td>
                  <td className={`py-2 text-right tabular-nums ${defects > 0 ? 'text-danger' : ''}`}>{defects || '—'}</td>
                  <td className={`py-2 text-right tabular-nums ${pct > 20 ? 'text-danger font-medium' : pct > 10 ? 'text-warning' : ''}`}>
                    {pct > 0 ? `${pct.toFixed(1)}%` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
