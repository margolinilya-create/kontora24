import { useState } from 'react'
import Modal from '@/shared/components/Modal'
import Button from '@/shared/components/Button'
import { supabase } from '@/shared/lib/supabase'
import { ORDER_TYPES, ORDER_STATUSES, FILM_TYPES, LAMINATION_TYPES, DELIVERY_TYPES, PRIORITIES, ORDER_SOURCES, PAYMENT_STATUSES } from '@/shared/constants'
import { downloadXlsx } from '@/shared/lib/export-xlsx'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'

const EXPORTS = [
  { id: 'orders_full', label: 'Полная таблица заказов' },
]

export function ExportDataModal({ isOpen, onClose }) {
  const [selected, setSelected] = useState(['orders_full'])
  const [loading, setLoading] = useState(false)

  function toggle(id) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  async function handleDownload() {
    if (selected.length === 0) {
      toast.error('Выберите хотя бы одну таблицу')
      return
    }
    setLoading(true)
    try {
      if (selected.includes('orders_full')) {
        await exportOrdersFull()
      }
      toast.success('Готово')
      onClose()
    } catch (err) {
      toast.error(translateError(err).message || err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Выгрузка данных" maxWidth="max-w-md">
      <p className="text-sm text-text-muted mb-4">Выберите таблицы для скачивания. Формат — Excel (.xlsx).</p>
      <div className="space-y-2 mb-5">
        {EXPORTS.map((e) => {
          const checked = selected.includes(e.id)
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => toggle(e.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:border-accent/40 transition-colors text-left"
            >
              <span className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                checked ? 'bg-accent border-accent text-on-accent' : 'border-border'
              }`} aria-hidden="true">
                {checked && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-3 h-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              <span className="text-sm font-medium text-text">{e.label}</span>
            </button>
          )
        })}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>Отмена</Button>
        <Button variant="primary" size="sm" loading={loading} onClick={handleDownload}>Скачать</Button>
      </div>
    </Modal>
  )
}

async function exportOrdersFull() {
  const { data, error } = await supabase
    .from('k24_orders')
    .select('*, client:k24_clients(name, phone), creator:k24_profiles!created_by(display_name), assignee:k24_profiles!assigned_to(display_name)')
    .order('created_at', { ascending: false })
  if (error) throw error

  const headers = [
    '№', 'Клиент', 'Тел.', 'Тип', 'Размер', 'Тираж', 'Плёнка', 'Ламинация',
    'Стикеров в паке', 'Видов', 'Срочность', 'Статус', 'Дата приёма',
    'Дедлайн', 'Менеджер', 'Исполнитель', 'Источник', 'Оплата', 'Отгрузка',
    'Город', 'Адрес', 'Цена', 'Себестоимость', 'Маржа', 'Bitrix ID', 'Комментарий',
  ]

  const rows = (data || []).map((o) => {
    const margin = (Number(o.price_final) || 0) - (Number(o.cost_total) || 0)
    return [
      o.number,
      o.client?.name || '',
      o.client?.phone || '',
      ORDER_TYPES[o.order_type]?.label || o.order_type,
      o.width_mm && o.height_mm ? `${o.width_mm}x${o.height_mm}` : '',
      o.qty || '',
      FILM_TYPES[o.film_type]?.label || o.film_type || '',
      LAMINATION_TYPES[o.lam_type]?.label || (o.need_lam ? 'Да' : 'Нет'),
      o.stickers_per_pack || '',
      o.design_variants || 1,
      PRIORITIES[o.priority]?.label || '',
      ORDER_STATUSES[o.status]?.label || o.status,
      o.created_at ? new Date(o.created_at).toLocaleDateString('ru-RU') : '',
      o.deadline ? new Date(o.deadline).toLocaleDateString('ru-RU') : '',
      o.creator?.display_name || '',
      o.assignee?.display_name || '',
      ORDER_SOURCES[o.source]?.label || '',
      PAYMENT_STATUSES[o.payment_status]?.label || '',
      DELIVERY_TYPES[o.delivery_type]?.label || '',
      o.delivery_city || '',
      o.delivery_address || '',
      Number(o.price_final) || 0,
      Number(o.cost_total) || 0,
      margin,
      o.bitrix_deal_id || '',
      o.notes || '',
    ]
  })

  await downloadXlsx(`orders-${new Date().toISOString().slice(0, 10)}`, 'Заказы', [headers, ...rows])
}
