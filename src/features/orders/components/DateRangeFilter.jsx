import { useState, useMemo } from 'react'

const PRESETS = [
  { key: 'all',   label: 'Все' },
  { key: 'today', label: 'Сегодня' },
  { key: '7d',    label: '7 дней' },
  { key: '30d',   label: '30 дней' },
  { key: 'month', label: 'Этот месяц' },
  { key: 'custom', label: 'Свой период' },
]

function computeRange(preset, baseDate = new Date()) {
  const fmt = (d) => d.toISOString().slice(0, 10)
  const today = new Date(baseDate)
  today.setHours(0, 0, 0, 0)

  switch (preset) {
    case 'today':
      return { from: fmt(today), to: fmt(today) }
    case '7d': {
      const start = new Date(today)
      start.setDate(start.getDate() - 6) // 7 дней включая сегодня
      return { from: fmt(start), to: fmt(today) }
    }
    case '30d': {
      const start = new Date(today)
      start.setDate(start.getDate() - 29)
      return { from: fmt(start), to: fmt(today) }
    }
    case 'month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      return { from: fmt(start), to: fmt(end) }
    }
    case 'all':
    default:
      return { from: null, to: null }
  }
}

/**
 * R11.4: фильтр дат с пресетами.
 *
 * Если родитель управляет `preset` через props — это контролируемый режим
 * (как в OrdersPage). Иначе компонент управляет пресетом сам.
 * При выборе preset='custom' открываются date-инпуты.
 */
export function DateRangeFilter({ from, to, onChange }) {
  const [preset, setPreset] = useState(() => detectPreset(from, to))
  // Динамический пересчёт current preset для отображения активной кнопки
  // (если родитель сменил from/to извне).
  const activePreset = useMemo(() => detectPreset(from, to), [from, to])

  function selectPreset(key) {
    setPreset(key)
    if (key === 'custom') return
    onChange(computeRange(key))
  }

  const showInputs = preset === 'custom' || activePreset === 'custom' || (from || to)

  return (
    <div className="flex items-start gap-2 flex-wrap">
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-sm text-text-muted hidden sm:inline mr-1">Срок сдачи:</span>
        {PRESETS.map((p) => {
          const isActive = activePreset === p.key
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => selectPreset(p.key)}
              className={`px-2.5 py-1.5 text-xs rounded-md border transition-colors min-h-[36px] ${
                isActive
                  ? 'bg-accent text-on-accent border-accent'
                  : 'bg-surface border-border text-text-muted hover:text-text hover:border-text-muted/40'
              }`}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      {showInputs && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from || ''}
            onChange={(e) => { setPreset('custom'); onChange({ from: e.target.value || null, to }) }}
            placeholder="дд.мм.гггг"
            className="rounded-lg border border-border px-3 py-2 text-sm bg-surface min-h-[44px]"
            aria-label="Срок сдачи от"
          />
          <span className="text-text-muted text-sm">—</span>
          <input
            type="date"
            value={to || ''}
            onChange={(e) => { setPreset('custom'); onChange({ from, to: e.target.value || null }) }}
            placeholder="дд.мм.гггг"
            className="rounded-lg border border-border px-3 py-2 text-sm bg-surface min-h-[44px]"
            aria-label="Срок сдачи до"
          />
          {(from || to) && (
            <button
              onClick={() => { setPreset('all'); onChange({ from: null, to: null }) }}
              className="text-xs text-accent hover:underline min-h-[44px]"
            >
              Сбросить
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function detectPreset(from, to) {
  if (!from && !to) return 'all'
  // Проверяем совпадение с известными пресетами
  for (const p of PRESETS) {
    if (p.key === 'custom' || p.key === 'all') continue
    const range = computeRange(p.key)
    if (range.from === from && range.to === to) return p.key
  }
  return 'custom'
}
