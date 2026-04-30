import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { useAnalytics } from '../hooks/useAnalytics'
import { ORDER_TYPES, ORDER_STATUSES } from '@/shared/constants'
import { formatPrice } from '@/shared/lib/utils'

const COLORS = ['#e94560', '#1a1a2e', '#16213e', '#f59e0b', '#10b981', '#6366f1', '#8b5cf6']

export default function AnalyticsPage() {
  const { stats, loading } = useAnalytics()

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  // Prepare chart data
  const typeData = Object.entries(stats.byType).map(([type, d]) => ({
    name: ORDER_TYPES[type]?.label || type,
    revenue: d.revenue,
    cost: d.cost,
    margin: d.revenue - d.cost,
    count: d.count,
  }))

  const statusData = Object.entries(stats.byStatus).map(([status, count]) => ({
    name: ORDER_STATUSES[status]?.label || status,
    value: count,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Аналитика</h1>
        <p className="text-text-muted">Выручка, маржинальность, статистика по типам</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Выручка (готовые)" value={formatPrice(stats.revenue)} />
        <StatCard label="Всего заказов" value={stats.totalOrders} />
        <StatCard label="Средний чек" value={formatPrice(stats.avgCheck)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by type */}
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4">Выручка по типам</h2>
          {typeData.length === 0 ? (
            <p className="text-text-muted text-sm py-8 text-center">Нет данных</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={typeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value) => formatPrice(value)}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
                <Bar dataKey="revenue" name="Выручка" fill="#e94560" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cost" name="Себестоимость" fill="#1a1a2e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Orders by status */}
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4">Заказы по статусам</h2>
          {statusData.length === 0 ? (
            <p className="text-text-muted text-sm py-8 text-center">Нет данных</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {statusData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Margin table */}
      {typeData.length > 0 && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4">Маржинальность по типам</h2>
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
              {typeData.map((row) => (
                <tr key={row.name} className="border-b border-border last:border-0">
                  <td className="py-2 font-medium">{row.name}</td>
                  <td className="py-2 text-right">{row.count}</td>
                  <td className="py-2 text-right">{formatPrice(row.revenue)}</td>
                  <td className="py-2 text-right text-text-muted">{formatPrice(row.cost)}</td>
                  <td className="py-2 text-right text-success font-medium">{formatPrice(row.margin)}</td>
                  <td className="py-2 text-right text-text-muted">
                    {row.revenue > 0 ? ((row.margin / row.revenue) * 100).toFixed(1) + '%' : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <p className="text-sm text-text-muted">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  )
}
