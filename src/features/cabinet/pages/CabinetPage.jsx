import { useState, lazy, Suspense } from 'react'
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
import ErrorState from '@/shared/components/ErrorState'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { differenceInMinutes } from 'date-fns'

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
          {(stats.headline.poured > 0 || stats.headline.packaged > 0 || stats.headline.selected > 0 || stats.headline.printed > 0) && (
            <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
              <h2 className="font-semibold mb-4">Мой личный вклад</h2>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-dept-print/10 rounded-xl p-3">
                  <p className="text-2xl font-bold font-display tracking-tight text-dept-print">{stats.headline.printed}</p>
                  <p className="text-xs text-text-muted">Напечатано</p>
                </div>
                <div className="bg-dept-pouring/10 rounded-xl p-3">
                  <p className="text-2xl font-bold font-display tracking-tight text-dept-pouring">{stats.headline.poured}</p>
                  <p className="text-xs text-text-muted">Залито хороших</p>
                </div>
                <div className="bg-dept-pouring/10 rounded-xl p-3">
                  <p className="text-2xl font-bold font-display tracking-tight text-dept-pouring">{stats.headline.selected}</p>
                  <p className="text-xs text-text-muted">Выбрано фонов</p>
                </div>
                <div className="bg-dept-finish/10 rounded-xl p-3">
                  <p className="text-2xl font-bold font-display tracking-tight text-dept-finish">{stats.headline.packaged}</p>
                  <p className="text-xs text-text-muted">Упаковано паков</p>
                </div>
                <div className="bg-danger/10 rounded-xl p-3">
                  <p className="text-2xl font-bold font-display tracking-tight text-danger">{stats.headline.defects}</p>
                  <p className="text-xs text-text-muted">Брак</p>
                </div>
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
                Расчёт за выбранный период по ставкам: заливка 1 ₽/шт, выборка 0,5 ₽/шт, сборка 0,5 ₽/пак, упаковка 1,5 ₽/пак.
              </p>
            </div>
          )}

          {/* Monthly chart — last 6 months */}
          <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
            <h2 className="font-semibold mb-4">Производство по месяцам</h2>
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
