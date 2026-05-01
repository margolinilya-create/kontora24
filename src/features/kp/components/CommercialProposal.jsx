import { useState, useEffect } from 'react'
import { ORDER_TYPES } from '@/shared/constants'
import { toast } from '@/shared/stores/toast-store'
import Modal from '@/shared/components/Modal'
import Input from '@/shared/components/Input'
import Button from '@/shared/components/Button'

const KP_TEMPLATES = {
  standard: {
    label: 'Стандартный',
    generate: (order, clientName) => {
      const name = clientName || 'клиент'
      return `Здравствуйте, ${name}!

Стоимость заказа:
${ORDER_TYPES[order.order_type]?.label || order.order_type}
Размер: ${order.width_mm}x${order.height_mm} мм
Тираж: ${order.qty} шт
${order.need_lam ? `Ламинация: ${order.lam_type === 'matte' ? 'матовая' : 'глянцевая'}` : ''}

Итого: ${Number(order.price_final).toLocaleString('ru-RU')} руб.
Цена за шт: ${Number(order.price_per_unit).toLocaleString('ru-RU')} руб.
Срок изготовления: ${order.prod_days} рабочих дней

С уважением,
Контора24`
    },
  },
  detailed: {
    label: 'Подробный',
    generate: (order, clientName) => {
      const name = clientName || 'клиент'
      return `Добрый день, ${name}!

Благодарим за обращение. Подготовили для вас коммерческое предложение.

Продукция: ${ORDER_TYPES[order.order_type]?.label || order.order_type}
Размер изделия: ${order.width_mm}x${order.height_mm} мм
Количество: ${order.qty} шт
Варианты дизайна: ${order.design_variants || 1}
${order.need_lam ? `Ламинация: ${order.lam_type === 'matte' ? 'матовая' : 'глянцевая'}` : 'Без ламинации'}

Стоимость:
— Себестоимость материалов: ${Number(order.cost_materials).toLocaleString('ru-RU')} руб.
— Работа: ${Number(order.cost_labor).toLocaleString('ru-RU')} руб.
${order.discount_pct ? `— Скидка: ${Math.round(order.discount_pct * 100)}%` : ''}
— Итого: ${Number(order.price_final).toLocaleString('ru-RU')} руб. (${Number(order.price_per_unit).toLocaleString('ru-RU')} руб./шт)

Срок изготовления: ${order.prod_days} рабочих дней
${order.deadline ? `Дедлайн: ${new Date(order.deadline).toLocaleDateString('ru-RU')}` : ''}

Будем рады сотрудничеству!
Контора24`
    },
  },
  short: {
    label: 'Краткий',
    generate: (order) => `${ORDER_TYPES[order.order_type]?.label}: ${order.qty} шт, ${order.width_mm}x${order.height_mm} мм
Цена: ${Number(order.price_final).toLocaleString('ru-RU')} руб. (${Number(order.price_per_unit).toLocaleString('ru-RU')} руб./шт)
Срок: ${order.prod_days} дн`,
  },
}

const TEMPLATE_KEYS = Object.keys(KP_TEMPLATES)

export function CommercialProposal({ order, onClose }) {
  const [clientName, setClientName] = useState(order?.client?.name || '')
  const [templateKey, setTemplateKey] = useState('standard')
  const [text, setText] = useState('')

  useEffect(() => {
    if (order) {
      setText(KP_TEMPLATES[templateKey].generate(order, clientName))
    }
  }, [templateKey, clientName, order])

  if (!order) return null

  function handleCopy() {
    navigator.clipboard.writeText(text)
    toast.success('КП скопировано в буфер обмена')
  }

  return (
    <Modal isOpen={true} onClose={onClose} title="Коммерческое предложение" maxWidth="max-w-lg">
      <div className="space-y-4">
        {/* Template selector */}
        <div>
          <label className="block text-sm font-medium text-text mb-1">Шаблон</label>
          <div className="flex gap-1.5">
            {TEMPLATE_KEYS.map((key) => (
              <button
                key={key}
                onClick={() => setTemplateKey(key)}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                  templateKey === key
                    ? 'bg-accent text-white'
                    : 'bg-surface-dim text-text-muted hover:text-text'
                }`}
              >
                {KP_TEMPLATES[key].label}
              </button>
            ))}
          </div>
        </div>

        <Input
          label="Имя клиента"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          placeholder="Имя клиента"
        />

        {/* Preview */}
        <div className="bg-surface-dim rounded-lg p-4 text-sm whitespace-pre-wrap font-mono leading-relaxed">
          {text}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mt-5 pt-5 border-t border-border">
        <Button onClick={handleCopy} className="flex-1">
          Копировать текст
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Закрыть
        </Button>
      </div>
    </Modal>
  )
}
