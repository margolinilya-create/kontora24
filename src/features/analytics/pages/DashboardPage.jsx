import { useState, useEffect, useCallback, useMemo, useRef, memo, lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { supabase } from '@/shared/lib/supabase'
import { ORDER_TYPES, ROLES, getNextStatus, MS_PER_DAY } from '@/shared/constants'
import { StatusBadge } from '@/features/orders/components/StatusBadge'
import { updateOrderStatus } from '@/features/orders/hooks/useOrders'
import { getDeadlineDotClass, getDeadlineBorderClass } from '@/shared/lib/deadline'

const CompleteTaskModal = lazy(() => import('@/features/production/components/CompleteTaskModal').then(m => ({ default: m.CompleteTaskModal })))
import Button from '@/shared/components/Button'
import ConfirmDialog from '@/shared/components/ConfirmDialog'
import Tabs from '@/shared/components/Tabs'
import { OnboardingTip } from '@/shared/components/OnboardingTip'
import { ProductionJournalTab } from '../components/ProductionJournalTab'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { captureError } from '@/shared/lib/sentry'
import { subDays, startOfDay } from 'date-fns'

const WorkerTaskCard = memo(function WorkerTaskCard({ order, onUpdated }) {
  const [showComplete, setShowComplete] = useState(false)

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-card p-5 mb-3">
      <div className="flex items-center justify-between mb-3">
        <Link to={`/orders/${order.id}`} className="text-base font-bold text-text hover:text-accent transition-colors">#{order.number}</Link>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setShowComplete(true)}>Готово</Button>
          <Suspense fallback={null}><CompleteTaskModal order={order} isOpen={showComplete} onClose={() => setShowComplete(false)} onCompleted={onUpdated} /></Suspense>
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
    </div>
  )
})

// Production statuses ordered for "in work" filter (module-level constant
// keeps useMemo deps stable).
const WORK_STATUSES = ['design', 'prepress', 'print', 'lamination', 'cutting', 'selection_pouring', 'pouring', 'assembly_3d', 'packaging', 'otk']

function StatCard({ label, value }) {
  return (
    <div className="bg-surface-2 rounded-xl p-3.5">
      <p className="text-2xl font-bold font-display tracking-tight">{value}</p>
      <p className="text-xs text-text-muted mt-0.5">{label}</p>
    </div>
  )
}

function EmptyState({ text, hint }) {
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-card p-6 text-center">
      <p className="text-text-muted text-sm">{text}</p>
      {hint && <p className="text-text-muted/60 text-xs mt-1">{hint}</p>}
    </div>
  )
}

