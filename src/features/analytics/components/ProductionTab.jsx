import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const COLORS = ['#e94560', '#1a1a2e', '#16213e', '#f59e0b', '#10b981', '#6366f1', '#8b5cf6']

export function ProductionTab({ statusData, avgStageData, workloadData, throughputData, orders, doneOrders, conversionRate, chartColors }) {
  const tooltipStyle = { borderRadius: 8, border: `1px solid ${chartColors.tooltipBorder}`, backgroundColor: chartColors.tooltipBg }

  return (
    <>
      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="font-semibold mb-4">Заказы по статусам</h2>
        {statusData.length === 0 ? (
          <p className="text-text-muted text-sm py-8 text-center">Нет данных</p>
        ) : (
          <figure role="img" aria-label="Распределение заказов по статусам">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </figure>
        )}
      </div>

      {avgStageData.length > 0 && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4">Среднее время на этап (часы)</h2>
          <figure role="img" aria-label="Среднее время на каждый этап производства">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={avgStageData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                <Tooltip formatter={(v) => `${v} ч`} contentStyle={tooltipStyle} />
                <Bar dataKey="hours" fill="#e94560" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </figure>
        </div>
      )}

      {workloadData.length > 0 && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4">Загрузка по исполнителям</h2>
          <figure role="img" aria-label="Загрузка по исполнителям">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={workloadData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" name="Заказов" fill="#1a1a2e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </figure>
        </div>
      )}

      {throughputData.some((d) => d.count > 0) && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4">Производительность по неделям</h2>
          <figure role="img" aria-label="Количество выполненных заказов по неделям">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={throughputData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} заказов`, 'Выполнено']} />
                <Line type="monotone" dataKey="count" stroke="#e94560" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </figure>
        </div>
      )}

      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="font-semibold mb-4">Конверсия</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold">{orders.length}</p>
            <p className="text-xs text-text-muted">Всего заказов</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-success">{doneOrders.length}</p>
            <p className="text-xs text-text-muted">Выполнено</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{conversionRate}%</p>
            <p className="text-xs text-text-muted">Конверсия</p>
          </div>
        </div>
      </div>
    </>
  )
}
