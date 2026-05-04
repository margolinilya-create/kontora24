import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/shared/lib/supabase'
import { ORDER_TYPES, ORDER_STATUSES, FILM_TYPES } from '@/shared/constants'
import { StatusBadge } from '@/features/orders/components/StatusBadge'
import Spinner from '@/shared/components/Spinner'

const STAGE_FILTERS = [
  { value: '', label: 'Все этапы' },
  { value: 'new', label: 'Новый' },
  { value: 'design', label: 'Дизайн' },
  { value: 'prepress', label: 'Препресс' },
  { value: 'print', label: 'Печать' },
  { value: 'lamination', label: 'Ламинация' },
  { value: 'cutting', label: 'Резка' },
  { value: 'pouring', label: 'Заливка' },
  { value: 'selection_pouring', label: 'Выборка / Заливка' },
  { value: 'assembly_3d', label: 'Сборка 3D' },
  { value: 'packaging', label: 'Упаковка' },
  { value: 'otk', label: 'ОТК' },
  { value: 'done', label: 'Готово' },
]

const TYPE_FILTERS = [
  { value: '', label: 'Все типы' },
  ...Object.entries(ORDER_TYPES).map(([key, val]) => ({ value: key, label: val.label })),
]

function aggregateLogs(logs) {
  let filmMeters = 0
  let lamMeters = 0
  let resinGrams = 0
  let defects = 0
  let stickersPrinted = 0
  let backgroundsPrinted = 0
  let qtyCut = 0
  let stickersPoured = 0
  let stickersGood = 0
  let packsAssembled = 0
  let packsPackaged = 0
  const workers = new Set()

  for (const log of logs) {
    filmMeters += Number(log.film_meters) || 0
    lamMeters += Number(log.lamination_meters) || 0
    resinGrams += Number(log.resin_grams) || 0
    defects += Number(log.defects) || 0
    stickersPrinted += Number(log.stickers_printed) || 0
    backgroundsPrinted += Number(log.backgrounds_printed) || 0
    qtyCut += Number(log.qty_cut) || 0
    stickersPoured += Number(log.stickers_poured) || 0
    stickersGood += Number(log.stickers_good) || 0
    packsAssembled += Number(log.packs_assembled) || 0
    packsPackaged += Number(log.packs_packaged) || 0
    if (log.worker?.display_name) workers.add(log.worker.display_name)
  }

  return {
    filmMeters, lamMeters, resinGrams, defects,
    stickersPrinted, backgroundsPrinted, qtyCut,
    stickersPoured, stickersGood, packsAssembled, packsPackaged,
    workers: [...workers],
  }
}

