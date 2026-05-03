import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense, memo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { supabase } from '@/shared/lib/supabase'
import { ORDER_STATUSES, ORDER_TYPES, ROLES, getNextStatus, MS_PER_DAY } from '@/shared/constants'
import { formatPrice, formatRelative } from '@/shared/lib/utils'
import { StatusBadge } from '@/features/orders/components/StatusBadge'
import { ClaimButton } from '@/features/orders/components/ClaimButton'
import { CompleteTaskModal } from '@/features/production/components/CompleteTaskModal'
import { TaskTimer } from '@/features/production/components/TaskTimer'
import { DryingTimer } from '@/features/production/components/DryingTimer'
import { TechCardPreview } from '@/features/production/components/TechCardPreview'
import { updateOrderStatus } from '@/features/orders/hooks/useOrders'
import Button from '@/shared/components/Button'
import Spinner from '@/shared/components/Spinner'
import { OnboardingTip } from '@/shared/components/OnboardingTip'
import { toast } from '@/shared/stores/toast-store'
import { subDays, format, startOfDay } from 'date-fns'

// Lazy load Recharts (295KB) — only managers see charts
const MiniCharts = lazy(() => import('./MiniCharts'))

const WorkerTaskCard = memo(function WorkerTaskCard({ order, isMine, onUpdated }) {
  const [showComplete, setShowComplete] = useState(false)
  const [showTechCard, setShowTechCard] = useState(false)

  return (
    <div className="bg-surface rounded-xl border border-border p-5 mb-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Link to={`/orders/${order.id}`} className="text-base font-bold text-accent hover:underline">#{order.number}</Link>
          <button onClick={() => setShowTechCard(true)} className="text-xs text-text-muted hover:text-accent transition-colors min-h-[44px]">Тех карта</button>
        </div>
        <div className="flex items-center gap-2">
          {isMine ? (
            <>
              <Button size="sm" onClick={() => setShowComplete(true)}>Готово</Button>
              <CompleteTaskModal order={order} isOpen={showComplete} onClose={() => setShowComplete(false)} onCompleted={onUpdated} />
            </>
          ) : (
            <ClaimButton order={order} onClaimed={onUpdated} />
          )}
        </div>
      </div>
      <p className="text-sm font-medium">{ORDER_TYPES[order.order_type]?.label}</p>
      <p className="text-sm text-text-muted">{order.width_mm} x {order.height_mm} мм · {order.qty} шт</p>
      {order.deadline && (
        <p className={`text-xs mt-1 ${new Date(order.deadline) < new Date() ? 'text-danger font-medium' : 'text-text-muted'}`}>
          Дедлайн: {new Date(order.deadline).toLocaleDateString('ru-RU')}
        </p>
      )}
      {order.client?.name && <p className="text-xs text-text-muted mt-1">{order.client.name}</p>}
      {order.status === 'resin_pouring' && order.dry_until && (
        <DryingTimer dryUntil={order.dry_until} />
      )}
      <TaskTimer orderId={order.id} orderStatus={order.status} compact />
      <TechCardPreview orderId={order.id} isOpen={showTechCard} onClose={() => setShowTechCard(false)} />
    </div>
  )
})

function StatCard({ label, value }) {
  return (
    <div className="bg-surface-dim rounded-lg p-3">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-text-muted">{label}</p>
    </div>
  )
}

function EmptyState({ text }) {
  return (
    <div className="bg-surface rounded-xl border border-border p-6 text-center text-text-muted text-sm">
      {text}
    </div>
  )
}

