import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import MultiSelect from '@/shared/components/MultiSelect'
import Button from '@/shared/components/Button'
import { ORDER_STATUSES, ORDER_TYPES, FILM_TYPES, MATERIAL_COSTS, MS_PER_DAY } from '@/shared/constants'
import { ExportDataModal } from './ExportDataModal'
import { captureError } from '@/shared/lib/sentry'
import { startOfDay } from 'date-fns'

const PERIODS = [
  { value: '7', label: '7 дней' },
  { value: '30', label: '30 дней' },
  { value: '90', label: '90 дней' },
  { value: 'all', label: 'Всё время' },
]

const STAGE_OPTIONS = ['design', 'prepress', 'print', 'lamination', 'cutting', 'pouring', 'selection_pouring', 'assembly_3d', 'packaging', 'otk']
  .map((s) => ({ value: s, label: ORDER_STATUSES[s]?.label || s }))

const ORDER_TYPE_OPTIONS = Object.entries(ORDER_TYPES).map(([value, { label }]) => ({ value, label }))

function periodStart(period) {
  if (period === 'all') return null
  return new Date(Date.now() - Number(period) * MS_PER_DAY).toISOString()
}

function Tile({ label, value, hint, accent }) {
  return (
    <div className={`rounded-2xl border ${accent ? 'border-accent/40 bg-accent/5' : 'border-border bg-surface'} shadow-card p-4`}>
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`text-3xl font-bold font-display tracking-tight mt-1 leading-none ${accent ? 'text-accent' : ''}`}>{value}</p>
      {hint && <p className="text-[11px] text-text-muted mt-1.5">{hint}</p>}
    </div>
  )
}

function GroupBox({ title, children }) {
  return (
    <div className="rounded-2xl border border-border p-4 bg-surface-2">
      <h3 className="text-xs uppercase tracking-wide text-text-muted mb-3">{title}</h3>
      {children}
    </div>
  )
}

