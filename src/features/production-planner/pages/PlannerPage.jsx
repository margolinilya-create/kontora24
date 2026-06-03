// R12.3 — полноценная страница планировщика. Caркас: шапка (заголовок
// + БЕТА + легенда) → тулбар (фильтр типов + навигация) → грид
// 340|1fr (список заказов слева + календарь справа).
//
// DnD и панель деталей приедут в R12.5 / R12.6.

import { useEffect } from 'react'
import { ORDER_TYPES } from '@/shared/constants'
import Spinner from '@/shared/components/Spinner'
import { usePlannerData } from '../hooks/usePlannerData'
import { usePlanStore } from '../store/plan-store'
import { OrderList } from '../components/OrderList'
import { PlannerCalendar } from '../components/PlannerCalendar'

export default function PlannerPage() {
  usePlannerData() // первичная загрузка + realtime
  const loading = usePlanStore((s) => s.loading)
  const error = usePlanStore((s) => s.error)
  const filterType = usePlanStore((s) => s.filterType)
  const setFilterType = usePlanStore((s) => s.setFilterType)

  // Стор живёт между маунтами страницы — сбрасываем UI-фильтры при
  // первом монтировании этой сессии, чтобы не таскать прошлое.
  useEffect(() => {
    usePlanStore.getState().setSelectedOrderId(null)
    return () => {
      usePlanStore.getState().setSelectedOrderId(null)
    }
  }, [])

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem)]">
      {/* Шапка */}
      <div className="flex items-center gap-3 px-4 md:px-6 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <h1 className="text-lg md:text-xl font-bold uppercase tracking-tight">
          Планирование производства
        </h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide bg-amber-100 text-amber-800 border border-amber-300">
          бета
        </span>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-zinc-500">
          <Legend />
        </div>
      </div>

      {/* Тулбар */}
      <div className="flex items-center gap-3 px-4 md:px-6 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
        <label className="text-[11px] uppercase text-zinc-500 font-semibold">Тип:</label>
        <select
          value={filterType || ''}
          onChange={(e) => setFilterType(e.target.value || null)}
          className="text-sm px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
        >
          <option value="">все типы</option>
          {Object.entries(ORDER_TYPES).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* Тело */}
      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <Spinner />
        </div>
      ) : error ? (
        <div className="flex items-center justify-center flex-1 p-6">
          <div className="text-sm text-red-700">
            Ошибка загрузки: {error.message || String(error)}
          </div>
        </div>
      ) : (
        <div className="grid flex-1 overflow-hidden md:grid-cols-[340px_1fr] grid-rows-[40vh_1fr] md:grid-rows-1">
          <div className="overflow-auto border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800">
            <OrderList />
          </div>
          <div className="overflow-auto">
            <PlannerCalendar />
          </div>
        </div>
      )}
    </div>
  )
}

function Legend() {
  return (
    <div className="flex items-center gap-2">
      <LegendItem className="bg-emerald-50 border border-emerald-300">≤85%</LegendItem>
      <LegendItem className="bg-amber-50 border border-amber-300">≤100%</LegendItem>
      <LegendItem className="bg-red-50 border border-red-300">&gt;100%</LegendItem>
      <span className="opacity-50">·</span>
      <span>🚩 срок</span>
      <span>📌 закреплено</span>
    </div>
  )
}

function LegendItem({ children, className }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] ${className}`}>{children}</span>
  )
}