export default function DashboardPage() {
  const { profile, hasRole } = useAuth()
  const isManager = hasRole(['admin', 'manager'])
  const isWorker = hasRole(['designer', 'printer', 'post_printer'])
  const role = profile?.role

  const [data, setData] = useState({ orders: [], statusCounts: {}, lowStock: [], allMaterials: [], myOrders: [], deadlines: [], activity: [] })
  const [, setLoading] = useState(true)
  const [dataError, setDataError] = useState(null)
  const [workerStats, setWorkerStats] = useState({ todayDone: 0, weekDone: 0 })
  const [batchCompleting, setBatchCompleting] = useState(false)
  const [showBatchConfirm, setShowBatchConfirm] = useState(false)
  const [managerTab, setManagerTab] = useState('overview')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [ordersRes, materialsRes, activityRes] = await Promise.all([
        supabase.from('k24_orders').select('*, client:k24_clients(name)').order('created_at', { ascending: false }).limit(50),
        supabase.from('k24_materials').select('*'),
        supabase.from('k24_order_status_history').select('*, changed_by_profile:k24_profiles!changed_by(display_name), order:k24_orders!order_id(number)').order('created_at', { ascending: false }).limit(15),
      ])
      if (ordersRes.error) throw ordersRes.error
      if (materialsRes.error) throw materialsRes.error
      if (activityRes.error) throw activityRes.error

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
      setDataError(null)
    } catch (err) {
      captureError(err, { tags: { source: 'DashboardPage.fetchData' } })
      setDataError(err)
      // graceful degradation: keep previous data, just flag error
    } finally {
      setLoading(false)
    }
  }, [profile])

  // Fetch worker personal stats (today + week)
  const fetchWorkerStats = useCallback(async () => {
    if (!profile || !isWorker) return
    const todayStart = startOfDay(new Date()).toISOString()
    const weekStart = subDays(new Date(), 7).toISOString()

    try {
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
      if (todayRes.error) throw todayRes.error
      if (weekRes.error) throw weekRes.error

      setWorkerStats({
        todayDone: todayRes.count ?? 0,
        weekDone: weekRes.count ?? 0,
      })
    } catch (err) {
      captureError(err, { tags: { source: 'DashboardPage.fetchWorkerStats' } })
      setWorkerStats({ todayDone: null, weekDone: null })
    }
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
    setShowBatchConfirm(false)
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
      toast.error(translateError(err).message)
    } finally {
      setBatchCompleting(false)
    }
  }

  // Manager dashboard computed values
  const ordersInWork = useMemo(() => data.orders.filter(o => WORK_STATUSES.includes(o.status)), [data.orders])
  const ordersDueToday = useMemo(() => {
    const today = startOfDay(new Date())
    const tomorrow = new Date(today.getTime() + MS_PER_DAY)
    return data.orders.filter(o => {
      if (!o.deadline || o.status === 'done' || o.status === 'cancelled') return false
      const d = new Date(o.deadline)
      return d >= today && d < tomorrow
    })
  }, [data.orders])
  // "Срочные" по ТЗ 06.05: priority=urgent ИЛИ просрочено (deadline < сегодня)
  const urgentOrders = useMemo(() => {
    const today = startOfDay(new Date())
    return data.orders
      .filter(o => {
        if (o.status === 'done' || o.status === 'cancelled') return false
        if (o.priority === 'urgent') return true
        if (o.deadline && new Date(o.deadline) < today) return true
        return false
      })
      .sort((a, b) => {
        const da = a.deadline ? new Date(a.deadline).getTime() : Infinity
        const db = b.deadline ? new Date(b.deadline).getTime() : Infinity
        return da - db
      })
  }, [data.orders])
  const outOfStock = useMemo(() => data.allMaterials.filter(m => m.min_qty > 0 && Number(m.stock_qty) === 0), [data.allMaterials])
  const lowStockOnly = useMemo(() => data.allMaterials.filter(m => m.min_qty > 0 && Number(m.stock_qty) > 0 && Number(m.stock_qty) <= Number(m.min_qty)), [data.allMaterials])

  return (
    <div className="space-y-6">
      {dataError && (
        <div role="alert" className="bg-danger/10 border border-danger/30 text-danger rounded-lg px-4 py-2 text-sm">
          Не удалось загрузить актуальные данные. Показаны последние сохранённые.
        </div>
      )}
      {/* Worker dashboard */}
      {isWorker && (
        <>
          {/* Greeting + stats — full sentence stays on Guidy (Onder would
              force all-caps which reads as shouting). */}
          <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
            <h1 className="text-xl font-bold tracking-tight">Привет, {profile?.display_name}!</h1>
            <p className="text-text-muted text-sm mt-1">{ROLES[profile?.role]?.label}</p>
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="bg-surface-2 rounded-xl p-3 text-center">
                <span className="text-2xl font-bold font-display tracking-tight block">{workerStats.todayDone ?? '—'}</span>
                <span className="text-xs text-text-muted">сегодня</span>
              </div>
              <div className="bg-surface-2 rounded-xl p-3 text-center">
                <span className="text-2xl font-bold font-display tracking-tight block">{myTasks.length}</span>
                <span className="text-xs text-text-muted">в работе</span>
              </div>
              <div className="bg-surface-2 rounded-xl p-3 text-center">
                <span className="text-2xl font-bold font-display tracking-tight block">{queueTasks.length}</span>
                <span className="text-xs text-text-muted">в очереди</span>
              </div>
            </div>
          </div>

          {/* Two columns: my tasks + queue */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-3 relative">
                <h2 className="font-semibold">Мои задачи</h2>
                <OnboardingTip id="worker-my-tasks">
                  Назначенные на вас заказы. Нажмите карточку, чтобы открыть заказ и внести данные.
                </OnboardingTip>
                {myTasks.length > 1 && (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => setShowBatchConfirm(true)} loading={batchCompleting}>
                      Завершить все ({myTasks.length})
                    </Button>
                    <ConfirmDialog
                      isOpen={showBatchConfirm}
                      onClose={() => setShowBatchConfirm(false)}
                      onConfirm={handleBatchComplete}
                      title="Завершить все задачи?"
                      message={`Переместить ${myTasks.length} заказов на следующий этап?`}
                      confirmText="Завершить все"
                      variant="primary"
                    />
                  </>
                )}
              </div>
              {myTasks.length > 0 ? (
                myTasks.map((order, idx) => (
                  <div key={order.id} className="relative">
                    <WorkerTaskCard order={order} onUpdated={handleWorkerUpdated} />
                    {idx === 0 && (
                      <OnboardingTip id="worker-complete" position="right">
                        Завершите задачу: откроется список этапов, на которых заказ перейдёт дальше.
                      </OnboardingTip>
                    )}
                  </div>
                ))
              ) : (
                <EmptyState text="Нет назначенных задач" hint="Свободные заказы — в колонке справа" />
              )}
            </div>

            <div>
              <div className="relative mb-3">
                <h2 className="font-semibold">Очередь</h2>
                <OnboardingTip id="worker-queue">
                  Заказы на ваших этапах. Откройте карточку, чтобы внести данные о работе.
                </OnboardingTip>
              </div>
              {queueTasks.length > 0 ? (
                queueTasks.map((order) => (
                  <WorkerTaskCard key={order.id} order={order} onUpdated={handleWorkerUpdated} />
                ))
              ) : (
                <EmptyState text="Очередь пуста" hint="Новые заказы появятся автоматически" />
              )}
            </div>
          </div>

          {/* Personal weekly stats */}
          <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
            <h2 className="font-semibold mb-3">Моя статистика за неделю</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Выполнено" value={workerStats.weekDone ?? '—'} />
              <StatCard label="В работе" value={myTasks.length} />
            </div>
          </div>
        </>
      )}

      {/* Manager dashboard */}
      {isManager && (
        <>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold font-display tracking-tight">{profile?.display_name || 'Dashboard'}</h1>
          </div>

          <Tabs
            items={[
              { key: 'overview', label: 'Обзор производства' },
              { key: 'production', label: 'Статистика производства' },
            ]}
            active={managerTab}
            onChange={setManagerTab}
          />

          {managerTab === 'overview' && (
            <>
              {/* Top metrics — bento tiles, +8pt по ТЗ */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
                  <p className="text-text-muted text-sm">Заказов в работе</p>
                  <p className="text-5xl font-bold mt-2 font-display tracking-tight leading-none">{ordersInWork.length}</p>
                </div>
                <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
                  <p className="text-text-muted text-sm">К сдаче сегодня</p>
                  <p className="text-5xl font-bold mt-2 font-display tracking-tight leading-none">{ordersDueToday.length}</p>
                </div>
              </div>

              {/* Список срочных заказов (priority=urgent или просроченные) */}
              {urgentOrders.length > 0 && (
                <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
                  <h2 className="font-semibold mb-3">Список срочных заказов</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {urgentOrders.map((order) => {
                      const dotClass = getDeadlineDotClass(order.deadline)
                      const borderClass = getDeadlineBorderClass(order.deadline) || 'border-danger'
                      return (
                        <Link
                          key={order.id}
                          to={`/orders/${order.id}`}
                          className={`flex items-center justify-between gap-2 py-3 px-3 rounded-xl border border-border bg-surface hover:border-accent/40 hover:bg-surface-2 transition-colors border-l-4 ${borderClass}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {dotClass && <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} aria-hidden="true" />}
                            <span className="font-semibold text-sm text-text shrink-0">#{order.number}</span>
                            <span className="text-sm text-text-muted truncate">{order.client?.name || ''}</span>
                          </div>
                          <StatusBadge status={order.status} />
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Warehouse block — позиции тоже карточками */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Out of stock */}
                <div className="bg-surface rounded-2xl border border-danger/30 shadow-card p-5">
                  <h2 className="font-semibold mb-3 text-danger">Закончились</h2>
                  {outOfStock.length === 0 ? (
                    <p className="text-text-muted text-sm">Все в наличии</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {outOfStock.map((m) => (
                        <Link
                          key={m.id}
                          to="/warehouse"
                          className="flex items-center justify-between text-sm py-2.5 px-3 rounded-xl border border-danger/20 bg-danger/[0.04] hover:bg-danger/10 hover:border-danger/40 transition-colors"
                        >
                          <span className="text-danger font-medium truncate">{m.name}</span>
                          <span className="text-text-muted shrink-0 ml-2">{m.unit}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* Low stock */}
                <div className="bg-surface rounded-2xl border border-dept-pouring/30 shadow-card p-5">
                  <h2 className="font-semibold mb-3 text-dept-pouring">Заканчиваются</h2>
                  {lowStockOnly.length === 0 ? (
                    <p className="text-text-muted text-sm">Все в норме</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {lowStockOnly.map((m) => (
                        <Link
                          key={m.id}
                          to="/warehouse"
                          className="flex items-center justify-between text-sm py-2.5 px-3 rounded-xl border border-dept-pouring/20 bg-dept-pouring/[0.04] hover:bg-dept-pouring/10 hover:border-dept-pouring/40 transition-colors"
                        >
                          <span className="text-dept-pouring font-medium truncate">{m.name}</span>
                          <span className="text-text-muted shrink-0 ml-2">
                            {Number(m.stock_qty).toFixed(1)} / {Number(m.min_qty).toFixed(1)} {m.unit}
                          </span>
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
