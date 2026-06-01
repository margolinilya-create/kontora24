import { useEffect, useState } from 'react'

/**
 * R11.2: обратный отсчёт сушки 36 часов.
 * Считает remaining = endTime − Date.now() на каждом tick (не накапливает —
 * без drift'а при длинных сессиях). По истечении показывает «Готово» и
 * подсказку про авто-переход (pg_cron `auto_advance_drying` каждые 5 минут).
 *
 * @param {string|Date} startedAt — момент входа в drying (обычно order.drying_started_at)
 * @param {number} [durationHours=36] — длительность сушки
 */
export function DryingTimer({ startedAt, durationHours = 36 }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!startedAt) {
    return (
      <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
        Сушка ещё не запущена — таймер появится после перевода заказа на этап «Сушка».
      </div>
    )
  }

  const start = new Date(startedAt).getTime()
  const end = start + durationHours * 3_600_000
  const remaining = end - now
  const isOver = remaining <= 0

  const tone = isOver
    ? 'border-success/40 bg-success/10 text-success'
    : remaining < 3_600_000 // < 1 ч
      ? 'border-danger/40 bg-danger/10 text-danger'
      : remaining < 6 * 3_600_000 // < 6 ч
        ? 'border-warning/40 bg-warning/10 text-warning'
        : 'border-info/40 bg-info/10 text-info'

  return (
    <div className={`rounded-xl border px-4 py-3 ${tone}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wide font-semibold opacity-80">Сушка эпоксидной смолой</p>
          <p className="text-2xl font-mono font-bold mt-0.5 tabular-nums">
            {isOver ? 'Готово' : formatRemaining(remaining)}
          </p>
        </div>
        <div className="text-right text-xs leading-relaxed">
          <p>Старт: {formatStart(start)}</p>
          {isOver
            ? <p className="opacity-75">Заказ перейдёт автоматически в течение 5 минут</p>
            : <p className="opacity-75">Длительность 36 ч · auto-advance pg_cron</p>}
        </div>
      </div>
    </div>
  )
}

function formatRemaining(ms) {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatStart(ts) {
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
