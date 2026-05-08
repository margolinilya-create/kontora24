import { useState } from 'react'
import Modal from '@/shared/components/Modal'
import Button from '@/shared/components/Button'
import { supabase } from '@/shared/lib/supabase'
import { ORDER_TYPES, ORDER_STATUSES, FILM_TYPES, LAMINATION_TYPES, DELIVERY_TYPES, PRIORITIES, ORDER_SOURCES, PAYMENT_STATUSES, calculateActualMaterialsCost } from '@/shared/constants'
import { downloadXlsx } from '@/shared/lib/export-xlsx'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'

const EXPORTS = [
  { id: 'orders_full', label: 'Полная таблица заказов (с фактическим расходом материалов)' },
  { id: 'materials_log', label: 'Журнал расхода материалов (по логам)' },
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
      if (selected.includes('materials_log')) {
        await exportMaterialsLog()
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

const EXPORT_LIMIT = 5000

async function exportOrdersFull() {
  const [{ data: orders, error, count }, { data: logs, error: logsErr }] = await Promise.all([
    supabase
      .from('k24_orders')
      .select('*, client:k24_clients(name, phone), creator:k24_profiles!created_by(display_name), assignee:k24_profiles!assigned_to(display_name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(EXPORT_LIMIT),
    supabase
      .from('k24_production_logs')
      .select('order_id, stage, film_type, film_meters, lamination_meters, resin_grams')
      .is('deleted_at', null)
      .limit(EXPORT_LIMIT * 5),
  ])
  if (error) throw error
  if (logsErr) throw logsErr
  if (count && count > EXPORT_LIMIT) {
    toast.error(`Выгружено только ${EXPORT_LIMIT} последних заказов из ${count}. Используйте фильтры для выгрузки старых заказов.`)
  }

  // Группируем логи по order_id для быстрого поиска
  const logsByOrder = {}
  for (const l of logs || []) {
    if (!logsByOrder[l.order_id]) logsByOrder[l.order_id] = []
    logsByOrder[l.order_id].push(l)
  }

  const headers = [
    '№', 'Клиент', 'Тел.', 'Тип', 'Размер', 'Тираж', 'Плёнка', 'Ламинация',
    'Стикеров в паке', 'Видов', 'Срочность', 'Статус', 'Дата приёма',
    'Дедлайн', 'Менеджер', 'Исполнитель', 'Источник', 'Оплата', 'Отгрузка',
    'Город', 'Адрес', 'Цена', 'Себестоимость', 'Маржа', 'Bitrix ID', 'Комментарий',
    // Фактический расход материалов из production logs
    'Факт. плёнка (м)', 'Факт. ламинация (м)', 'Факт. смола (г)', 'Себестоимость материалов (₽)',
  ]

  const rows = (orders || []).map((o) => {
    const orderLogs = logsByOrder[o.id] || []
    const filmMeters = orderLogs.reduce((s, l) => s + (Number(l.film_meters) || 0), 0)
    const lamMeters = orderLogs.reduce((s, l) => s + (Number(l.lamination_meters) || 0), 0)
    const resinGrams = orderLogs.reduce((s, l) => s + (Number(l.resin_grams) || 0), 0)
    const actual = calculateActualMaterialsCost(orderLogs, o.film_type)
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
      filmMeters > 0 ? Number(filmMeters.toFixed(2)) : '',
      lamMeters > 0 ? Number(lamMeters.toFixed(2)) : '',
      resinGrams > 0 ? Number(resinGrams.toFixed(0)) : '',
      actual.total > 0 ? Number(actual.total.toFixed(2)) : '',
    ]
  })

  await downloadXlsx(`orders-${new Date().toISOString().slice(0, 10)}`, 'Заказы', [headers, ...rows])
}

async function exportMaterialsLog() {
  const { data, error } = await supabase
    .from('k24_production_logs')
    .select('created_at, stage, film_type, film_meters, lamination_meters, resin_grams, defects, worker:k24_profiles!worker_id(display_name), order:k24_orders!order_id(number)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(2000)
  if (error) throw error

  const headers = ['Дата', 'Заказ', 'Этап', 'Тип плёнки', 'Плёнка (м)', 'Ламинация (м)', 'Смола (г)', 'Брак', 'Сотрудник']
  const rows = (data || [])
    .filter((l) => Number(l.film_meters) > 0 || Number(l.lamination_meters) > 0 || Number(l.resin_grams) > 0)
    .map((l) => [
      new Date(l.created_at).toLocaleString('ru-RU'),
      l.order?.number ?? '',
      ORDER_STATUSES[l.stage]?.label || l.stage,
      FILM_TYPES[l.film_type]?.label || l.film_type || '',
      Number(l.film_meters) > 0 ? Number(Number(l.film_meters).toFixed(2)) : '',
      Number(l.lamination_meters) > 0 ? Number(Number(l.lamination_meters).toFixed(2)) : '',
      Number(l.resin_grams) > 0 ? Number(Number(l.resin_grams).toFixed(0)) : '',
      Number(l.defects) || '',
      l.worker?.display_name || '',
    ])

  await downloadXlsx(`materials-log-${new Date().toISOString().slice(0, 10)}`, 'Расход материалов', [headers, ...rows])
}
