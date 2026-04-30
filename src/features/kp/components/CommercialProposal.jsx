import { useState } from 'react'
import { formatOrderType } from '@/features/techcard/utils'
import { formatPrice } from '@/shared/lib/utils'
import { toast } from '@/shared/stores/toast-store'

export function CommercialProposal({ order, onClose }) {
  const [clientName, setClientName] = useState(order?.client?.name || '')

  if (!order) return null

  function handleCopy() {
    const text = generateKPText(order, clientName)
    navigator.clipboard.writeText(text)
    toast.success('КП скопировано в буфер обмена')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-surface rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-semibold">Коммерческое предложение</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text text-xl leading-none">&times;</button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Имя клиента</label>
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
              placeholder="Имя клиента"
            />
          </div>

          {/* Preview */}
          <div className="bg-surface-dim rounded-lg p-4 text-sm whitespace-pre-wrap font-mono leading-relaxed">
            {generateKPText(order, clientName)}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 p-5 border-t border-border">
          <button
            onClick={handleCopy}
            className="flex-1 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg py-2.5 text-sm transition-colors"
          >
            Копировать текст
          </button>
          <button
            onClick={onClose}
            className="px-4 border border-border text-text-muted hover:bg-surface-dim font-medium rounded-lg py-2.5 text-sm transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}

function generateKPText(order, clientName) {
  const name = clientName || 'клиент'
  const type = formatOrderType(order.order_type)
  const size = `${order.width_mm}×${order.height_mm} мм`
  const price = formatPrice(order.price_final)
  const perUnit = formatPrice(order.price_per_unit)
  const days = order.prod_days || '—'

  return `Здравствуйте, ${name}!

Подготовили для вас расчёт:

📋 ${type}
📐 Размер: ${size}
📦 Тираж: ${order.qty} шт
${order.need_lam ? '✨ Ламинация: да\n' : ''}${order.order_type?.includes('3D') ? '💎 3D эффект: да\n' : ''}
💰 Стоимость: ${price}
   (${perUnit} за шт.)

⏱ Срок изготовления: ${days} дн.

С уважением,
Контора — стикерное производство`
}