export default function DashboardPage() {
  const { profile, hasRole } = useAuth()
  const isManager = hasRole(['admin', 'manager'])
  const isWorker = hasRole(['designer', 'printer', 'assembler', 'resin_pourer'])
  const role = profile?.role

  const [data, setData] = useState({ orders: [], statusCounts: {}, lowStock: [], myOrders: [], deadlines: [], activity: [] })
  const [loading, setLoading] = useState(true)
  const [workerStats, setWorkerStats] = useState({ todayDone: 0, weekDone: 0 })
  const [batchCompleting, setBatchCompleting] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [ordersRes, materialsRes, activityRes] = await Promise.all([
      supabase.from('k24_orders').select('*, client:k24_clients(name)').order('created_at', { ascending: false }).limit(50),
      supabase.from('k24_materials').select('*'),
      supabase.from('k24_order_status_history').select('*, changed_by_profile:k24_profiles!changed_by(display_name), order:k24_orders!order_id(number)').order('created_at', { ascending: false }).limit(15),
    ])

    const orders = ordersRes.data || []
    const materials = materialsRes.data || []

    const statusCounts = {}
    orders.forEach((o) => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1 })

    const lowStock = materials.filter((m) => m.min_qty > 0 && Number(m.stock_qty) <= Number(m.min_qty))
    const myOrders = profile ? orders.filter((o) => o.assigned_to === profile.id && o.status !== 'done' && o.status !== 'cancelled') : []

    // Deadlines — orders with deadline in next 3 days
    const now = new Date()
    const threeDays = new Date(now.getTime() + 3 * MS_PER_DAY)
    const deadlines = orders
      .filter((o) => o.deadline && o.status !== 'done' && o.status !== 'cancelled' && new Date(o.deadline) <= threeDays)
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))

    setData({ orders, statusCounts, lowStock, myOrders, deadlines, activity: activityRes.data || [] })
    setLoading(false)
  }, [profile])

  // Fetch worker personal stats (today + week)
  const fetchWorkerStats = useCallback(async () => {
    if (!profile || !isWorker) return
    const todayStart = startOfDay(new Date()).toISOString()
    const weekStart = subDays(new Date(), 7).toISOString()

    const [todayRes, weekRes] = await Promise.all([
      supabase
        .from('k24_order_status_history')
        .select('id', { count: 'exact', head: true })
        .eq('changed_by', profile.id)
        .eq('to_status', 'done')
        .gte('created_at', todayStart),
      supabase
        .from('k24_order_status_history')
        .select('id', { count: 'exact', head: true })
        .eq('changed_by', profile.id)
        .eq('to_status', 'done')
        .gte('created_at', weekStart),
    ])

    setWorkerStats({
      todayDone: todayRes.count || 0,
      weekDone: weekRes.count || 0,
    })
  }, [profile, isWorker])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { fetchWorkerStats() }, [fetchWorkerStats])

  // Debounced realtime — avoid cascading refetches on rapid changes
  const debounceRef = useRef(null)
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'k24_orders' }, () => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => { fetchData(); fetchWorkerStats() }, 2000)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel); if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [fetchData, fetchWorkerStats])

  // Mini chart data for managers
  const [chartData, setChartData] = useState([])
  useEffect(() => {
    if (!isManager) return
    async function fetchChartData() {
      const since = subDays(new Date(), 7).toISOString()
      const { data } = await supabase
        .from('k24_orders')
        .select('price_final, created_at')
        .gte('created_at', since)
        .neq('status', 'cancelled')

      const byDay = {}
      ;(data || []).forEach((o) => {
        const day = format(new Date(o.created_at), 'dd.MM')
        if (!byDay[day]) byDay[day] = { day, revenue: 0, count: 0 }
        byDay[day].revenue += Number(o.price_final || 0)
        byDay[day].count += 1
      })
      setChartData(Object.values(byDay))
    }
    fetchChartData()
  }, [isManager])

  // Role-specific queue status (memoized)
  const { myTasks, queueTasks } = useMemo(() => {
    const queueStatuses = {
      designer: ['design'],
      printer: ['print', 'post_processing'],
      resin_pourer: ['resin_pouring'],
      assembler: ['post_processing', 'assembly', 'packaging'],
    }
    const myQueueStatusList = queueStatuses[role] || []
    const myQueueOrders = myQueueStatusList.length > 0 ? data.orders.filter((o) => myQueueStatusList.includes(o.status)) : []
    return {
      myTasks: profile ? myQueueOrders.filter((o) => o.assigned_to === profile.id) : [],
      queueTasks: profile ? myQueueOrders.filter((o) => o.assigned_to !== profile.id) : [],
    }
  }, [data.orders, role, profile])

  const handleWorkerUpdated = () => {
    fetchData()
    fetchWorkerStats()
  }

  async function handleBatchComplete() {
    if (!window.confirm(`Завершить все ${myTasks.length} задач?`)) return
    setBatchCompleting(true)
    try {
      let completed = 0
      for (const order of myTasks) {
        const next = getNextStatus(profile.role, order.status, order)
        if (next) {
          await updateOrderStatus(order.id, order.status, next)
          completed++
        }
      }
      toast.success(`Завершено: ${completed} заказов`)
      fetchData()
      fetchWorkerStats()
    } catch (err) {
      toast.error('Ошибка: ' + err.message)
    } finally {
      setBatchCompleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Worker dashboard */}
      {isWorker && (
        <>
          {/* Greeting + stats */}
          <div className="bg-surface rounded-xl border border-border p-5">
            <h1 className="text-xl font-bold">Привет, {profile?.display_name}!</h1>
            <p className="text-text-muted text-sm mt-1">{ROLES[profile?.role]?.label}</p>
            <div className="flex gap-6 mt-3">
              <div>
                <span className="text-2xl font-bold">{workerStats.todayDone}</span>{' '}
                <span className="text-sm text-text-muted">выполнено сегодня</span>
              </div>
              <div>
                <span className="text-2xl font-bold">{myTasks.length}</span>{' '}
                <span className="text-sm text-text-muted">в работе</span>
              </div>
              <div>
                <span className="text-2xl font-bold">{queueTasks.length}</span>{' '}
                <span className="text-sm text-text-muted">в очереди</span>
              </div>
            </div>
          </div>

          {/* Two columns: my tasks + queue */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-3 relative">
                <h2 className="font-semibold">Мои задачи</h2>
                <OnboardingTip id="worker-my-tasks">
                  Здесь ваши назначенные заказы. Нажмите "Старт" чтобы начать работу.
                </OnboardingTip>
                {myTasks.length > 1 && (
                  <Button variant="secondary" size="sm" onClick={handleBatchComplete} loading={batchCompleting}>
                    Завершить все ({myTasks.length})
                  </Button>
                )}
              </div>
              {myTasks.length > 0 ? (
                myTasks.map((order, idx) => (
                  <div key={order.id} className="relative">
                    <WorkerTaskCard order={order} isMine={true} onUpdated={handleWorkerUpdated} />
                    {idx === 0 && (
                      <OnboardingTip id="worker-complete" position="right">
                        Завершите задачу: таймер остановится, можно записать расход материалов.
                      </OnboardingTip>
                    )}
                  </div>
                ))
              ) : (
                <EmptyState text="Нет задач. Возьмите заказ из очереди." />
              )}
            </div>

            <div>
              <div className="relative mb-3">
                <h2 className="font-semibold">Очередь</h2>
                <OnboardingTip id="worker-queue">
                  Свободные заказы. Нажмите "Взять" чтобы назначить на себя.
                </OnboardingTip>
              </div>
              {queueTasks.length > 0 ? (
                queueTasks.map((order) => (
                  <WorkerTaskCard key={order.id} order={order} isMine={false} onUpdated={handleWorkerUpdated} />
                ))
              ) : (
                <EmptyState text="Очередь пуста" />
              )}
            </div>
          </div>

          {/* Personal weekly stats */}
          <div className="bg-surface rounded-xl border border-border p-5">
            <h2 className="font-semibold mb-3">Моя статистика за неделю</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Выполнено" value={workerStats.weekDone} />
              <StatCard label="В работе" value={myTasks.length} />
            </div>
          </div>
        </>
      )}

      {/* Manager dashboard header */}
      {isManager && (
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-text-muted">
            {profile ? `${profile.display_name}` : ''}
          </p>
        </div>
      )}

      {/* My assigned orders (managers only) */}
      {data.myOrders.length > 0 && isManager && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-3">Мои заказы ({data.myOrders.length})</h2>
          <div className="space-y-2">
            {data.myOrders.slice(0, 5).map((order) => (
              <Link key={order.id} to={`/orders/${order.id}`} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-surface-dim transition-colors">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-sm">#{order.number}</span>
                  <StatusBadge status={order.status} />
                </div>
                <span className="text-sm text-text-muted">{formatRelative(order.created_at)}</span>
              </Link>
            ))}
          </div>
          {data.myOrders.length > 5 && (
            <Link to="/orders?assignee=me" className="block text-sm text-accent hover:underline mt-3">
              Показать все
            </Link>
          )}
        </div>
      )}

      {/* Status cards — managers/admins */}
      {isManager && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {Object.entries(ORDER_STATUSES)
            .filter(([key]) => key !== 'cancelled')
            .map(([key, s]) => (
              <Link key={key} to={`/orders?status=${key}`} className="bg-surface rounded-xl border border-border p-4 hover:shadow-sm transition-shadow">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
                <p className="text-2xl font-bold mt-2">{data.statusCounts[key] || 0}</p>
              </Link>
            ))}
        </div>
      )}

      {/* Mini charts — managers/admins (lazy loaded) */}
      {isManager && chartData.length > 0 && (
        <Suspense fallback={<div className="h-[92px]" />}>
          <MiniCharts chartData={chartData} />
        </Suspense>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent orders — managers */}
        {isManager && (
          <div className="lg:col-span-2 bg-surface rounded-xl border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Последние заказы</h2>
              <Link to="/orders" className="text-sm text-accent hover:underline">Все</Link>
            </div>
            {loading ? (
              <div className="flex justify-center py-8">
                <Spinner size="sm" />
              </div>
            ) : data.orders.length === 0 ? (
              <p className="text-text-muted text-sm py-4">Нет заказов</p>
            ) : (
              <div className="space-y-1">
                {data.orders.slice(0, 10).map((order) => (
                  <Link key={order.id} to={`/orders/${order.id}`} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-surface-dim transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-medium text-sm">#{order.number}</span>
                      <span className="text-sm text-text-muted truncate">
                        {ORDER_TYPES[order.order_type]?.label} · {order.qty} шт
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <StatusBadge status={order.status} />
                      {isManager && <span className="text-sm font-medium">{formatPrice(order.price_final)}</span>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sidebar */}
        {isManager && (
          <div className="space-y-4">
            {/* Low stock */}
            <div className="bg-surface rounded-xl border border-border p-5">
              <h2 className="font-semibold mb-3">Склад</h2>
              {data.lowStock.length === 0 ? (
                <p className="text-text-muted text-sm">Все материалы в норме</p>
              ) : (
                <div className="space-y-2">
                  {data.lowStock.map((m) => (
                    <div key={m.id} className="flex items-center justify-between text-sm">
                      <span className="text-danger font-medium">{m.name}</span>
                      <span className="text-text-muted">{Number(m.stock_qty).toFixed(1)} / {Number(m.min_qty).toFixed(1)} {m.unit}</span>
                    </div>
                  ))}
                  <Link to="/warehouse" className="block text-sm text-accent hover:underline mt-2">Склад</Link>
                </div>
              )}
            </div>

            {/* Deadlines */}
            {data.deadlines.length > 0 && (
              <div className="bg-surface rounded-xl border border-danger/30 p-5">
                <h2 className="font-semibold mb-3 text-danger">Дедлайны ({data.deadlines.length})</h2>
                <div className="space-y-2">
                  {data.deadlines.map((o) => {
                    const overdue = new Date(o.deadline) < new Date()
                    return (
                      <Link key={o.id} to={`/orders/${o.id}`} className="flex items-center justify-between text-sm py-1.5 hover:bg-surface-dim rounded px-2 -mx-2 transition-colors">
                        <span className="font-medium">#{o.number}</span>
                        <span className={overdue ? 'text-danger font-semibold' : 'text-warning'}>
                          {overdue ? 'Просрочен!' : new Date(o.deadline).toLocaleDateString('ru-RU')}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Activity feed */}
            {data.activity.length > 0 && (
              <div className="bg-surface rounded-xl border border-border p-5">
                <h2 className="font-semibold mb-3">Активность</h2>
                <div className="space-y-2">
                  {data.activity.slice(0, 8).map((a) => (
                    <div key={a.id} className="flex items-start gap-2 text-xs">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 flex-shrink-0" />
                      <div>
                        <span className="font-medium">{a.changed_by_profile?.display_name || 'Система'}</span>
                        {' '}
                        {a.order_id && (
                          <Link to={`/orders/${a.order_id}`} className="text-accent hover:underline">
                            #{a.order?.number || '...'}
                          </Link>
                        )}
                        {' '}
                        <span className="text-text-muted">
                          {a.from_status ? `${ORDER_STATUSES[a.from_status]?.label} -> ` : ''}
                          {ORDER_STATUSES[a.to_status]?.label || a.to_status}
                        </span>
                        <span className="text-text-muted ml-1">· {formatRelative(a.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div className="bg-surface rounded-xl border border-border p-5">
              <h2 className="font-semibold mb-3">Быстрые действия</h2>
              <div className="space-y-2">
                <Link to="/calculator" className="block w-full bg-accent hover:bg-accent-hover text-white font-medium rounded-lg py-2.5 text-sm text-center transition-colors">
                  Новый заказ
                </Link>
                <Link to="/analytics" className="block w-full border border-border text-text hover:bg-surface-dim font-medium rounded-lg py-2.5 text-sm text-center transition-colors">
                  Экспорт отчёта
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
