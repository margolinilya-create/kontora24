import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/shared/lib/supabase'
import { ROLES } from '@/shared/constants'
import { STAGE_FIELDS } from '@/features/production/lib/production-logs'
import { formatOrderNumber } from '@/shared/lib/utils'
import { captureError } from '@/shared/lib/sentry'
import { differenceInMinutes, format, startOfDay } from 'date-fns'
import { ru } from 'date-fns/locale'
import Modal from '@/shared/components/Modal'

const FULL_SHIFT_MIN = 8 * 60

/**
 * R15.4 (бриф 04.06 #1): виджет «Активные смены» на главной для admin/manager.
 *
 * Показывает кто сейчас на смене, сколько отработал (live timer обновляется
 * каждую минуту). Клик на карточку открывает Modal с production-логами
 * работника за сегодня — менеджер видит чем именно занимался.
 */
export function ActiveShiftsWidget() {
  const [shifts, setShifts] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const [openWorkerId, setOpenWorkerId] = useState(null)

  async function fetchData() {
    setError(null)
    try {
      const todayStart = startOfDay(new Date()).toISOString()
      const [shiftsRes, logsRes] = await Promise.all([
        supabase
          .from('k24_shift_entries')
          .select('id, worker_id, started_at, worker:k24_profiles!worker_id(display_name, role)')
          .is('ended_at', null)
          .order('started_at', { ascending: true }),
        supabase
          .from('k24_production_logs')
          .select('id, worker_id, stage, order_id, stickers_printed, stickers_good, stickers_poured, qty_selected, qty_cut, packs_assembled, packs_packaged, prepared_qty, lamination_qty, defects, order:k24_orders!order_id(number, custom_number)')
          .is('deleted_at', null)
          .gte('created_at', todayStart)
          .limit(2000),
      ])
      if (shiftsRes.error) throw shiftsRes.error
      if (logsRes.error) throw logsRes.error
      setShifts(shiftsRes.data || [])
      setLogs(logsRes.data || [])
    } catch (err) {
      captureError(err, { tags: { source: 'ActiveShiftsWidget.fetch' } })
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  // Initial fetch + realtime subscription
  useEffect(() => {
    fetchData()
    // uuid-суффикс — supabase.channel() переиспользует подписанные каналы,
    // что вызывает crash при HMR/double-mount (см. feedback memory).
    const uid = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)
    const channel = supabase
      .channel(`active-shifts-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'k24_shift_entries' }, fetchData)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'k24_production_logs' }, fetchData)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // Live timer: обновляем «now» каждые 60 секунд для пересчёта elapsed.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(interval)
  }, [])

  const logsByWorker = useMemo(() => {
    const map = {}
    for (const l of logs) {
      if (!l.worker_id) continue
      if (!map[l.worker_id]) map[l.worker_id] = []
      map[l.worker_id].push(l)
    }
    return map
  }, [logs])

  if (loading) return null
  if (error) {
    return (
      <div className="bg-surface rounded-2xl border border-danger/30 shadow-card p-5" role="alert">
        <p className="text-sm text-danger">Не удалось загрузить активные смены</p>
      </div>
    )
  }
  if (shifts.length === 0) {
    return (
      <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
        <h2 className="font-semibold mb-2">Активные смены</h2>
        <p className="text-sm text-text-muted">Никто сейчас не на смене</p>
      </div>
    )
  }

  const openShift = shifts.find((s) => s.worker_id === openWorkerId)
  const openLogs = openWorkerId ? (logsByWorker[openWorkerId] || []) : []

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Активные смены ({shifts.length})</h2>
        <span className="text-xs text-text-muted">обновляется каждую минуту</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {shifts.map((s) => {
          const elapsed = differenceInMinutes(now, new Date(s.started_at))
          const hours = Math.floor(elapsed / 60)
          const mins = elapsed % 60
          const isFull = elapsed >= FULL_SHIFT_MIN
          const dotClass = isFull ? 'bg-warning' : 'bg-success'
          const workerLogs = logsByWorker[s.worker_id] || []
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setOpenWorkerId(s.worker_id)}
              className="text-left bg-surface-2 hover:bg-surface-dim border border-border rounded-xl p-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${dotClass}`} aria-hidden="true" />
                <p className="text-sm font-semibold truncate">{s.worker?.display_name || 'Неизвестно'}</p>
              </div>
              <p className="text-xs text-text-muted mb-2">{ROLES[s.worker?.role]?.label || s.worker?.role}</p>
              <p className="text-2xl font-bold font-display tracking-tight tabular-nums">
                {hours}<span className="text-sm text-text-muted font-sans">ч </span>
                {mins}<span className="text-sm text-text-muted font-sans">мин</span>
              </p>
              <p className="text-[11px] text-text-muted mt-1">
                с {format(new Date(s.started_at), 'HH:mm', { locale: ru })}
                {workerLogs.length > 0 && (
                  <span className="text-accent ml-2">· записей: {workerLogs.length}</span>
                )}
              </p>
            </button>
          )
        })}
      </div>

      {openShift && (
        <Modal
          isOpen
          onClose={() => setOpenWorkerId(null)}
          title={`${openShift.worker?.display_name} — за сегодня`}
          maxWidth="max-w-lg"
        >
          {openLogs.length === 0 ? (
            <p className="text-sm text-text-muted">Записей о работе сегодня нет</p>
          ) : (
            <ul className="space-y-1.5 text-sm max-h-96 overflow-y-auto">
              {openLogs.map((l) => (
                <li key={l.id} className="flex items-start gap-2 py-1.5 border-b border-border last:border-0">
                  <Link
                    to={`/orders/${l.order_id}`}
                    onClick={() => setOpenWorkerId(null)}
                    className="font-medium text-text hover:text-accent shrink-0"
                  >
                    #{formatOrderNumber(l.order || {})}
                  </Link>
                  <span className="text-text-muted shrink-0">·</span>
                  <span className="shrink-0">{STAGE_FIELDS[l.stage]?.label || l.stage}</span>
                  <ShiftLogValues log={l} />
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  )
}

function ShiftLogValues({ log }) {
  const parts = []
  // Несложный набор полей по аналогии с ShiftLogValues в CabinetPage.
  const fields = [
    ['prepared_qty', 'Подгот'],
    ['stickers_printed', 'Напеч'],
    ['lamination_qty', 'Лам'],
    ['qty_cut', 'Нарез'],
    ['qty_selected', 'Выбрано'],
    ['stickers_good', 'Залито'],
    ['stickers_poured', 'Залито'],
    ['packs_assembled', 'Собрано'],
    ['packs_packaged', 'Упак'],
    ['defects', 'Брак'],
  ]
  for (const [k, label] of fields) {
    const v = log[k]
    if (!v || Number(v) === 0) continue
    parts.push(`${label} ${v}`)
  }
  if (parts.length === 0) return null
  return <span className="text-text-muted text-xs">{parts.join(', ')}</span>
}
