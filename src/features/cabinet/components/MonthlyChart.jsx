import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

/**
 * Линейный график производства за последние 6 месяцев.
 * Две линии: произведено (стикеров+паков) + брак.
 */
export function MonthlyChart({ data }) {
  if (!data || data.length === 0) {
    return <p className="text-sm text-text-muted">Нет данных за последние 6 месяцев</p>
  }
  const hasData = data.some((d) => d.produced > 0 || d.defects > 0)
  if (!hasData) {
    return <p className="text-sm text-text-muted">За последние 6 месяцев записей нет</p>
  }

  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="label" tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} />
          <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8 }}
            labelStyle={{ color: 'var(--color-text)' }}
          />
          <Line type="monotone" dataKey="produced" name="Произведено" stroke="var(--color-accent)" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="defects" name="Брак" stroke="var(--color-danger)" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
