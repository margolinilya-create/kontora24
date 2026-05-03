import { LineChart, Line, BarChart, Bar, ResponsiveContainer } from 'recharts'

export default function MiniCharts({ chartData }) {
  if (!chartData || chartData.length === 0) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="bg-surface rounded-xl border border-border p-4">
        <p className="text-xs text-text-muted mb-2">Выручка за 7 дней</p>
        <ResponsiveContainer width="100%" height={60}>
          <LineChart data={chartData}>
            <Line type="monotone" dataKey="revenue" stroke="var(--color-accent)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-surface rounded-xl border border-border p-4">
        <p className="text-xs text-text-muted mb-2">Заказы за 7 дней</p>
        <ResponsiveContainer width="100%" height={60}>
          <BarChart data={chartData}>
            <Bar dataKey="count" fill="var(--color-accent)" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
