import { useState } from 'react'
import Modal from '@/shared/components/Modal'
import Button from '@/shared/components/Button'
import { supabase } from '@/shared/lib/supabase'
import { FILM_TYPES, getStatusMeta } from '@/shared/constants'
import { downloadXlsx } from '@/shared/lib/export-xlsx'
import { fetchAllRowsByIds } from '@/shared/lib/fetch-all'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { captureError } from '@/shared/lib/sentry'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import { buildOrdersFullAoa } from '../lib/orders-export'
import { localIsoDate } from '@/shared/lib/period'

const EXPORTS = [
  { id: 'orders_full', label: 'Полная таблица заказов (с фактическим расходом материалов)' },
  { id: 'materials_log', label: 'Расход материалов по записям цеха' },
]

export function ExportDataModal({ isOpen, onClose }) {
  const [selected, setSelected] = useState(['orders_full'])
  const [loading, setLoading] = useState(false)
  const canFinance = useCanDo('view:finance')

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
        await exportOrdersFull({ canFinance })
      }
      if (selected.includes('materials_log')) {
        await exportMaterialsLog()
      }
      toast.success('Готово')
      onClose()
    } catch (err) {
      captureError(err, { tags: { source: 'analytics.ExportDataModal' } })
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
const MATERIALS_LOG_LIMIT = 2000

const ORDERS_FULL_SELECT = '*, client:k24_clients(name, phone), creator:k24_profiles!created_by(display_name), assignee:k24_profiles!assigned_to(display_name)'

async function exportOrdersFull({ canFinance }) {
  // Через маскирующее view: select('*') на базовой таблице после миграции
  // 072 упал бы 42501 (финколонки отозваны). На view '*' легален (грант
  // цельный, финансы NULL для не-менеджера). Финансовые колонки в файл
  // попадают только с правом view:finance (buildOrdersFullAoa).
  // Порциями по 1000: PostgREST отдаёт ≤ 1000 строк — limit(5000) молча
  // резался до тысячи.
  const list = []
  let total = null
  for (let from = 0; from < EXPORT_LIMIT; from += 1000) {
    const { data, error, count } = await supabase
      .from('k24_orders_full')
      .select(ORDERS_FULL_SELECT, from === 0 ? { count: 'exact' } : undefined)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, Math.min(from + 999, EXPORT_LIMIT - 1))
    if (error) throw error
    if (from === 0) total = count
    list.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  if (total && total > EXPORT_LIMIT) {
    toast.error(`Выгружено только ${EXPORT_LIMIT} последних заказов из ${total}. Используйте фильтры для выгрузки старых заказов.`)
  }

  // Логи — только по выгружаемым заказам, все порциями.
  const logs = await fetchAllRowsByIds(list.map((o) => o.id), (ids) => supabase
    .from('k24_production_logs')
    .select('id, order_id, stage, film_type, film_meters, lamination_meters, resin_grams')
    .is('deleted_at', null)
    .in('order_id', ids)
    .order('created_at').order('id'))

  const aoa = buildOrdersFullAoa(list, logs, { canFinance })
  await downloadXlsx(`orders-${localIsoDate()}`, 'Заказы', aoa)
}

async function exportMaterialsLog() {
  // Последние 2000 записей — двумя порциями (limit(2000) резался до 1000).
  const data = []
  for (let from = 0; from < MATERIALS_LOG_LIMIT; from += 1000) {
    const { data: page, error } = await supabase
      .from('k24_production_logs')
      .select('id, created_at, stage, film_type, film_meters, lamination_meters, resin_grams, defects, worker:k24_profiles!worker_id(display_name), order:k24_orders!order_id(number)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, Math.min(from + 999, MATERIALS_LOG_LIMIT - 1))
    if (error) throw error
    data.push(...(page || []))
    if (!page || page.length < 1000) break
  }

  const headers = ['Дата', 'Заказ', 'Этап', 'Тип плёнки', 'Плёнка (м)', 'Ламинация (м)', 'Смола (г)', 'Брак', 'Сотрудник']
  const rows = (data || [])
    .filter((l) => Number(l.film_meters) > 0 || Number(l.lamination_meters) > 0 || Number(l.resin_grams) > 0)
    .map((l) => [
      new Date(l.created_at).toLocaleString('ru-RU'),
      l.order?.number ?? '',
      getStatusMeta(l.stage)?.label || l.stage,
      FILM_TYPES[l.film_type]?.label || l.film_type || '',
      Number(l.film_meters) > 0 ? Number(Number(l.film_meters).toFixed(2)) : '',
      Number(l.lamination_meters) > 0 ? Number(Number(l.lamination_meters).toFixed(2)) : '',
      Number(l.resin_grams) > 0 ? Number(Number(l.resin_grams).toFixed(0)) : '',
      Number(l.defects) || '',
      l.worker?.display_name || '',
    ])

  await downloadXlsx(`materials-log-${localIsoDate()}`, 'Расход материалов', [headers, ...rows])
}
