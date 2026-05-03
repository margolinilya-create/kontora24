import { useState } from 'react'
import { useWorkSchedule, useOrdersCostReport, useBonusReport, useQualityReport } from '../hooks/useReports'
import { ORDER_TYPES } from '@/shared/constants'
import { formatPrice } from '@/shared/lib/utils'
import { exportCSV } from '@/shared/lib/export'
import Tabs from '@/shared/components/Tabs'
import Button from '@/shared/components/Button'
import Spinner from '@/shared/components/Spinner'

const REPORT_TABS = [
  { key: 'schedule', label: 'График работы' },
  { key: 'orders', label: 'Заказы' },
  { key: 'bonus', label: 'Премии' },
  { key: 'quality', label: 'Качество' },
]

const PERIOD_TABS = [
  { key: '7', label: '7 дней' },
  { key: '30', label: '30 дней' },
  { key: 'month', label: 'Этот месяц' },
]

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('schedule')
  const [period, setPeriod] = useState('30')

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Отчёты</h1>
          <p className="text-text-muted text-sm">Аналитика по персоналу и производству</p>
        </div>
        <Tabs items={PERIOD_TABS} active={period} onChange={setPeriod} />
      </div>

      <Tabs items={REPORT_TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'schedule' && <WorkScheduleReport period={period} />}
      {activeTab === 'orders' && <OrdersCostReport period={period} />}
      {activeTab === 'bonus' && <BonusReport period={period} />}
      {activeTab === 'quality' && <QualityReport period={period} />}
    </div>
  )
}

