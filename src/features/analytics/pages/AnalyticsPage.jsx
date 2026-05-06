import { useState, useEffect } from 'react'
import { useAnalyticsData, PERIODS } from '../hooks/useAnalyticsData'
import { StatCard } from '../components/StatCard'
import { FinanceTab } from '../components/FinanceTab'
import { ProductionTab } from '../components/ProductionTab'
import { ResourcesTab } from '../components/ResourcesTab'
import { formatPrice } from '@/shared/lib/utils'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import Tabs from '@/shared/components/Tabs'
import Button from '@/shared/components/Button'
import Spinner from '@/shared/components/Spinner'
import ErrorState from '@/shared/components/ErrorState'

const TABS = [
  { key: 'finance', label: 'Финансы' },
  { key: 'production', label: 'Производство' },
  { key: 'resources', label: 'Ресурсы' },
]

function getThemeColor(varName) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState('30d')
  const [activeTab, setActiveTab] = useState('finance')
  const [chartColors, setChartColors] = useState({ grid: '#e5e7eb', tooltipBorder: '#e5e7eb', tooltipBg: '#ffffff' })

  useEffect(() => {
    setChartColors({
      grid: getThemeColor('--color-chart-grid') || '#e5e7eb',
      tooltipBorder: getThemeColor('--color-chart-tooltip-border') || '#e5e7eb',
      tooltipBg: getThemeColor('--color-chart-tooltip-bg') || '#ffffff',
    })
  }, [])

  const analytics = useAnalyticsData(period)

  if (analytics.loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    )
  }

  if (analytics.error) {
    return <ErrorState error={analytics.error} onRetry={analytics.refetch} />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Аналитика</h1>
          <p className="text-text-muted">Финансы и производственные метрики</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              try {
                const { jsPDF } = await import('jspdf')
                const doc = new jsPDF('p', 'mm', 'a4')
                doc.setFontSize(16); doc.setFont('helvetica', 'bold')
                doc.text('Kontora24 — Аналитика', 15, 20)
                doc.setFontSize(10); doc.setFont('helvetica', 'normal')
                doc.text(`Период: ${PERIODS.find((p) => p.key === period)?.label}`, 15, 28)
                let y = 38
                const rows = [
                  ['Выручка', formatPrice(analytics.revenue)],
                  ['Себестоимость', formatPrice(analytics.totalCost)],
                  ['Маржа', formatPrice(analytics.revenue - analytics.totalCost)],
                  ['Заказов', String(analytics.orders.length)],
                  ['Средний чек', formatPrice(analytics.avgCheck)],
                  ['Конверсия', `${analytics.conversionRate}%`],
                ]
                rows.forEach(([l, v]) => { doc.text(l + ':', 15, y); doc.text(v, 80, y); y += 6 })
                y += 5
                if (analytics.typeData.length > 0) {
                  doc.setFont('helvetica', 'bold'); doc.text('Маржинальность по типам', 15, y); y += 7
                  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
                  analytics.typeData.forEach((r) => {
                    doc.text(`${r.name}: ${r.count} заказов, выручка ${formatPrice(r.revenue)}, маржа ${formatPrice(r.margin)}`, 15, y); y += 5
                  })
                }
                doc.setFontSize(7); doc.setTextColor(150)
                doc.text(`Kontora24 · ${new Date().toLocaleDateString('ru-RU')}`, 15, 285)
                doc.save('analytics.pdf')
                toast.success('PDF экспортирован')
              } catch (e) { toast.error(translateError(e).message) }
            }}
          >
            PDF
          </Button>
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                period === p.key ? 'bg-primary text-white' : 'bg-surface border border-border text-text-muted hover:bg-surface-dim'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Выручка" value={formatPrice(analytics.revenue)} sub={analytics.revenueDelta !== null ? `${analytics.revenueDelta > 0 ? '+' : ''}${analytics.revenueDelta}% к прошлому` : null} />
        <StatCard label="Себестоимость" value={formatPrice(analytics.totalCost)} />
        <StatCard label="Маржа" value={formatPrice(analytics.revenue - analytics.totalCost)} accent />
        <StatCard label="Заказов" value={analytics.orders.length} sub={analytics.prevOrders?.length > 0 ? `было ${analytics.prevOrders.length}` : null} />
        <StatCard label="Средний чек" value={formatPrice(analytics.avgCheck)} />
        <StatCard label="Конверсия" value={`${analytics.conversionRate}%`} sub={`${analytics.cancelledCount} отмен`} />
      </div>

      <Tabs items={TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'finance' && (
        <FinanceTab
          typeData={analytics.typeData}
          trendData={analytics.trendData}
          topClients={analytics.topClients}
          chartColors={chartColors}
        />
      )}

      {activeTab === 'production' && (
        <ProductionTab
          statusData={analytics.statusData}
          avgStageData={analytics.avgStageData}
          workloadData={analytics.workloadData}
          throughputData={analytics.throughputData}
          orders={analytics.orders}
          doneOrders={analytics.doneOrders}
          conversionRate={analytics.conversionRate}
          chartColors={chartColors}
        />
      )}

      {activeTab === 'resources' && (
        <ResourcesTab matData={analytics.matData} />
      )}
    </div>
  )
}
