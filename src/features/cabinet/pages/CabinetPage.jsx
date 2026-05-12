import { useState, lazy, Suspense, useMemo } from 'react'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useShiftTracker } from '@/features/production/hooks/useShiftTracker'
import { useCabinetStats } from '../hooks/useCabinetStats'
import { STAGE_FIELDS } from '@/features/production/lib/production-logs'
import { ROLES, ORDER_TYPES } from '@/shared/constants'
import { formatDateTime } from '@/shared/lib/utils'
import { Link } from 'react-router-dom'
import Button from '@/shared/components/Button'
import Spinner from '@/shared/components/Spinner'
import Tabs from '@/shared/components/Tabs'
import Modal from '@/shared/components/Modal'
import ErrorState from '@/shared/components/ErrorState'
import { formatOrderNumber } from '@/shared/lib/utils'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { differenceInMinutes, format, startOfDay, isSameDay } from 'date-fns'
import { ru } from 'date-fns/locale'

const FULL_SHIFT_MIN = 8 * 60

const MonthlyChart = lazy(() => import('../components/MonthlyChart').then((m) => ({ default: m.MonthlyChart })))

const PERIOD_TABS = [
  { key: '7', label: '7 дней' },
  { key: '30', label: '30 дней' },
  { key: 'month', label: 'Этот месяц' },
]

