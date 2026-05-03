import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useOrderDetail, updateOrder } from '../hooks/useOrders'
import { StatusBadge } from '../components/StatusBadge'
import { StatusSwitcher } from '../components/StatusSwitcher'
import { OrderPdfExport } from '../components/OrderPdfExport'
import { OrderInfoTab } from '../components/OrderInfoTab'
import { OrderProgressTab } from '../components/OrderProgressTab'
import { OrderReportsTab } from '../components/OrderReportsTab'
import Spinner from '@/shared/components/Spinner'
import Tabs from '@/shared/components/Tabs'
import { calculate } from '@/features/calculator/lib/calculator'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/stores/toast-store'
import { formatPrice } from '@/shared/lib/utils'

const ORDER_TABS = [
  { key: 'info', label: 'Информация' },
  { key: 'progress', label: 'Прогресс' },
  { key: 'reports', label: 'Отчёты' },
]

export default function OrderDetailPage() {
  const { id } = useParams()
  const { order, history, loading, refetch } = useOrderDetail(id)
  const [activeTab, setActiveTab] = useState('info')
  const [recalculating, setRecalculating] = useState(false)

  async function handleRecalculate() {
    if (!order) return
    setRecalculating(true)
    try {
      const [settingsRes, markupsRes] = await Promise.all([
        supabase.from('k24_settings').select('value').eq('key', 'calculator').single(),
        supabase.from('k24_settings').select('value').eq('key', 'markups').single(),
      ])
      const overrides = settingsRes.data?.value || {}
      const markups = markupsRes.data?.value || {}

      const is3D = order.order_type?.includes('3D') || false
      const markupOverride = markups[order.order_type]

      const result = calculate({
        width: order.width_mm, height: order.height_mm, qty: order.qty,
        orderType: order.order_type, needLam: order.need_lam || false, is3D, overrides,
      })

      let finalResult = result
      if (markupOverride && markupOverride !== result.markup) {
        const priceFinal = Math.round(result.costTotal * markupOverride * (1 - result.discount))
        const pricePerUnit = order.qty > 0 ? Math.round(priceFinal / order.qty) : 0
        finalResult = { ...result, markup: markupOverride, priceFinal, pricePerUnit }
      }

      await updateOrder(order.id, {
        cost_materials: finalResult.costMaterials, cost_labor: finalResult.costLabor,
        cost_total: finalResult.costTotal, price_final: finalResult.priceFinal,
        price_per_unit: finalResult.pricePerUnit, markup: finalResult.markup,
        discount_pct: finalResult.discount, prod_days: finalResult.prodDays,
      })

      toast.success(`Пересчитано: ${formatPrice(order.price_final)} → ${formatPrice(finalResult.priceFinal)}`)
      refetch()
    } catch (err) {
      toast.error('Ошибка: ' + (err.message || 'Неизвестная ошибка'))
    } finally {
      setRecalculating(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Spinner /></div>
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-2">Заказ не найден</h2>
        <Link to="/orders" className="text-accent hover:underline">← К списку заказов</Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/orders" className="text-text-muted hover:text-text transition-colors text-sm">← Заказы</Link>
          <h1 className="text-2xl font-bold">Заказ #{order.number}</h1>
          <StatusBadge status={order.status} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {order.bitrix_url && (
            <a href={order.bitrix_url} target="_blank" rel="noopener noreferrer"
              className="border border-border text-text hover:bg-surface-dim font-medium rounded-lg px-3 py-2 text-sm transition-colors">
              Bitrix24
            </a>
          )}
          <OrderPdfExport order={order} />
          <Link
            to={`/calculator?width=${order.width_mm}&height=${order.height_mm}&qty=${order.qty}&type=${order.order_type}`}
            className="border border-border text-text hover:bg-surface-dim font-medium rounded-lg px-3 py-2 text-sm transition-colors"
          >
            Повторить
          </Link>
          <StatusSwitcher order={order} onUpdated={refetch} />
        </div>
      </div>

      {/* Tabs */}
      <Tabs items={ORDER_TABS} active={activeTab} onChange={setActiveTab} />

      {/* Tab content */}
      {activeTab === 'info' && (
        <OrderInfoTab order={order} onRecalculate={handleRecalculate} recalculating={recalculating} onSaved={refetch} />
      )}
      {activeTab === 'progress' && (
        <OrderProgressTab order={order} history={history} onUpdated={refetch} />
      )}
      {activeTab === 'reports' && (
        <OrderReportsTab order={order} onUpdated={refetch} />
      )}
    </div>
  )
}
