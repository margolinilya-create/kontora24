/**
 * Выгрузка «Полная таблица заказов» (ExportDataModal) — чистая логика.
 *
 * Колонки с финансами (цена, себестоимость, маржа, оплата, стоимость
 * материалов) помечены finance: true и попадают в файл ТОЛЬКО при праве
 * view:finance. Без права их нет совсем (не пустые колонки, а отсутствие),
 * как в выгрузках склада R25.8.
 */
import {
  FILM_TYPES, LAMINATION_TYPES, DELIVERY_TYPES, PRIORITIES, ORDER_SOURCES, PAYMENT_STATUSES,
  calculateActualMaterialsCost, getStatusMeta,
} from '@/shared/constants'
import { formatOrderType } from '@/shared/lib/utils'

const sum = (logs, field) => logs.reduce((s, l) => s + (Number(l[field]) || 0), 0)
const ruDate = (v) => (v ? new Date(v).toLocaleDateString('ru-RU') : '')

/** @type {Array<{ header: string, finance?: boolean, value: (o: object, ctx: object) => any }>} */
export const ORDERS_FULL_COLUMNS = [
  { header: '№', value: (o) => o.number },
  { header: 'Клиент', value: (o) => o.client?.name || '' },
  { header: 'Тел.', value: (o) => o.client?.phone || '' },
  { header: 'Тип', value: (o) => formatOrderType(o) },
  { header: 'Размер', value: (o) => (o.width_mm && o.height_mm ? `${o.width_mm}x${o.height_mm}` : '') },
  { header: 'Тираж', value: (o) => o.qty || '' },
  { header: 'Плёнка', value: (o) => FILM_TYPES[o.film_type]?.label || o.film_type || '' },
  { header: 'Ламинация', value: (o) => LAMINATION_TYPES[o.lam_type]?.label || (o.need_lam ? 'Да' : 'Нет') },
  { header: 'Стикеров в паке', value: (o) => o.stickers_per_pack || '' },
  { header: 'Видов', value: (o) => o.design_variants || 1 },
  { header: 'Срочность', value: (o) => PRIORITIES[o.priority]?.label || '' },
  { header: 'Статус', value: (o) => getStatusMeta(o.status)?.label || o.status },
  { header: 'Дата приёма', value: (o) => ruDate(o.created_at) },
  { header: 'Дедлайн', value: (o) => ruDate(o.deadline) },
  { header: 'Менеджер', value: (o) => o.creator?.display_name || '' },
  { header: 'Исполнитель', value: (o) => o.assignee?.display_name || '' },
  { header: 'Источник', value: (o) => ORDER_SOURCES[o.source]?.label || '' },
  { header: 'Оплата', finance: true, value: (o) => PAYMENT_STATUSES[o.payment_status]?.label || '' },
  { header: 'Отгрузка', value: (o) => DELIVERY_TYPES[o.delivery_type]?.label || '' },
  { header: 'Город', value: (o) => o.delivery_city || '' },
  { header: 'Адрес', value: (o) => o.delivery_address || '' },
  { header: 'Цена', finance: true, value: (o) => Number(o.price_final) || 0 },
  { header: 'Себестоимость', finance: true, value: (o) => Number(o.cost_total) || 0 },
  { header: 'Маржа', finance: true, value: (o) => (Number(o.price_final) || 0) - (Number(o.cost_total) || 0) },
  { header: 'Bitrix ID', value: (o) => o.bitrix_deal_id || '' },
  { header: 'Комментарий', value: (o) => o.notes || '' },
  { header: 'Факт. плёнка (м)', value: (o, c) => (c.film > 0 ? Number(c.film.toFixed(2)) : '') },
  { header: 'Факт. ламинация (м)', value: (o, c) => (c.lam > 0 ? Number(c.lam.toFixed(2)) : '') },
  { header: 'Факт. смола (г)', value: (o, c) => (c.resin > 0 ? Number(c.resin.toFixed(0)) : '') },
  {
    header: 'Себестоимость материалов (₽)', finance: true,
    value: (o, c) => (c.matCost > 0 ? Number(c.matCost.toFixed(2)) : ''),
  },
]

/**
 * @param {Array} orders — строки k24_orders_full (+ client/creator/assignee)
 * @param {Array} logs — { order_id, film_type, film_meters, lamination_meters, resin_grams }
 * @param {{ canFinance: boolean }} opts
 * @returns {Array<Array>} AOA с заголовком
 */
export function buildOrdersFullAoa(orders, logs, { canFinance = false } = {}) {
  const cols = ORDERS_FULL_COLUMNS.filter((c) => canFinance || !c.finance)
  const logsByOrder = {}
  for (const l of logs || []) (logsByOrder[l.order_id] ||= []).push(l)
  const rows = (orders || []).map((o) => {
    const ol = logsByOrder[o.id] || []
    const ctx = {
      film: sum(ol, 'film_meters'),
      lam: sum(ol, 'lamination_meters'),
      resin: sum(ol, 'resin_grams'),
      matCost: canFinance ? calculateActualMaterialsCost(ol, o.film_type).total : 0,
    }
    return cols.map((c) => c.value(o, ctx))
  })
  return [cols.map((c) => c.header), ...rows]
}
