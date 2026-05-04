import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatPrice } from '@/shared/lib/utils'

export function FinanceTab({ typeData, trendData, topClients, chartColors }) {
  const tooltipStyle = { borderRadius: 8, border: `1px solid ${chartColors.tooltipBorder}`, backgroundColor: chartColors.tooltipBg }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4">Выручка по типам</h2>
          {typeData.length === 0 ? (
            <p className="text-text-muted text-sm py-8 text-center">Нет данных</p>
          ) : (
            <figure role="img" aria-label="Выручка по типам продукции">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={typeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatPrice(v)} contentStyle={tooltipStyle} />
                  <Bar dataKey="revenue" name="Выручка" fill="#e94560" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cost" name="Себестоимость" fill="#1a1a2e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </figure>
          )}
        </div>

        {trendData.length > 1 && (
          <div className="bg-surface rounded-xl border border-border p-5">
            <h2 className="font-semibold mb-4">Тренд выручки</h2>
            <figure role="img" aria-label="Тренд выручки по дням">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatPrice(v)} contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="revenue" stroke="#e94560" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </figure>
          </div>
        )}
      </div>

      {typeData.length > 0 && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4">Маржинальность</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Маржинальность по типам</caption>
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
    </>
  )
}
