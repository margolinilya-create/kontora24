import { useState, useEffect } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { jsPDF } from 'jspdf'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/stores/toast-store'
import { ORDER_TYPES, ORDER_STATUSES } from '@/shared/constants'
import { formatPrice, formatDate } from '@/shared/lib/utils'
import { subDays, subMonths, startOfDay, format, differenceInHours } from 'date-fns'

const COLORS = ['#e94560', '#1a1a2e', '#16213e', '#f59e0b', '#10b981', '#6366f1', '#8b5cf6']
const PERIODS = [
  { key: '7d', label: '7 дней', getStart: () => subDays(new Date(), 7) },
  { key: '30d', label: '30 дней', getStart: () => subDays(new Date(), 30) },
  { key: '90d', label: '3 месяца', getStart: () => subMonths(new Date(), 3) },
  { key: 'all', label: 'Всё время', getStart: () => new Date('2020-01-01') },
]

export default function AnalyticsPage() {
  const [period, setPeriod] = useState('30d')
  const [data, setData] = useState({ orders: [], statusHistory: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      setLoading(true)
      const periodDef = PERIODS.find((p) => p.key === period) || PERIODS[1]
      const startDate = periodDef.getStart()
      // Previous period for comparison
      const periodMs = Date.now() - startDate.getTime()
      const prevStart = new Date(startDate.getTime() - periodMs)

      const [ordersRes, historyRes, matTxRes, prevOrdersRes] = await Promise.all([
        supabase.from('orders').select('*, client:clients(name), assignee:profiles!assigned_to(display_name)').gte('created_at', startDate.toISOString()),
        supabase.from('order_status_history').select('*').gte('created_at', startDate.toISOString()),
        supabase.from('material_transactions').select('*, material:materials(name, type, unit)').gte('created_at', startDate.toISOString()),
        period !== 'all' ? supabase.from('orders').select('id, status, price_final').gte('created_at', prevStart.toISOString()).lt('created_at', startDate.toISOString()) : Promise.resolve({ data: [] }),
      ])

      setData({
        orders: ordersRes.data || [],
        statusHistory: historyRes.data || [],
        materialTx: matTxRes.data || [],
        prevOrders: prevOrdersRes.data || [],
      })
      setLoading(false)
    }
    fetch()
  }, [period])

  const orders = data.orders
  const doneOrders = orders.filter((o) => o.status === 'done')
  const revenue = doneOrders.reduce((s, o) => s + (Number(o.price_final) || 0), 0)
  const totalCost = doneOrders.reduce((s, o) => s + (Number(o.cost_total) || 0), 0)
  const avgCheck = doneOrders.length > 0 ? revenue / doneOrders.length : 0
  const cancelledCount = orders.filter((o) => o.status === 'cancelled').length
  const conversionRate = orders.length > 0 ? ((doneOrders.length / orders.length) * 100).toFixed(1) : 0

  // Revenue by type
  const byType = {}
  doneOrders.forEach((o) => {
    if (!byType[o.order_type]) byType[o.order_type] = { revenue: 0, count: 0, cost: 0 }
    byType[o.order_type].revenue += Number(o.price_final) || 0
    byType[o.order_type].cost += Number(o.cost_total) || 0
    byType[o.order_type].count += 1
  })
  const typeData = Object.entries(byType).map(([type, d]) => ({
    name: ORDER_TYPES[type]?.label || type, ...d, margin: d.revenue - d.cost,
  }))

  // Status pie
  const byStatus = {}
  orders.forEach((o) => { byStatus[o.status] = (byStatus[o.status] || 0) + 1 })
  const statusData = Object.entries(byStatus).map(([s, v]) => ({ name: ORDER_STATUSES[s]?.label || s, value: v }))

  // Avg time per stage (from status history)
  const stageTimes = {}
  const orderHistoryMap = {}
  data.statusHistory.forEach((h) => {
    if (!orderHistoryMap[h.order_id]) orderHistoryMap[h.order_id] = []
    orderHistoryMap[h.order_id].push(h)
  })
  Object.values(orderHistoryMap).forEach((history) => {
    history.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    for (let i = 1; i < history.length; i++) {
      const stage = history[i - 1].to_status
      const hours = differenceInHours(new Date(history[i].created_at), new Date(history[i - 1].created_at))
      if (!stageTimes[stage]) stageTimes[stage] = []
      stageTimes[stage].push(hours)
    }
  })
  const avgStageData = Object.entries(stageTimes).map(([stage, times]) => ({
    name: ORDER_STATUSES[stage]?.label || stage,
    hours: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
  })).filter((d) => d.hours > 0)

  // Revenue trend by day
  const revenueTrend = {}
  doneOrders.forEach((o) => {
    const day = format(new Date(o.created_at), 'dd.MM')
    if (!revenueTrend[day]) revenueTrend[day] = 0
    revenueTrend[day] += Number(o.price_final) || 0
  })
  const trendData = Object.entries(revenueTrend).map(([day, rev]) => ({ day, revenue: Math.round(rev) }))

  // Top clients
  const clientRevenue = {}
  doneOrders.forEach((o) => {
    const name = o.client_id || 'Без клиента'
    if (!clientRevenue[name]) clientRevenue[name] = { revenue: 0, count: 0, name: 'Без клиента' }
    clientRevenue[name].revenue += Number(o.price_final) || 0
    clientRevenue[name].count += 1
  })
  // We need client names — use orders with client relation
  orders.forEach((o) => {
    if (o.client_id && clientRevenue[o.client_id]) {
      clientRevenue[o.client_id].name = o.client?.name || o.client_id
    }
  })
  const topClients = Object.values(clientRevenue).sort((a, b) => b.revenue - a.revenue).slice(0, 10)

  // Previous period comparison
  const prevDone = (data.prevOrders || []).filter((o) => o.status === 'done')
  const prevRevenue = prevDone.reduce((s, o) => s + (Number(o.price_final) || 0), 0)
  const revenueDelta = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue * 100).toFixed(0) : null

  // Workload by assignee
  const workload = {}
  orders.filter((o) => o.status === 'done' && o.assignee).forEach((o) => {
    const name = o.assignee?.display_name || 'Не назначен'
    if (!workload[name]) workload[name] = 0
    workload[name] += 1
  })
  const workloadData = Object.entries(workload).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)

  // Material consumption
  const matConsumption = {}
  ;(data.materialTx || []).filter((t) => Number(t.delta) < 0).forEach((t) => {
    const name = t.material?.name || 'Неизвестно'
    const unit = t.material?.unit || ''
    if (!matConsumption[name]) matConsumption[name] = { total: 0, unit }
    matConsumption[name].total += Math.abs(Number(t.delta))
  })
  const matData = Object.entries(matConsumption).map(([name, d]) => ({ name, ...d }))

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Аналитика</h1>
          <p className="text-text-muted">Финансы и производственные метрики</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => {
              try {
                const doc = new jsPDF('p', 'mm', 'a4')
                doc.setFontSize(16); doc.setFont('helvetica', 'bold')
                doc.text('Kontora24 — Аналитика', 15, 20)
                doc.setFontSize(10); doc.setFont('helvetica', 'normal')
                doc.text(`Период: ${PERIODS.find((p) => p.key === period)?.label}`, 15, 28)
                let y = 38
                const rows = [
                  ['Выручка', formatPrice(revenue)],
                  ['Себестоимость', formatPrice(totalCost)],
                  ['Маржа', formatPrice(revenue - totalCost)],
                  ['Заказов', String(orders.length)],
                  ['Средний чек', formatPrice(avgCheck)],
                  ['Конверсия', `${conversionRate}%`],
                ]
                rows.forEach(([l, v]) => { doc.text(l + ':', 15, y); doc.text(v, 80, y); y += 6 })
                y += 5
                if (typeData.length > 0) {
                  doc.setFont('helvetica', 'bold'); doc.text('Маржинальность по типам', 15, y); y += 7
                  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
                  typeData.forEach((r) => {
                    doc.text(`${r.name}: ${r.count} заказов, выручка ${formatPrice(r.revenue)}, маржа ${formatPrice(r.margin)}`, 15, y); y += 5
                  })
                }
                doc.setFontSize(7); doc.setTextColor(150)
                doc.text(`Kontora24 · ${new Date().toLocaleDateString('ru-RU')}`, 15, 285)
                doc.save('analytics.pdf')
                toast.success('PDF экспортирован')
              } catch (e) { toast.error('Ошибка: ' + e.message) }
            }}
            className="border border-border text-text hover:bg-surface-dim font-medium rounded-lg px-3 py-1.5 text-sm transition-colors"
          >
            PDF
          </button>
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                period === p.key ? 'bg-primary text-white' : 'bg-surface border border-border text-text-muted hover:bg-surface-dim'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Выручка" value={formatPrice(revenue)} sub={revenueDelta !== null ? `${revenueDelta > 0 ? '+' : ''}${revenueDelta}% к прошлому` : null} />
        <StatCard label="Себестоимость" value={formatPrice(totalCost)} />
        <StatCard label="Маржа" value={formatPrice(revenue - totalCost)} accent />
        <StatCard label="Заказов" value={orders.length} sub={data.prevOrders?.length > 0 ? `было ${data.prevOrders.length}` : null} />
        <StatCard label="Средний чек" value={formatPrice(avgCheck)} />
        <StatCard label="Конверсия" value={`${conversionRate}%`} sub={`${cancelledCount} отмен`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by type */}
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4">Выручка по типам</h2>
          {typeData.length === 0 ? (
            <p className="text-text-muted text-sm py-8 text-center">Нет данных</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={typeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatPrice(v)} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Bar dataKey="revenue" name="Выручка" fill="#e94560" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cost" name="Себестоимость" fill="#1a1a2e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Status pie */}
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4">Заказы по статусам</h2>
          {statusData.length === 0 ? (
            <p className="text-text-muted text-sm py-8 text-center">Нет данных</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Production metrics: avg time per stage */}
      {avgStageData.length > 0 && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4">Среднее время на этап (часы)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={avgStageData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
              <Tooltip formatter={(v) => `${v} ч`} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <Bar dataKey="hours" fill="#e94560" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Margin table */}
      {typeData.length > 0 && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4">Маржинальность</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 font-medium text-text-muted">Тип</th>
                  <th className="text-right py-2 font-medium text-text-muted">Заказов</th>
                  <th className="text-right py-2 font-medium text-text-muted">Выручка</th>
                  <th className="text-right py-2 font-medium text-text-muted">Себестоимость</th>
                  <th className="text-right py-2 font-medium text-text-muted">Маржа</th>
                  <th className="text-right py-2 font-medium text-text-muted">%</th>
                </tr>
              </thead>
              <tbody>
                {typeData.map((r) => (
                  <tr key={r.name} className="border-b border-border last:border-0">
                    <td className="py-2 font-medium">{r.name}</td>
                    <td className="py-2 text-right">{r.count}</td>
                    <td className="py-2 text-right">{formatPrice(r.revenue)}</td>
                    <td className="py-2 text-right text-text-muted">{formatPrice(r.cost)}</td>
                    <td className="py-2 text-right text-success font-medium">{formatPrice(r.margin)}</td>
                    <td className="py-2 text-right text-text-muted">
                      {r.revenue > 0 ? ((r.margin / r.revenue) * 100).toFixed(1) + '%' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue trend */}
        {trendData.length > 1 && (
          <div className="bg-surface rounded-xl border border-border p-5">
            <h2 className="font-semibold mb-4">Тренд выручки</h2>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatPrice(v)} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Line type="monotone" dataKey="revenue" stroke="#e94560" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Top clients */}
        {topClients.length > 0 && (
          <div className="bg-surface rounded-xl border border-border p-5">
            <h2 className="font-semibold mb-4">Топ клиенты</h2>
            <div className="space-y-2">
              {topClients.map((c, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-text-muted">{c.count} заказов</p>
                    </div>
                  </div>
                  <span className="font-semibold text-sm">{formatPrice(c.revenue)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Workload by assignee */}
        {workloadData.length > 0 && (
          <div className="bg-surface rounded-xl border border-border p-5">
            <h2 className="font-semibold mb-4">Загрузка по исполнителям</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={workloadData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Bar dataKey="count" name="Заказов" fill="#1a1a2e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Material consumption */}
        {matData.length > 0 && (
          <div className="bg-surface rounded-xl border border-border p-5">
            <h2 className="font-semibold mb-4">Расход материалов</h2>
            <div className="space-y-3">
              {matData.map((m) => (
                <div key={m.name} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{m.name}</span>
                  <span className="text-text-muted">{m.total.toFixed(2)} {m.unit}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? 'bg-accent/5 border-accent/20' : 'bg-surface border-border'}`}>
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`text-xl font-bold mt-1 ${accent ? 'text-accent' : ''}`}>{value}</p>
      {sub && <p className="text-xs text-text-muted mt-0.5">{sub}</p>}
    </div>
  )
}