export function ProductionJournalTab() {
  const [orders, setOrders] = useState([])
  const [logs, setLogs] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [workerFilter, setWorkerFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [ordersRes, logsRes, profilesRes] = await Promise.all([
      supabase
        .from('k24_orders')
        .select('id, number, order_type, status, qty, width_mm, height_mm, film_type, lam_type, client:k24_clients(name), deadline, created_at')
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false }),
      supabase
        .from('k24_production_logs')
        .select('*, worker:k24_profiles!worker_id(display_name)')
        .order('created_at', { ascending: false }),
      supabase
        .from('k24_profiles')
        .select('id, display_name, role')
        .in('role', ['designer', 'printer', 'post_printer']),
    ])
    setOrders(ordersRes.data || [])
    setLogs(logsRes.data || [])
    setProfiles(profilesRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Group logs by order_id
  const logsByOrder = useMemo(() => {
    const map = {}
    for (const log of logs) {
      if (!map[log.order_id]) map[log.order_id] = []
      map[log.order_id].push(log)
    }
    return map
  }, [logs])

  // All unique worker names from profiles
  const workerOptions = useMemo(() => {
    return profiles.map(p => ({ value: p.id, label: p.display_name }))
  }, [profiles])

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      if (stageFilter && order.status !== stageFilter) return false
      if (typeFilter && order.order_type !== typeFilter) return false
      if (dateFrom && order.created_at < dateFrom) return false
      if (dateTo && order.created_at > dateTo + 'T23:59:59') return false
      if (workerFilter) {
        const orderLogs = logsByOrder[order.id] || []
        const hasWorker = orderLogs.some(l => l.worker_id === workerFilter)
        if (!hasWorker) return false
      }
      return true
    })
  }, [orders, stageFilter, typeFilter, dateFrom, dateTo, workerFilter, logsByOrder])

  // Totals
  const totals = useMemo(() => {
    let filmMeters = 0, lamMeters = 0, resinGrams = 0, defects = 0
    for (const order of filteredOrders) {
      const agg = aggregateLogs(logsByOrder[order.id] || [])
      filmMeters += agg.filmMeters
      lamMeters += agg.lamMeters
      resinGrams += agg.resinGrams
      defects += agg.defects
    }
    return { filmMeters, lamMeters, resinGrams, defects }
  }, [filteredOrders, logsByOrder])

  if (loading) {
    return <div className="flex justify-center py-12"><Spinner /></div>
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-surface rounded-xl border border-border p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs text-text-muted mb-1">Дата от</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Дата до</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Этап</label>
            <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text">
              {STAGE_FILTERS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Работник</label>
            <select value={workerFilter} onChange={e => setWorkerFilter(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text">
              <option value="">Все</option>
              {workerOptions.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Тип заказа</label>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text">
              {TYPE_FILTERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-xs text-text-muted">Заказов</p>
          <p className="text-2xl font-bold">{filteredOrders.length}</p>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-xs text-text-muted">Плёнка</p>
          <p className="text-2xl font-bold">{totals.filmMeters.toFixed(1)} <span className="text-sm font-normal text-text-muted">м</span></p>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-xs text-text-muted">Смола</p>
          <p className="text-2xl font-bold">{totals.resinGrams.toFixed(0)} <span className="text-sm font-normal text-text-muted">г</span></p>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-xs text-text-muted">Брак</p>
          <p className="text-2xl font-bold text-danger">{totals.defects} <span className="text-sm font-normal">шт</span></p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-4 py-3 font-medium text-text-muted">#</th>
              <th className="px-4 py-3 font-medium text-text-muted">Тип</th>
              <th className="px-4 py-3 font-medium text-text-muted">Клиент</th>
              <th className="px-4 py-3 font-medium text-text-muted">Статус</th>
              <th className="px-4 py-3 font-medium text-text-muted text-right">Тираж</th>
              <th className="px-4 py-3 font-medium text-text-muted text-right">Плёнка (м)</th>
              <th className="px-4 py-3 font-medium text-text-muted text-right">Лам (м)</th>
              <th className="px-4 py-3 font-medium text-text-muted text-right">Смола (г)</th>
              <th className="px-4 py-3 font-medium text-text-muted text-right">Брак</th>
              <th className="px-4 py-3 font-medium text-text-muted">Работники</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-text-muted">Нет заказов</td>
              </tr>
            ) : (
              filteredOrders.map(order => {
                const agg = aggregateLogs(logsByOrder[order.id] || [])
                return (
                  <tr key={order.id} className="border-b border-border last:border-0 hover:bg-surface-dim transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/orders/${order.id}`} className="font-medium text-accent hover:underline">
                        {order.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{ORDER_TYPES[order.order_type]?.label || order.order_type}</td>
                    <td className="px-4 py-3 text-text-muted truncate max-w-[120px]">{order.client?.name || '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                    <td className="px-4 py-3 text-right">{order.qty}</td>
                    <td className="px-4 py-3 text-right">{agg.filmMeters > 0 ? agg.filmMeters.toFixed(1) : '—'}</td>
                    <td className="px-4 py-3 text-right">{agg.lamMeters > 0 ? agg.lamMeters.toFixed(1) : '—'}</td>
                    <td className="px-4 py-3 text-right">{agg.resinGrams > 0 ? agg.resinGrams.toFixed(0) : '—'}</td>
                    <td className="px-4 py-3 text-right">{agg.defects > 0 ? <span className="text-danger font-medium">{agg.defects}</span> : '—'}</td>
                    <td className="px-4 py-3 text-text-muted text-xs">{agg.workers.length > 0 ? agg.workers.join(', ') : '—'}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