export function ProductionStatsTab() {
  const [period, setPeriod] = useState('30')
  const [stages, setStages] = useState([])
  const [workers, setWorkers] = useState([])
  const [orderTypes, setOrderTypes] = useState([])

  const [profiles, setProfiles] = useState([])
  const [orders, setOrders] = useState([])
  const [logs, setLogs] = useState([])
  const [completed, setCompleted] = useState([])
  const [loading, setLoading] = useState(true)
  const [exportOpen, setExportOpen] = useState(false)

  // Загрузка профилей для фильтра сотрудников (один раз)
  useEffect(() => {
    supabase.from('k24_profiles').select('id, display_name').order('display_name')
      .then(({ data, error }) => {
        if (error) captureError(error, { tags: { source: 'ProductionStatsTab.profiles' } })
        else setProfiles(data || [])
      })
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const since = periodStart(period)
    try {
      let ordersQuery = supabase
        .from('k24_orders')
        .select('id, number, order_type, status, qty, deadline, created_at, client:k24_clients(name)')
      if (since) ordersQuery = ordersQuery.gte('created_at', since)
      if (orderTypes.length > 0) ordersQuery = ordersQuery.in('order_type', orderTypes)

      let logsQuery = supabase
        .from('k24_production_logs')
        .select('id, order_id, stage, worker_id, track, stickers_printed, backgrounds_printed, film_meters, film_type, lamination_meters, defects, qty_cut, qty_selected, stickers_poured, stickers_good, resin_grams, packs_assembled, packs_packaged, created_at')
        .is('deleted_at', null)
      if (since) logsQuery = logsQuery.gte('created_at', since)
      if (stages.length > 0) logsQuery = logsQuery.in('stage', stages)
      if (workers.length > 0) logsQuery = logsQuery.in('worker_id', workers)

      let completedQuery = supabase
        .from('k24_order_status_history')
        .select('order_id, created_at, order:k24_orders!order_id(deadline, order_type)')
        .eq('to_status', 'done')
      if (since) completedQuery = completedQuery.gte('created_at', since)

      const [ordersRes, logsRes, completedRes] = await Promise.all([ordersQuery, logsQuery, completedQuery])
      if (ordersRes.error) throw ordersRes.error
      if (logsRes.error) throw logsRes.error
      if (completedRes.error) throw completedRes.error

      setOrders(ordersRes.data || [])
      setLogs(logsRes.data || [])
      setCompleted(completedRes.data || [])
    } catch (err) {
      captureError(err, { tags: { source: 'ProductionStatsTab.fetch' } })
    } finally {
      setLoading(false)
    }
  }, [period, stages, workers, orderTypes])

  useEffect(() => { fetchData() }, [fetchData])

  // Workers options
  const workerOptions = useMemo(
    () => profiles.map((p) => ({ value: p.id, label: p.display_name || '—' })),
    [profiles],
  )

  // ----- METRICS -----
  // Заказов: всего, вовремя, раньше, просрочено (по completed)
  const completedFiltered = orderTypes.length > 0
    ? completed.filter((c) => c.order && orderTypes.includes(c.order.order_type))
    : completed
  const ordersStats = useMemo(() => {
    let onTime = 0, early = 0, late = 0
    completedFiltered.forEach((c) => {
      const dl = c.order?.deadline
      if (!dl) return
      const dlDate = startOfDay(new Date(dl)).getTime()
      const doneDate = startOfDay(new Date(c.created_at)).getTime()
      if (doneDate === dlDate) onTime++
      else if (doneDate < dlDate) early++
      else late++
    })
    return { total: orders.length, completed: completedFiltered.length, onTime, early, late }
  }, [orders, completedFiltered])

  // Плёнка по типам (пог.м)
  const filmByType = useMemo(() => {
    const acc = {}
    logs.forEach((l) => {
      if (l.stage !== 'print' || !l.film_type) return
      acc[l.film_type] = (acc[l.film_type] || 0) + (Number(l.film_meters) || 0)
    })
    return Object.entries(acc).sort((a, b) => b[1] - a[1])
  }, [logs])
  const totalFilmMeters = filmByType.reduce((s, [, v]) => s + v, 0)

  // Смола (кг)
  const totalResinKg = useMemo(() => {
    const grams = logs.reduce((s, l) => s + (Number(l.resin_grams) || 0), 0)
    return grams / 1000
  }, [logs])

  // Произведено: pack_packaged + готовых стикеров (good) + одиночные cut (для не-3D)
  const producedQty = useMemo(() => {
    return logs.reduce((s, l) => {
      if (l.stage === 'packaging') return s + (Number(l.packs_packaged) || 0)
      if (l.stage === 'pouring') return s + (Number(l.stickers_good) || 0)
      return s
    }, 0)
  }, [logs])

  // % брака 3D = sum(defects) / (sum(stickers_good) + sum(defects))
  const defects3D = useMemo(() => {
    let good = 0, bad = 0
    logs.forEach((l) => {
      if (l.stage === 'pouring' || l.stage === 'selection_pouring') {
        good += Number(l.stickers_good) || 0
        bad += Number(l.defects) || 0
      }
    })
    const ratio = good + bad > 0 ? (bad / (good + bad)) * 100 : 0
    return { ratio, good, bad }
  }, [logs])

  // % излишков: max(0, sum(poured) - sum(qty)) / sum(qty); считаем по 3D-заказам
  const surplus3D = useMemo(() => {
    const orderQty = {}
    orders.forEach((o) => {
      if (o.order_type === 'sticker3D' || o.order_type === 'stickerpack3D') {
        orderQty[o.id] = o.qty || 0
      }
    })
    let pouredSum = 0
    let targetSum = 0
    logs.forEach((l) => {
      if (l.stage !== 'pouring' && l.stage !== 'selection_pouring') return
      if (orderQty[l.order_id] === undefined) return
      pouredSum += Number(l.stickers_poured) || 0
    })
    Object.values(orderQty).forEach((q) => { targetSum += q })
    const surplus = Math.max(0, pouredSum - targetSum)
    const ratio = targetSum > 0 ? (surplus / targetSum) * 100 : 0
    return { ratio, surplus, targetSum }
  }, [logs, orders])

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="bg-surface rounded-2xl border border-border shadow-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-text-muted mb-1">Период</label>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
              {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <MultiSelect label="Этапы" options={STAGE_OPTIONS} value={stages} onChange={setStages} />
          <MultiSelect label="Сотрудники" options={workerOptions} value={workers} onChange={setWorkers} />
          <MultiSelect label="Типы заказов" options={ORDER_TYPE_OPTIONS} value={orderTypes} onChange={setOrderTypes} />
          <div className="ml-auto">
            <Button variant="secondary" size="sm" onClick={() => setExportOpen(true)}>Выгрузить данные</Button>
          </div>
        </div>
      </div>

      {/* Orders metrics */}
      <GroupBox title="Заказы">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Tile label="Всего за период" value={loading ? '…' : ordersStats.total} accent />
          <Tile label="Произведено вовремя" value={loading ? '…' : ordersStats.onTime} hint="дата выдачи = дедлайну" />
          <Tile label="Раньше срока" value={loading ? '…' : ordersStats.early} hint="дата выдачи < дедлайна" />
          <Tile label="Просрочено" value={loading ? '…' : ordersStats.late} hint="дата выдачи > дедлайна" />
        </div>
      </GroupBox>

      {/* Materials */}
      <GroupBox title="Материалы">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-xs text-text-muted">Плёнка по типам, пог. м</p>
              <p className="text-2xl font-bold font-display tracking-tight">{totalFilmMeters.toFixed(1)}</p>
            </div>
            {filmByType.length === 0 ? (
              <p className="text-xs text-text-muted">Нет данных за период</p>
            ) : (
              <ul className="space-y-1.5">
                {filmByType.map(([type, meters]) => (
                  <li key={type} className="flex items-center justify-between text-sm">
                    <span className="text-text-muted">{FILM_TYPES[type]?.label || type}</span>
                    <span className="font-medium">{meters.toFixed(1)} м</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Tile label="Смола, кг" value={loading ? '…' : totalResinKg.toFixed(2)} />
        </div>
      </GroupBox>

      {/* 3D production stats */}
      <GroupBox title="Производство 3D">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Tile label="Произведено (факт)" value={loading ? '…' : producedQty} hint="упаковано + залито хороших" />
          <Tile
            label="Брак 3D, %"
            value={loading ? '…' : `${defects3D.ratio.toFixed(1)}%`}
            hint={`брак ${defects3D.bad} / ${defects3D.good + defects3D.bad}`}
          />
          <Tile
            label="Излишки 3D, %"
            value={loading ? '…' : `${surplus3D.ratio.toFixed(1)}%`}
            hint={`+${surplus3D.surplus} от тиража ${surplus3D.targetSum}`}
          />
        </div>
      </GroupBox>

      {/* Cost table */}
      <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
        <h3 className="font-semibold mb-3">Себестоимость материалов</h3>
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted">
                <th className="px-2 py-2 font-medium">Позиция</th>
                <th className="px-2 py-2 font-medium">Спецификация</th>
                <th className="px-2 py-2 font-medium text-right">Цена</th>
              </tr>
            </thead>
            <tbody>
              {MATERIAL_COSTS.map((m, idx) => (
                <tr key={idx} className="border-t border-border">
                  <td className="px-2 py-2">{m.name}</td>
                  <td className="px-2 py-2 text-text-muted text-xs">{m.spec}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{m.value} <span className="text-text-muted text-xs">{m.unit}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ExportDataModal isOpen={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  )
}