function WorkScheduleReport({ period }) {
  const { data, loading } = useWorkSchedule(period)
  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>
  if (data.length === 0) return <Empty text="Нет данных по сменам" />

  function handleExport() {
    const rows = data.map((w) => ({
      'Сотрудник': w.name,
      'Часов всего': (w.totalMinutes / 60).toFixed(1),
      ...Object.fromEntries(Object.entries(w.days).map(([day, min]) => [day, (min / 60).toFixed(1)])),
    }))
    exportCSV(rows, 'график-работы')
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">График работы</h2>
        <Button variant="secondary" size="sm" onClick={handleExport}>CSV</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">График работы персонала</caption>
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 font-medium text-text-muted">Сотрудник</th>
              <th className="text-right py-2 font-medium text-text-muted">Часов</th>
              {data[0] && Object.keys(data[0].days).map((day) => (
                <th key={day} className="text-right py-2 font-medium text-text-muted text-xs">{day}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((w) => (
              <tr key={w.name} className="border-b border-border last:border-0">
                <td className="py-2 font-medium">{w.name}</td>
                <td className="py-2 text-right font-semibold">{(w.totalMinutes / 60).toFixed(1)}</td>
                {Object.values(w.days).map((min, i) => (
                  <td key={i} className="py-2 text-right text-xs text-text-muted">{(min / 60).toFixed(1)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function OrdersCostReport({ period }) {
  const { data, loading } = useOrdersCostReport(period)
  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>
  if (data.length === 0) return <Empty text="Нет заказов" />

  function handleExport() {
    const rows = data.map((o) => ({
      '#': o.number, 'Тип': ORDER_TYPES[o.order_type]?.label, 'Тираж': o.qty,
      'Цена': o.price_final, 'Себестоимость': o.cost_total, 'Прибыль': o.profit,
      'Маржа %': o.margin_pct, 'Плёнка (м)': o.actual_film, 'Смола (г)': o.actual_resin,
    }))
    exportCSV(rows, 'заказы-рентабельность')
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Заказы и рентабельность</h2>
        <Button variant="secondary" size="sm" onClick={handleExport}>CSV</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Рентабельность заказов</caption>
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 font-medium text-text-muted">#</th>
              <th className="text-left py-2 font-medium text-text-muted">Тип</th>
              <th className="text-right py-2 font-medium text-text-muted">Тираж</th>
              <th className="text-right py-2 font-medium text-text-muted">Цена</th>
              <th className="text-right py-2 font-medium text-text-muted">С/С</th>
              <th className="text-right py-2 font-medium text-text-muted">Прибыль</th>
              <th className="text-right py-2 font-medium text-text-muted">Маржа</th>
              <th className="text-right py-2 font-medium text-text-muted">Плёнка</th>
              <th className="text-right py-2 font-medium text-text-muted">Смола</th>
            </tr>
          </thead>
          <tbody>
            {data.map((o) => (
              <tr key={o.id} className="border-b border-border last:border-0">
                <td className="py-2 font-medium">{o.number}</td>
                <td className="py-2 text-text-muted">{ORDER_TYPES[o.order_type]?.label}</td>
                <td className="py-2 text-right">{o.qty}</td>
                <td className="py-2 text-right">{formatPrice(o.price_final)}</td>
                <td className="py-2 text-right text-text-muted">{formatPrice(o.cost_total)}</td>
                <td className={`py-2 text-right font-medium ${o.profit >= 0 ? 'text-success' : 'text-danger'}`}>{formatPrice(o.profit)}</td>
                <td className={`py-2 text-right ${o.margin_pct >= 50 ? 'text-success' : o.margin_pct >= 30 ? '' : 'text-danger'}`}>{o.margin_pct}%</td>
                <td className="py-2 text-right text-text-muted">{o.actual_film > 0 ? `${o.actual_film.toFixed(1)}м` : '—'}</td>
                <td className="py-2 text-right text-text-muted">{o.actual_resin > 0 ? `${o.actual_resin.toFixed(0)}г` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function BonusReport({ period }) {
  const { data, loading } = useBonusReport(period)
  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>
  if (data.length === 0) return <Empty text="Нет данных по премиям" />

  function handleExport() {
    const rows = data.map((w) => ({
      'Сотрудник': w.name, 'Печать (шт)': w.print, 'Заливка (шт)': w.resin,
      'Сборка (шт)': w.assembly, 'Упаковка (шт)': w.packaging, 'Выборка (шт)': w.selection,
      'Премия': w.total.toFixed(0),
    }))
    exportCSV(rows, 'премии')
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Премии по сотрудникам</h2>
        <Button variant="secondary" size="sm" onClick={handleExport}>CSV</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Расчёт премий</caption>
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 font-medium text-text-muted">Сотрудник</th>
              <th className="text-right py-2 font-medium text-text-muted">Печать</th>
              <th className="text-right py-2 font-medium text-text-muted">Заливка</th>
              <th className="text-right py-2 font-medium text-text-muted">Сборка</th>
              <th className="text-right py-2 font-medium text-text-muted">Упаковка</th>
              <th className="text-right py-2 font-medium text-text-muted">Выборка</th>
              <th className="text-right py-2 font-medium text-accent">Премия</th>
            </tr>
          </thead>
          <tbody>
            {data.map((w) => (
              <tr key={w.name} className="border-b border-border last:border-0">
                <td className="py-2 font-medium">{w.name}</td>
                <td className="py-2 text-right">{w.print || '—'}</td>
                <td className="py-2 text-right">{w.resin || '—'}</td>
                <td className="py-2 text-right">{w.assembly || '—'}</td>
                <td className="py-2 text-right">{w.packaging || '—'}</td>
                <td className="py-2 text-right">{w.selection || '—'}</td>
                <td className="py-2 text-right font-bold text-accent">{formatPrice(w.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-text-muted mt-3">Ставки настраиваются в Настройки → ключ "bonus_rates"</p>
    </div>
  )
}

function QualityReport({ period }) {
  const { data, loading } = useQualityReport(period)
  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>
  if (data.length === 0) return <Empty text="Нет данных по качеству" />

  function handleExport() {
    const rows = data.map((o) => ({
      '#': o.number, 'Тираж': o.qty, 'Напечатано': o.printed, 'Залито': o.poured,
      'Хороших': o.good, 'Брак': o.rejected, 'Брак %': o.rejectPct,
      'Излишек': o.surplus, 'Излишек %': o.surplusPct,
    }))
    exportCSV(rows, 'качество')
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Качество печати и заливки</h2>
        <Button variant="secondary" size="sm" onClick={handleExport}>CSV</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Отчёт по качеству</caption>
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 font-medium text-text-muted">#</th>
              <th className="text-right py-2 font-medium text-text-muted">Тираж</th>
              <th className="text-right py-2 font-medium text-text-muted">Напечатано</th>
              <th className="text-right py-2 font-medium text-text-muted">Залито</th>
              <th className="text-right py-2 font-medium text-text-muted">Хороших</th>
              <th className="text-right py-2 font-medium text-text-muted">Брак</th>
              <th className="text-right py-2 font-medium text-text-muted">Брак %</th>
              <th className="text-right py-2 font-medium text-text-muted">Излишек</th>
            </tr>
          </thead>
          <tbody>
            {data.map((o) => (
              <tr key={o.id} className="border-b border-border last:border-0">
                <td className="py-2 font-medium">{o.number}</td>
                <td className="py-2 text-right">{o.qty}</td>
                <td className="py-2 text-right">{o.printed || '—'}</td>
                <td className="py-2 text-right">{o.poured || '—'}</td>
                <td className="py-2 text-right">{o.good || '—'}</td>
                <td className={`py-2 text-right ${o.rejected > 0 ? 'text-danger font-medium' : ''}`}>{o.rejected || '—'}</td>
                <td className={`py-2 text-right ${o.rejectPct > 20 ? 'text-danger font-medium' : o.rejectPct > 10 ? 'text-warning' : ''}`}>{o.rejectPct > 0 ? `${o.rejectPct}%` : '—'}</td>
                <td className="py-2 text-right text-text-muted">{o.surplus > 0 ? `+${o.surplus} (${o.surplusPct}%)` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Empty({ text }) {
  return (
    <div className="bg-surface rounded-xl border border-border p-12 text-center">
      <p className="text-text-muted">{text}</p>
    </div>
  )
}
