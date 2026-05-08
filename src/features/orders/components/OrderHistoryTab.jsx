import { useEffect, useMemo, useState } from 'react'
import { ORDER_STATUSES, ORDER_TYPES, FILM_TYPES, LAMINATION_TYPES, DESIGN_STATUSES, ORDER_SOURCES, PAYMENT_STATUSES, DELIVERY_TYPES, PRIORITIES } from '@/shared/constants'
import { STAGE_FIELDS } from '@/features/production/lib/production-logs'
import { useProductionLogs } from '@/features/production/hooks/useProductionLogs'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'
import { formatDateTime } from '@/shared/lib/utils'

const TYPE_DOT = {
  status: 'bg-accent',
  log: 'bg-success',
  audit: 'bg-info',
}

const FIELD_LABELS = {
  number: 'Номер заказа', client_id: 'Заказчик', order_type: 'Тип', qty: 'Тираж',
  width_mm: 'Ширина', height_mm: 'Высота', film_type: 'Плёнка', lam_type: 'Ламинация',
  need_lam: 'Нужна ламинация', design_status: 'Дизайн макета', priority: 'Приоритет',
  is_partner: 'Партнёрский', is_urgent: 'Срочный', bopp_bag: 'БОПП пакет',
  design_variants: 'Видов дизайна', stickers_per_pack: 'Стикеров в паке',
  mockup_path: 'Ссылка на макет', deadline: 'Дедлайн', deal_name: 'Название сделки',
  bitrix_deal_id: 'Bitrix ID', price_final: 'Цена', cost_materials: 'Себестоимость материалов',
  cost_labor: 'Стоимость труда', markup: 'Наценка', discount_pct: 'Скидка',
  source: 'Источник', payment_status: 'Оплата',
  delivery_type: 'Отгрузка', delivery_city: 'Город', delivery_address: 'Адрес',
  delivery_notes: 'Комментарий к доставке', notes: 'Комментарий', assigned_to: 'Исполнитель',
}

const FIELD_ENUM_LOOKUP = {
  order_type: ORDER_TYPES, film_type: FILM_TYPES, lam_type: LAMINATION_TYPES,
  design_status: DESIGN_STATUSES, source: ORDER_SOURCES, payment_status: PAYMENT_STATUSES,
  delivery_type: DELIVERY_TYPES, priority: PRIORITIES,
}

function formatAuditValue(field, value) {
  if (value === null || value === undefined || value === '') return '—'
  const enumMap = FIELD_ENUM_LOOKUP[field]
  if (enumMap?.[value]?.label) return enumMap[value].label
  if (field === 'is_partner' || field === 'is_urgent' || field === 'need_lam' || field === 'bopp_bag') {
    return value === 'true' || value === true ? 'Да' : 'Нет'
  }
  if (field === 'deadline' || field === 'changed_at') {
    return value ? new Date(value).toLocaleDateString('ru-RU') : '—'
  }
  return String(value).length > 60 ? String(value).slice(0, 60) + '…' : String(value)
}

/**
 * Полная история заказа: смены статусов + ввод данных по производственным логам,
 * объединённые в один лог, отсортированный по времени (новые сверху).
 */
export function OrderHistoryTab({ order, history }) {
  const { logs } = useProductionLogs(order?.id, order?.qty)
  const [audit, setAudit] = useState([])

  useEffect(() => {
    if (!order?.id) return
    let cancelled = false
    async function load() {
      try {
        const { data, error } = await supabase
          .from('k24_order_audit')
          .select('*, changed_by_profile:k24_profiles!changed_by(display_name)')
          .eq('order_id', order.id)
          .order('changed_at', { ascending: false })
        if (error) throw error
        if (!cancelled) setAudit(data || [])
      } catch (err) {
        captureError(err, { tags: { source: 'OrderHistoryTab.audit' }, extra: { orderId: order.id } })
      }
    }
    load()
    return () => { cancelled = true }
  }, [order?.id])

  const items = useMemo(() => {
    const out = []
    for (const h of history || []) {
      out.push({
        id: `s-${h.id}`,
        type: 'status',
        ts: h.created_at,
        actor: h.changed_by_profile?.display_name || 'Система',
        from: h.from_status,
        to: h.to_status,
      })
    }
    for (const l of logs || []) {
      out.push({
        id: `l-${l.id}`,
        type: 'log',
        ts: l.created_at,
        actor: l.worker?.display_name || 'Сотрудник',
        stage: l.stage,
        track: l.track,
        log: l,
      })
    }
    for (const a of audit || []) {
      out.push({
        id: `a-${a.id}`,
        type: 'audit',
        ts: a.changed_at,
        actor: a.changed_by_profile?.display_name || 'Система',
        field: a.field_name,
        oldValue: a.old_value,
        newValue: a.new_value,
      })
    }
    out.sort((a, b) => new Date(b.ts) - new Date(a.ts))
    return out
  }, [history, logs, audit])

  if (items.length === 0) {
    return (
      <div className="bg-surface rounded-2xl border border-border p-5 text-text-muted text-sm">
        Нет записей
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
      <h2 className="font-semibold text-lg mb-4">История заказа</h2>
      <ol className="space-y-2.5">
        {items.map((it) => (
          <li key={it.id} className="flex items-start gap-3 text-sm">
            <span className={`w-2 h-2 rounded-full mt-2 shrink-0 ${TYPE_DOT[it.type]}`} aria-hidden="true" />
            <div className="flex-1 min-w-0">
              {it.type === 'status' ? (
                <p>
                  {it.from && (
                    <><span className="text-text-muted">{ORDER_STATUSES[it.from]?.label || it.from}</span>{' → '}</>
                  )}
                  <span className="font-medium">{ORDER_STATUSES[it.to]?.label || it.to}</span>
                </p>
              ) : it.type === 'log' ? (
                <p className="break-words">
                  <span className="text-text-muted">Ввод данных:</span>{' '}
                  <span className="font-medium">{STAGE_FIELDS[it.stage]?.label || it.stage}</span>
                  {it.track && (
                    <span className="text-text-muted text-xs ml-1.5">
                      ({it.track === 'backgrounds' ? 'фоны' : 'стикеры'})
                    </span>
                  )}
                  <LogSummary log={it.log} stage={it.stage} />
                </p>
              ) : (
                <p className="break-words">
                  <span className="text-text-muted">Изменено поле:</span>{' '}
                  <span className="font-medium">{FIELD_LABELS[it.field] || it.field}</span>
                  <span className="text-text-muted text-xs ml-1.5">
                    {formatAuditValue(it.field, it.oldValue)} → {formatAuditValue(it.field, it.newValue)}
                  </span>
                </p>
              )}
              <p className="text-xs text-text-muted">
                {it.actor} · {formatDateTime(it.ts)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function LogSummary({ log, stage }) {
  const config = STAGE_FIELDS[stage]
  if (!config) return null
  const parts = []
  for (const f of config.fields) {
    const v = log[f.key]
    if (v === undefined || v === null || v === '' || v === 0) continue
    parts.push(`${f.label}: ${v}${f.unit ? ' ' + f.unit : ''}`)
  }
  if (parts.length === 0) return null
  return (
    <span className="text-text-muted text-xs ml-1.5">— {parts.join(', ')}</span>
  )
}
