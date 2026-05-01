import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '@/shared/lib/supabase'
import { subDays, format } from 'date-fns'
import { formatNumber } from '@/shared/lib/utils'
import Spinner from '@/shared/components/Spinner'

export function ConsumptionChart() {
  const [data, setData] = useState({ daily: [], forecast: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      const since = subDays(new Date(), 30).toISOString()
      const { data: txs } = await supabase
        .from('material_transactions')
        .select('delta, created_at, material:materials(name, type, unit, stock_qty)')
        .lt('delta', 0)
        .gte('created_at', since)

      if (!txs) { setLoading(false); return }

      // Aggregate daily consumption
      const daily = {}
      txs.forEach((t) => {
        const day = format(new Date(t.created_at), 'dd.MM')
        if (!daily[day]) daily[day] = 0
        daily[day] += Math.abs(Number(t.delta))
      })
      const dailyData = Object.entries(daily).map(([day, total]) => ({ day, total: Math.round(total * 100) / 100 }))

      // Forecast: avg daily consumption × current stock
      const matConsumption = {}
      txs.forEach((t) => {
        const name = t.material?.name || '?'
        if (!matConsumption[name]) matConsumption[name] = { total: 0, stock: Number(t.material?.stock_qty || 0), unit: t.material?.unit || '' }
        matConsumption[name].total += Math.abs(Number(t.delta))
      })

      const days = 30
      const forecast = Object.entries(matConsumption).map(([name, d]) => {
        const avgPerDay = d.total / days
        const daysLeft = avgPerDay > 0 ? Math.floor(d.stock / avgPerDay) : Infinity
        return { name, avgPerDay: Math.round(avgPerDay * 100) / 100, stock: d.stock, daysLeft, unit: d.unit }
      }).filter((f) => f.daysLeft !== Infinity).sort((a, b) => a.daysLeft - b.daysLeft)

      setData({ daily: dailyData, forecast })
      setLoading(false)
    }
    fetch()
  }, [])

  if (loading) {
    return <div className="flex justify-center py-8"><Spinner size="sm" /></div>
  }

  return (
    <div className="space-y-6">
      {/* Daily consumption chart */}
      {data.daily.length > 0 && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4">Расход за 30 дней</h2>
          <figure role="img" aria-label="График расхода материалов за 30 дней">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--color-chart-tooltip-border)', background: 'var(--color-chart-tooltip-bg)', color: 'var(--color-text)' }} />
              <Bar dataKey="total" name="Расход" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          </figure>
        </div>
      )}

      {/* Forecast */}
      {data.forecast.length > 0 && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4">Прогноз остатков</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Прогноз остатков материалов</caption>
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 font-medium text-text-muted">Материал</th>
                  <th className="text-right py-2 font-medium text-text-muted">Остаток</th>
                  <th className="text-right py-2 font-medium text-text-muted">Расход/день</th>
                  <th className="text-right py-2 font-medium text-text-muted">Хватит на</th>
                </tr>
              </thead>
              <tbody>
                {data.forecast.map((f) => (
                  <tr key={f.name} className="border-b border-border last:border-0">
                    <td className="py-2 font-medium">{f.name}</td>
                    <td className="py-2 text-right text-text-muted">{formatNumber(f.stock, 1)} {f.unit}</td>
                    <td className="py-2 text-right text-text-muted">{formatNumber(f.avgPerDay, 2)} {f.unit}</td>
                    <td className={`py-2 text-right font-semibold ${f.daysLeft < 7 ? 'text-danger' : f.daysLeft < 14 ? 'text-warning' : 'text-success'}`}>
                      {f.daysLeft} дн
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.daily.length === 0 && data.forecast.length === 0 && (
        <div className="bg-surface rounded-xl border border-border p-12 text-center">
          <p className="text-text-muted">Нет данных о расходе. Данные появятся после автосписания при печати заказов.</p>
        </div>
      )}
    </div>
  )
}
