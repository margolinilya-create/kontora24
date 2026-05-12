import { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'

/**
 * Линейные графики личного вклада за 6 месяцев.
 *  1) «Производство» — несколько кривых, легенда кликабельна для toggle.
 *  2) «Заработано» — отдельный график (раньше был как линия в первом).
 *
 * data: [{ key, label, orders, poured, selected, assembled, packaged, earnings }, ...]
 */
const SERIES = [
  { key: 'orders',    name: 'Обработано заказов',     color: 'var(--color-accent)' },
  { key: 'poured',    name: 'Залито стикеров',        color: '#8B5CF6' },
  { key: 'selected',  name: 'Выбрано фонов',          color: '#22C55E' },
  { key: 'assembled', name: 'Собрано паков',          color: '#F59E0B' },
  { key: 'packaged',  name: 'Упаковано изделий',      color: '#3B82F6' },
]

export function MonthlyChart({ data }) {
  // hidden — массив key, чьи кривые скрыты
  const [hidden, setHidden] = useState([])

  const hasProductionData = useMemo(
    () => (data || []).some((d) => SERIES.some((s) => Number(d[s.key]) > 0)),
    [data],
  )
  const hasEarnings = useMemo(
    () => (data || []).some((d) => Number(d.earnings) > 0),
    [data],
  )

  if (!data || data.length === 0) {
    return <p className="text-sm text-text-muted">Нет данных за последние 6 месяцев</p>
  }
  if (!hasProductionData && !hasEarnings) {
    return <p className="text-sm text-text-muted">За последние 6 месяцев записей нет</p>
  }

  function toggleSeries(key) {
    setHidden((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  return (
    <div className="space-y-6">
      {hasProductionData && (
        <div>
          <h3 className="font-semibold text-sm mb-2">Производство</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} />
              <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8 }}
                labelStyle={{ color: 'var(--color-text)' }}
              />
              <Legend
                onClick={(o) => toggleSeries(o.dataKey)}
                wrapperStyle={{ cursor: 'pointer', fontSize: 12 }}
              />
              {SERIES.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  hide={hidden.includes(s.key)}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-text-muted mt-1">Кликните по легенде, чтобы скрыть/показать кривую.</p>
        </div>
      )}

      {hasEarnings && (
        <div>
          <h3 className="font-semibold text-sm mb-2">Заработано</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} />
              <YAxis
                tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
                tickFormatter={(v) => `${Math.round(v)} ₽`}
              />
              <Tooltip
                contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8 }}
                labelStyle={{ color: 'var(--color-text)' }}
                formatter={(v) => [`${Number(v).toFixed(2)} ₽`, 'Заработано']}
              />
              <Line type="monotone" dataKey="earnings" name="Заработано" stroke="var(--color-accent)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
