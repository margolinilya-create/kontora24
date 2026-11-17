import { Link, useNavigate } from 'react-router-dom'
import { StatusBadge } from './StatusBadge'
import { ORDER_TYPES, reprintViewLabel } from '@/shared/constants'
import { formatOrderNumber } from '@/shared/lib/utils'
import { getDeadlineClasses, getDeadlineDotClass } from '@/shared/lib/deadline'
import { reprintDisplayTitle } from '../lib/active-reprints'

/**
 * R25.3 (ТЗ Фаза 3.1) — допечатки в списке заказов: строки карточек/таблицы,
 * карточка канбана и чип «Допечаток: N» на родителе. Клик по допечатке →
 * /production/subtask/:id, ссылка «к заказу #N» → родитель.
 */

const PLAQUE = 'text-[10px] font-medium px-1.5 py-0.5 rounded bg-warning/15 text-warning shrink-0'

function info(reprint) {
  const order = reprint.order || {}
  const num = formatOrderNumber(order)
  return {
    order,
    num,
    title: reprintDisplayTitle(reprint, num),
    viewLabel: reprintViewLabel(order.order_type, reprint.view_ref),
    pct: reprint.status === 'done' ? 100 : (reprint.overall?.percentage ?? 0),
    href: `/production/subtask/${reprint.id}`,
  }
}

function ProgressMini({ pct, done }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1.5 w-16 bg-surface-dim rounded-full overflow-hidden">
        <span className={`block h-full rounded-full ${done ? 'bg-success' : 'bg-accent'}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      <span className="text-[11px] text-text-muted tabular-nums">{pct}%</span>
    </span>
  )
}

/** Чип на карточке родителя, пока есть активные допечатки. */
export function ReprintsChip({ count }) {
  if (!count) return null
  return (
    <span className={PLAQUE} title="Активные допечатки заказа">Допечаток: {count}</span>
  )
}

export function ReprintMobileRow({ reprint }) {
  const { order, num, title, viewLabel, pct, href } = info(reprint)
  const dotCls = getDeadlineDotClass(order.deadline)
  const textCls = getDeadlineClasses(order.deadline) || 'text-text-muted'
  return (
    <li className="relative bg-warning/[0.03]">
      <Link to={href} className="flex flex-col gap-1 pl-7 pr-4 py-3 hover:bg-surface-2 transition-colors active:bg-surface-dim">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {dotCls && <span className={`w-2 h-2 rounded-full shrink-0 ${dotCls}`} aria-hidden="true" />}
            <span className={PLAQUE}>Допечатка</span>
            <span className="font-medium text-sm text-text truncate">{title}</span>
          </div>
          {order.deadline && (
            <span className={`text-xs whitespace-nowrap shrink-0 ${textCls}`}>
              {new Date(order.deadline).toLocaleDateString('ru-RU')}
            </span>
          )}
        </div>
        <p className="text-sm text-text truncate">{order.client?.name || '—'}</p>
        <div className="flex items-center justify-between gap-2 text-xs text-text-muted">
          <span className="truncate">
            {viewLabel ? `${viewLabel} · ` : ''}{reprint.qty} шт
          </span>
          <StatusBadge status={reprint.status} />
        </div>
        <ProgressMini pct={pct} done={reprint.status === 'done'} />
      </Link>
      <Link
        to={`/orders/${order.id}`}
        className="absolute bottom-3 right-4 text-xs text-accent underline"
      >
        к заказу #{num}
      </Link>
    </li>
  )
}

export function ReprintDesktopRow({ reprint, extraCell = false }) {
  const navigate = useNavigate()
  const { order, num, title, viewLabel, pct, href } = info(reprint)
  const textCls = getDeadlineClasses(order.deadline) || 'text-text-muted'
  return (
    <tr
      onClick={() => navigate(href)}
      className="border-b border-border last:border-0 hover:bg-surface-2 transition-colors cursor-pointer border-l-4 border-l-warning/40 bg-warning/[0.03]"
    >
      <td className="px-4 py-2.5" colSpan={2}>
        <div className="flex items-center gap-1.5 min-w-0 pl-3">
          <span className={PLAQUE}>Допечатка</span>
          <Link
            to={href}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-text hover:text-accent transition-colors truncate max-w-[220px]"
          >
            {title}
          </Link>
          <Link
            to={`/orders/${order.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-accent underline whitespace-nowrap"
          >
            к заказу #{num}
          </Link>
        </div>
        <p className="text-xs text-text-muted pl-3 truncate max-w-[360px]">{order.client?.name || '—'}</p>
      </td>
      <td className="px-4 py-2.5 text-text-muted">{viewLabel || ORDER_TYPES[order.order_type]?.label || order.order_type}</td>
      <td className="px-4 py-2.5 text-text-muted">—</td>
      <td className="px-4 py-2.5 text-right text-text-muted whitespace-nowrap">{reprint.qty} шт</td>
      <td className="px-4 py-2.5 text-right"><ProgressMini pct={pct} done={reprint.status === 'done'} /></td>
      <td className="px-4 py-2.5"><StatusBadge status={reprint.status} /></td>
      <td className={`px-4 py-2.5 whitespace-nowrap text-xs ${textCls}`}>
        {order.deadline ? new Date(order.deadline).toLocaleDateString('ru-RU') : '—'}
      </td>
      {extraCell && <td className="px-2 py-2.5" />}
    </tr>
  )
}

/**
 * Карточка допечатки в канбане. Не перетаскивается: у допечатки свои проверки
 * количества в RPC — двигается со своей страницы.
 */
export function ReprintKanbanCard({ reprint }) {
  const { order, num, title, viewLabel, pct, href } = info(reprint)
  const textCls = getDeadlineClasses(order.deadline) || 'text-text-muted'
  return (
    <div
      className="bg-surface rounded-2xl border border-dashed border-warning/50 shadow-card p-3 cursor-default"
      title="Подзадача двигается со своей страницы"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={PLAQUE}>Допечатка</span>
          <Link to={href} className="text-sm font-semibold text-text hover:text-accent truncate">{title}</Link>
        </div>
        {order.deadline && (
          <span className={`text-xs shrink-0 ${textCls}`}>
            {new Date(order.deadline).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
          </span>
        )}
      </div>
      {order.client?.name && <p className="text-xs text-text-muted mt-1 truncate">{order.client.name}</p>}
      <p className="text-xs text-text-muted mt-0.5">
        {viewLabel ? `${viewLabel} · ` : ''}{reprint.qty} шт
      </p>
      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-border">
        <Link to={`/orders/${order.id}`} className="text-xs text-accent underline">к заказу #{num}</Link>
        <ProgressMini pct={pct} done={reprint.status === 'done'} />
      </div>
    </div>
  )
}
