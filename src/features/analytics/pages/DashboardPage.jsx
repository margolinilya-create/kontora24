import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { supabase } from '@/shared/lib/supabase'
import { ORDER_TYPES, ROLES, getNextStatus, MS_PER_DAY } from '@/shared/constants'
import { formatRelative } from '@/shared/lib/utils'
import { StatusBadge } from '@/features/orders/components/StatusBadge'
import { ClaimButton } from '@/features/orders/components/ClaimButton'
import { CompleteTaskModal } from '@/features/production/components/CompleteTaskModal'
import { TaskTimer } from '@/features/production/components/TaskTimer'
import { TechCardPreview } from '@/features/production/components/TechCardPreview'
import { updateOrderStatus } from '@/features/orders/hooks/useOrders'
import Button from '@/shared/components/Button'
import Spinner from '@/shared/components/Spinner'
import Tabs from '@/shared/components/Tabs'
import { OnboardingTip } from '@/shared/components/OnboardingTip'
import { ProductionJournalTab } from '../components/ProductionJournalTab'
import { toast } from '@/shared/stores/toast-store'
import { subDays, startOfDay } from 'date-fns'

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
  const isWorker = hasRole(['designer', 'printer', 'post_printer'])
  const role = profile?.role

  const [data, setData] = useState({ orders: [], statusCounts: {}, lowStock: [], allMaterials: [], myOrders: [], deadlines: [], activity: [] })
  const [loading, setLoading] = useState(true)
  const [workerStats, setWorkerStats] = useState({ todayDone: 0, weekDone: 0 })
  const [batchCompleting, setBatchCompleting] = useState(false)
  const [managerTab, setManagerTab] = useState('overview')

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

    setData({ orders, statusCounts, lowStock, allMaterials: materials, myOrders, deadlines, activity: activityRes.data || [] })
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

  // Role-specific queue status (memoized)
  const { myTasks, queueTasks } = useMemo(() => {
    const queueStatuses = {
      designer: ['design', 'prepress'],
      printer: ['prepress', 'print', 'lamination', 'cutting'],
      post_printer: ['selection_pouring', 'pouring', 'assembly_3d', 'packaging'],
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

  // Manager dashboard computed values
  const workStatuses = ['design', 'prepress', 'print', 'lamination', 'cutting', 'selection_pouring', 'pouring', 'assembly_3d', 'packaging', 'otk']
  const ordersInWork = useMemo(() => data.orders.filter(o => workStatuses.includes(o.status)), [data.orders])
  const ordersDueToday = useMemo(() => {
    const today = startOfDay(new Date())
    const tomorrow = new Date(today.getTime() + MS_PER_DAY)
    return data.orders.filter(o => {
      if (!o.deadline || o.status === 'done' || o.status === 'cancelled') return false
      const d = new Date(o.deadline)
      return d >= today && d < tomorrow
    })
  }, [data.orders])
  const outOfStock = useMemo(() => data.allMaterials.filter(m => m.min_qty > 0 && Number(m.stock_qty) === 0), [data.allMaterials])
  const lowStockOnly = useMemo(() => data.allMaterials.filter(m => m.min_qty > 0 && Number(m.stock_qty) > 0 && Number(m.stock_qty) <= Number(m.min_qty)), [data.allMaterials])

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

      {/* Manager dashboard */}
      {isManager && (
        <>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">{profile?.display_name || 'Dashboard'}</h1>
          </div>

          <Tabs
            items={[
              { key: 'overview', label: 'Обзор' },
              { key: 'production', label: 'Производство' },
            ]}
            active={managerTab}
            onChange={setManagerTab}
          />

          {managerTab === 'overview' && (
            <>
              {/* Top metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-surface rounded-xl border border-border p-5">
                  <p className="text-text-muted text-sm">Заказов в работе</p>
                  <p className="text-3xl font-bold mt-1">{ordersInWork.length}</p>
                </div>
                <div className="bg-surface rounded-xl border border-border p-5">
                  <p className="text-text-muted text-sm">К сдаче сегодня</p>
                  <p className="text-3xl font-bold mt-1">{ordersDueToday.length}</p>
                </div>
              </div>

              {/* Orders due today list */}
              {ordersDueToday.length > 0 && (
                <div className="bg-surface rounded-xl border border-border p-5">
                  <h2 className="font-semibold mb-3">Сдача сегодня</h2>
                  <div className="space-y-1">
                    {ordersDueToday.map((order) => (
                      <Link key={order.id} to={`/orders/${order.id}`} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-surface-dim transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-medium text-sm">#{order.number}</span>
                          <span className="text-sm text-text-muted truncate">
                            {order.client?.name || ''}
                          </span>
                        </div>
                        <StatusBadge status={order.status} />
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Warehouse block */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Out of stock */}
                <div className="bg-surface rounded-xl border border-danger/30 p-5">
                  <h2 className="font-semibold mb-3 text-danger">Закончились</h2>
                  {outOfStock.length === 0 ? (
                    <p className="text-text-muted text-sm">Все в наличии</p>
                  ) : (
                    <div className="space-y-2">
                      {outOfStock.map((m) => (
                        <Link key={m.id} to="/warehouse" className="flex items-center justify-between text-sm py-1 hover:bg-surface-dim rounded px-2 -mx-2 transition-colors">
                          <span className="text-danger font-medium">{m.name}</span>
                          <span className="text-text-muted">{m.unit}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* Low stock */}
                <div className="bg-surface rounded-xl border border-warning/30 p-5">
                  <h2 className="font-semibold mb-3 text-warning">Заканчиваются</h2>
                  {lowStockOnly.length === 0 ? (
                    <p className="text-text-muted text-sm">Все в норме</p>
                  ) : (
                    <div className="space-y-2">
                      {lowStockOnly.map((m) => (
                        <Link key={m.id} to="/warehouse" className="flex items-center justify-between text-sm py-1 hover:bg-surface-dim rounded px-2 -mx-2 transition-colors">
                          <span className="text-warning font-medium">{m.name}</span>
                          <span className="text-text-muted">{Number(m.stock_qty).toFixed(1)} / {Number(m.min_qty).toFixed(1)} {m.unit}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {managerTab === 'production' && <ProductionJournalTab />}
        </>
      )}
    </div>
  )
}