export default function CabinetPage() {
  const { profile } = useAuth()
  const { isOnShift, activeShift, todayMinutes, clockIn, clockOut, loading: shiftLoading, error: shiftError } = useShiftTracker()
  const [period, setPeriod] = useState('30')
  const { stats, loading, error, refetch } = useCabinetStats(period)

  function formatMinutes(min) {
    const h = Math.floor(min / 60)
    const m = min % 60
    return h > 0 ? `${h}ч ${m}мин` : `${m}мин`
  }

  function elapsedNow() {
    if (!activeShift) return 0
    return differenceInMinutes(new Date(), new Date(activeShift.started_at))
  }

  async function handleClockIn() {
    try { await clockIn(); toast.success('Смена начата') } catch (e) { toast.error(translateError(e).message) }
  }

  async function handleClockOut() {
    try { await clockOut(); toast.success('Смена завершена') } catch (e) { toast.error(translateError(e).message) }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display tracking-tight">Личный кабинет</h1>
        <p className="text-text-muted">{profile?.display_name} · {ROLES[profile?.role]?.label}</p>
      </div>

      {/* Shift tracker */}
      <div className="bg-surface rounded-xl border border-border p-6">
        {shiftError && (
          <div role="alert" className="bg-danger/10 border border-danger/30 text-danger rounded-lg px-3 py-2 mb-3 text-sm">
            Не удалось загрузить статус смены
          </div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold mb-1">Смена</h2>
            <p className="text-sm text-text-muted">
              {isOnShift
                ? `В работе: ${formatMinutes(elapsedNow())}`
                : `Сегодня: ${formatMinutes(todayMinutes)}`
              }
            </p>
          </div>
          {shiftLoading ? (
            <Spinner size="sm" />
          ) : isOnShift ? (
            <Button onClick={handleClockOut} variant="danger" size="lg">
              Завершить смену
            </Button>
          ) : (
            <Button onClick={handleClockIn} size="lg">
              Начать смену
            </Button>
          )}
        </div>
        {isOnShift && activeShift && (
          <p className="text-xs text-text-muted mt-2">
            Начало: {formatDateTime(activeShift.started_at)}
          </p>
        )}
      </div>

      {/* Period selector */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Статистика</h2>
        <Tabs items={PERIOD_TABS} active={period} onChange={setPeriod} />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-surface rounded-xl border border-border p-4">
              <p className="text-3xl font-bold font-display tracking-tight">{stats.totalItems}</p>
              <p className="text-xs text-text-muted">Записей</p>
            </div>
            <div className="bg-surface rounded-xl border border-border p-4">
              <p className="text-3xl font-bold font-display tracking-tight">{stats.byOrder.length}</p>
              <p className="text-xs text-text-muted">Заказов</p>
            </div>
            <div className="bg-surface rounded-xl border border-border p-4">
              <p className="text-3xl font-bold font-display tracking-tight">{stats.totalHours}ч</p>
              <p className="text-xs text-text-muted">Отработано</p>
            </div>
            <div className="bg-surface rounded-xl border border-border p-4">
              <p className="text-3xl font-bold font-display tracking-tight">{stats.shifts?.length || 0}</p>
              <p className="text-xs text-text-muted">Смен</p>
            </div>
          </div>

          {/* Personal production headline */}
          {(stats.headline.poured > 0 || stats.headline.packaged > 0 || stats.headline.selected > 0 || stats.headline.assembled > 0) && (
            <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
              <h2 className="font-semibold mb-4">Мой личный вклад</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <ContributionTile
                  bg="bg-dept-pouring/10"
                  fg="text-dept-pouring"
                  value={stats.headline.poured}
                  label="Залито хороших"
                  logs={stats.logs}
                  filter={(l) => l.stage === 'pouring' || l.stage === 'selection_pouring'}
                />
                <ContributionTile
                  bg="bg-dept-pouring/10"
                  fg="text-dept-pouring"
                  value={stats.headline.selected}
                  label="Выбрано фонов"
                  logs={stats.logs}
                  filter={(l) => l.stage === 'selection_pouring'}
                />
                <ContributionTile
                  bg="bg-dept-finish/10"
                  fg="text-dept-finish"
                  value={stats.headline.assembled}
                  label="Собрано 3D-паков"
                  logs={stats.logs}
                  filter={(l) => l.stage === 'assembly_3d'}
                />
                <ContributionTile
                  bg="bg-dept-finish/10"
                  fg="text-dept-finish"
                  value={stats.headline.packaged}
                  label="Упаковано паков"
                  logs={stats.logs}
                  filter={(l) => l.stage === 'packaging'}
                />
              </div>
            </div>
          )}

          {/* Worker payout — расчёт заработка по ставкам */}
          {stats.payout && stats.payout.total > 0 && (
            <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2 className="font-semibold">Сколько заработано</h2>
                <span className="text-2xl font-bold font-display tracking-tight text-accent">
                  {stats.payout.total.toFixed(2)} ₽
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                {Object.entries(stats.payout.breakdown).filter(([, v]) => v.count > 0).map(([key, v]) => (
                  <div key={key} className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface-2">
                    <div>
                      <p className="font-medium">{v.label}</p>
                      <p className="text-xs text-text-muted">{v.count} шт × {v.rate} ₽</p>
                    </div>
                    <span className="font-medium tabular-nums">{v.amount.toFixed(2)} ₽</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-text-muted mt-3">
                Расчёт за выбранный период по ставкам: заливка 1 ₽/шт, выборка 0,5 ₽/шт, сборка 0,5 ₽/стикер в паке (паков × стикеров в паке × 0,5 ₽), упаковка 1,5 ₽/пак.
              </p>
            </div>
          )}

          {/* Monthly chart — last 6 months */}
          <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
            <h2 className="font-semibold mb-4">Динамика за 6 месяцев</h2>
            <Suspense fallback={<Spinner />}>
              <MonthlyChart data={stats.byMonth} />
            </Suspense>
          </div>

          {/* By action type */}
          {stats.byAction.length > 0 && (
            <div className="bg-surface rounded-xl border border-border p-5">
              <h2 className="font-semibold mb-4">По типам работ</h2>
              <div className="space-y-3">
                {stats.byAction.map((a) => (
                  <div key={a.stage} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <span className="text-sm font-medium">{STAGE_FIELDS[a.stage]?.label || a.stage}</span>
                    <div className="text-right">
                      <span className="text-sm font-bold">{a.count} шт</span>
                      <span className="text-xs text-text-muted ml-2">({a.entries} записей)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* История смен с раскрытием по дням */}
          {stats.shifts && stats.shifts.length > 0 && (
            <ShiftHistory shifts={stats.shifts} logs={stats.logs} />
          )}

          {/* By order */}
          {stats.byOrder.length > 0 && (
            <div className="bg-surface rounded-xl border border-border p-5">
              <h2 className="font-semibold mb-4">По заказам</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Мой вклад по заказам</caption>
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 font-medium text-text-muted">Заказ</th>
                      <th className="text-left py-2 font-medium text-text-muted">Тип</th>
                      <th className="text-right py-2 font-medium text-text-muted">Записей</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byOrder.map((o) => (
                      <tr key={o.orderId} className="border-b border-border last:border-0">
                        <td className="py-2">
                          <Link to={`/orders/${o.orderId}`} className="text-accent hover:underline font-medium">
                            #{o.orderNumber}
                          </Link>
                        </td>
                        <td className="py-2 text-text-muted">{ORDER_TYPES[o.orderType]?.label || o.orderType}</td>
                        <td className="py-2 text-right">{o.totalEntries}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {stats.totalItems === 0 && (
            <div className="bg-surface rounded-xl border border-border p-12 text-center">
              <p className="text-text-muted">Нет записей за выбранный период</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/**
 * История смен с раскрытием по дням.
 * Каждая смена — карточка с длительностью, индикатором «полная (8ч)»,
 * и при клике раскрывает production logs за этот день.
 */
function ShiftHistory({ shifts, logs }) {
  const [openId, setOpenId] = useState(null)

  // Группируем логи по дате (yyyy-MM-dd) для быстрого поиска
  const logsByDay = useMemo(() => {
    const map = {}
    for (const l of logs || []) {
      const key = format(startOfDay(new Date(l.created_at)), 'yyyy-MM-dd')
      if (!map[key]) map[key] = []
      map[key].push(l)
    }
    return map
  }, [logs])

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <h2 className="font-semibold mb-3">История смен</h2>
      <p className="text-xs text-text-muted mb-3">
        Норма смены — 8 часов. Кликните на смену, чтобы посмотреть, что сделано в этот день.
      </p>
      <div className="space-y-2">
        {shifts.map((s) => {
          const minutes = s.duration_minutes || 0
          const hours = Math.floor(minutes / 60)
          const mins = minutes % 60
          const isFull = minutes >= FULL_SHIFT_MIN
          const startedAt = new Date(s.started_at)
          const dayKey = format(startOfDay(startedAt), 'yyyy-MM-dd')
          const dayLogs = (logsByDay[dayKey] || []).filter((l) => isSameDay(new Date(l.created_at), startedAt))
          const isOpen = openId === s.id
          return (
            <div key={s.id} className="border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => setOpenId(isOpen ? null : s.id)}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-surface-2 transition-colors text-left"
                aria-expanded={isOpen}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${isFull ? 'bg-success' : 'bg-warning'}`} aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium capitalize">
                      {format(startedAt, 'd MMMM yyyy', { locale: ru })}
                    </p>
                    <p className="text-xs text-text-muted">
                      {format(startedAt, 'HH:mm', { locale: ru })}{s.ended_at ? ` – ${format(new Date(s.ended_at), 'HH:mm', { locale: ru })}` : ''}
                      {' · '}{hours}ч {mins}мин{isFull ? ' · полная' : ' · неполная'}
                    </p>
                  </div>
                </div>
                <svg className={`w-4 h-4 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              {isOpen && (
                <div className="px-3 py-3 bg-surface-2 border-t border-border">
                  {dayLogs.length === 0 ? (
                    <p className="text-xs text-text-muted">В этот день записей по производству нет</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {dayLogs.map((l) => (
                        <li key={l.id} className="flex items-start gap-2 text-xs">
                          <span className="text-text-muted mt-0.5">{format(new Date(l.created_at), 'HH:mm', { locale: ru })}</span>
                          <Link to={`/orders/${l.order_id}`} className="text-text font-medium hover:text-accent">
                            #{l.order?.number}
                          </Link>
                          <span className="text-text-muted">·</span>
                          <span>{STAGE_FIELDS[l.stage]?.label || l.stage}</span>
                          <ShiftLogValues log={l} stage={l.stage} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Кликабельная плитка вклада. По клику открывает попап со списком заказов,
 * в которых работник делал эту операцию (агрегация по order_id).
 */
function ContributionTile({ bg, fg, value, label, logs, filter }) {
  const [open, setOpen] = useState(false)

  const ordersList = useMemo(() => {
    if (!open) return []
    const map = new Map()
    for (const l of logs || []) {
      if (!filter(l) || !l.order_id) continue
      const cur = map.get(l.order_id) || {
        orderId: l.order_id,
        order: l.order,
        count: 0,
      }
      // Сумма по полю-индикатору операции (используем количество в зависимости от stage)
      const stageQty =
        l.stage === 'assembly_3d' ? Number(l.packs_assembled) || 0 :
        l.stage === 'packaging'   ? Number(l.packs_packaged) || 0 :
        l.stage === 'selection_pouring' ? (Number(l.qty_selected) || 0) + (Number(l.stickers_good) || 0) :
        l.stage === 'pouring'     ? Number(l.stickers_good) || 0 :
        0
      cur.count += stageQty
      map.set(l.order_id, cur)
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [open, logs, filter])

  if (value === 0) {
    return (
      <div className={`${bg} rounded-xl p-3`}>
        <p className={`text-2xl font-bold font-display tracking-tight ${fg}`}>0</p>
        <p className="text-xs text-text-muted">{label}</p>
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${bg} rounded-xl p-3 text-left transition-all hover:ring-2 hover:ring-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60`}
      >
        <p className={`text-2xl font-bold font-display tracking-tight ${fg}`}>{value}</p>
        <p className="text-xs text-text-muted">{label}</p>
        <p className="text-[10px] text-text-muted mt-1 opacity-60">{ordersList.length || ''} {' '}— открыть</p>
      </button>
      {open && (
        <Modal isOpen onClose={() => setOpen(false)} title={label} maxWidth="max-w-md">
          {ordersList.length === 0 ? (
            <p className="text-sm text-text-muted">Нет заказов за выбранный период</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {ordersList.map((o) => (
                <li key={o.orderId} className="flex items-center justify-between gap-3 py-1.5 border-b border-border last:border-0">
                  <Link
                    to={`/orders/${o.orderId}`}
                    className="font-medium text-text hover:text-accent"
                    onClick={() => setOpen(false)}
                  >
                    #{formatOrderNumber(o.order)}
                  </Link>
                  <span className="text-text-muted tabular-nums">{o.count} шт</span>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </>
  )
}

function ShiftLogValues({ log, stage }) {
  const config = STAGE_FIELDS[stage]
  if (!config) return null
  const parts = []
  for (const f of config.fields) {
    const v = log[f.key]
    if (v === undefined || v === null || v === '' || v === 0) continue
    parts.push(`${f.label}: ${v}${f.unit ? ' ' + f.unit : ''}`)
  }
  if (parts.length === 0) return null
  return <span className="text-text-muted">— {parts.join(', ')}</span>
}
