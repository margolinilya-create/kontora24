// Страница /orders/create. R25.6: сама форма — общий компонент CreateOrderForm
// (тот же используется в попапе «Создать заказ» калькулятора).
import { useNavigate } from 'react-router-dom'
import { toast } from '@/shared/stores/toast-store'
import { formatOrderNumber } from '@/shared/lib/utils'
import { CreateOrderForm } from '../components/CreateOrderForm'

export default function CreateOrderPage() {
  const navigate = useNavigate()

  function handleCreated(order) {
    toast.success(`Заказ ${formatOrderNumber(order)} создан`)
    navigate(`/orders/${order.id}`)
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight">Новый заказ</h1>
          <p className="text-text-muted text-sm">Заполните параметры и создайте заказ</p>
        </div>
        <button
          type="button"
          disabled
          title="Bitrix24 пока не подключён"
          className="border border-border bg-surface text-text-muted/60 rounded-lg px-3 py-2 text-sm cursor-not-allowed"
        >
          Заполнить из Bitrix
        </button>
      </div>

      <CreateOrderForm
        onCreated={handleCreated}
        onCancel={() => navigate('/orders')}
      />
    </div>
  )
}
