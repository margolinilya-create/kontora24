import { useState, useMemo } from 'react'
import { useOrdersCostReport, useEmployeeReport } from '../hooks/useReports'
import { useMaterials } from '@/features/warehouse/hooks/useMaterials'
import { ThreeDPouringTab } from '../components/ThreeDPouringTab'
import { buildCostMap, costForOrder } from '../lib/materials-cost'
import { ORDER_TYPES, FILM_TYPES, LAMINATION_TYPES, DELIVERY_TYPES, PAYMENT_STATUSES } from '@/shared/constants'
import { formatPrice, formatOrderNumber, formatDate } from '@/shared/lib/utils'
import { downloadXlsx } from '@/shared/lib/export-xlsx'
import Tabs from '@/shared/components/Tabs'
import DropdownMenu from '@/shared/components/DropdownMenu'
import Button from '@/shared/components/Button'
import Spinner from '@/shared/components/Spinner'
import Modal from '@/shared/components/Modal'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { useCanDo } from '@/features/auth/hooks/useCanDo'

// 5 вкладок по брифу 25.05 (R8.5):
// 1) Unit Economics — сводка по заказам с финансами и материалами
// 2) Сотрудники — виджеты «часы + сдельная + цифры» + детальный попап
// 3) 3D-отдел — per-design расход и брак (reuse ThreeDPouringTab)
// 4) Расходы по заказам — фактический расход материалов с себестоимостью
// 5) P&L — упрощённая сводка для управленческого учёта
//
// R14.8 (code-review 03.06): вкладки 1/4/5 содержат финансовые поля
// (price_final, cost_total, маржа) — скрываются без view:finance.
// Вкладка «Сотрудники» тоже показывает payout ₽ — также под gate.
// «3D отдел» нейтральная по финансам, видна при view:reports.
const REPORT_TABS_ALL = [
  { key: 'unit',     label: 'Unit Economics', requiresFinance: true },
  { key: 'people',   label: 'Сотрудники',     requiresFinance: true },
  { key: 'team3d',   label: '3D отдел',       requiresFinance: false },
  { key: 'expenses', label: 'Расходы по заказам', requiresFinance: true },
  { key: 'pnl',      label: 'P&L',            requiresFinance: true },
]

// R13.3 (бриф 02.06): добавлены пресет «Сегодня» и режим «Произвольный диапазон».
// Custom encode: `custom:YYYY-MM-DD:YYYY-MM-DD` — getSince/getUntil в useReports
// распарсят его на нижнюю и верхнюю границу.
const PERIOD_TABS = [
  { key: 'today', label: 'Сегодня' },
  { key: '7', label: '7 дней' },
  { key: '30', label: '30 дней' },
  { key: 'month', label: 'Этот месяц' },
  { key: 'custom', label: 'Свой' },
]

function isoToday() {
  return new Date().toISOString().slice(0, 10)
}

export default function ReportsPage() {
  const canSeeFinance = useCanDo('view:finance')
  const REPORT_TABS = useMemo(
    () => REPORT_TABS_ALL.filter((t) => canSeeFinance || !t.requiresFinance),
    [canSeeFinance]
  )
  const defaultTab = REPORT_TABS[0]?.key || 'team3d'
  const [activeTab, setActiveTab] = useState(defaultTab)
  const [periodKey, setPeriodKey] = useState('30')
  const [customFrom, setCustomFrom] = useState(isoToday())
  const [customTo, setCustomTo] = useState(isoToday())

  // R14.8: если активная вкладка стала недоступной (право отозвано на лету) —
  // переключаемся на первую доступную, чтобы не рендерить вкладку с финансами.
  if (!REPORT_TABS.some((t) => t.key === activeTab)) {
    setActiveTab(defaultTab)
  }

  const period = periodKey === 'custom' && customFrom && customTo
    ? `custom:${customFrom}:${customTo}`
    : periodKey

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight">Отчёты</h1>
          <p className="text-text-muted text-sm">
            Реал-тайм аналитика. Кнопки «xlsx» — выгрузка текущей таблицы.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Tabs items={PERIOD_TABS} active={periodKey} onChange={setPeriodKey} />
          {periodKey === 'custom' && (
            <div className="flex items-center gap-1 text-xs text-text-muted">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                max={customTo}
                className="rounded border border-border bg-surface px-2 py-1"
                aria-label="С"
              />
              <span>–</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                min={customFrom}
                className="rounded border border-border bg-surface px-2 py-1"
                aria-label="По"
              />
            </div>
          )}
        </div>
      </div>

      <div className="hidden md:inline-block">
        <Tabs items={REPORT_TABS} active={activeTab} onChange={setActiveTab} />
      </div>
      <DropdownMenu items={REPORT_TABS} active={activeTab} onChange={setActiveTab} className="md:hidden" align="left" />

      {activeTab === 'unit'     && <UnitEconomicsTab period={period} />}
      {activeTab === 'people'   && <EmployeesTab period={period} />}
      {activeTab === 'team3d'   && <ThreeDPouringTab period={period} />}
      {activeTab === 'expenses' && <ExpensesTab period={period} />}
      {activeTab === 'pnl'      && <PnLTab period={period} />}
    </div>
  )
}

// ============================================================================
// 1) Unit Economics Kontora
// ============================================================================
function UnitEconomicsTab({ period }) {
  const { data, loading, error, refetch } = useOrdersCostReport(period)
  const { materials } = useMaterials()
  const costMap = useMemo(() => buildCostMap(materials), [materials])

  if (loading) return <CenterSpinner />
  if (error) return <ReportError text="Не удалось загрузить Unit Economics" error={error} onRetry={refetch} />
  if (data.length === 0) return <Empty text="Нет заказов за период" />

  const rows = data.map((o) => {
    const mat = costForOrder(o, costMap)
    return {
      ...o,
      mat_film: mat.film,
      mat_resin: mat.resin,
      mat_total: mat.total,
      total_cost_with_mat_labor: mat.total + (Number(o.cost_labor) || 0),
    }
  })

  function handleExport() {
    const header = [
      'ID', '№ заказа', 'Дата приёма', 'Дедлайн', 'Клиент', 'Продукт', '3D смола',
      'Размер', 'Тираж', 'Стикеров в паке', 'Плёнка', 'Ламинация', 'Комментарий',
      'Отгрузка', '% брака', 'Излишки, шт', 'Излишки, %', 'Сумма заказа', 'Тип оплаты',
      'Себест. плёнки, ₽', 'Себест. смолы, ₽', 'Себест. материалов, ₽',
      'Оплата труда, ₽', 'Себест. итого (мат+труд), ₽',
      'Маржинальность, ₽', 'Маржинальность, %',
    ]
    const aoa = [header, ...rows.map((o) => [
      o.id, formatOrderNumber(o), formatDate(o.created_at), o.deadline || '—',
      o.client_name || '—', ORDER_TYPES[o.order_type]?.label || o.order_type,
      o.order_type === 'sticker3D' || o.order_type === 'stickerpack3D' ? 'Да' : 'Нет',
      `${o.width_mm}×${o.height_mm}`, o.qty, o.stickers_per_pack || '—',
      FILM_TYPES[o.film_type]?.label || o.film_type || '—',
      o.need_lam ? (LAMINATION_TYPES[o.lam_type]?.label || 'Да') : 'Нет',
      o.notes || '—',
      DELIVERY_TYPES[o.delivery_type]?.label || '—',
      `${o.reject_pct}%`, o.surplus, `${o.surplus_pct}%`,
      o.price_final || 0, PAYMENT_STATUSES[o.payment_status]?.label || o.payment_status,
      Math.round(o.mat_film), Math.round(o.mat_resin), Math.round(o.mat_total),
      o.cost_labor || 0, Math.round(o.total_cost_with_mat_labor),
      o.profit, `${o.margin_pct}%`,
    ])]
    downloadXlsx(`unit-economics-${period}`, 'Unit Economics', aoa)
      .catch((err) => toast.error(translateError(err).message))
  }

  return (
    <ReportFrame title="Unit Economics" onXlsx={handleExport}>
      <table className="w-full text-xs">
        <thead className="text-text-muted">
          <tr className="border-b border-border">
            <Th>№</Th><Th>Дата</Th><Th>Клиент</Th><Th>Продукт</Th>
            <Th right>Размер</Th><Th right>Тираж</Th><Th>Плёнка</Th><Th>Лам.</Th>
            <Th right>Брак%</Th><Th right>Излиш.шт</Th><Th right>Излиш.%</Th>
            <Th right>Сумма</Th><Th right>Плёнка ₽</Th><Th right>Смола ₽</Th>
            <Th right>С/с итого</Th><Th right>Маржа ₽</Th><Th right>Маржа %</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className="border-b border-border last:border-0">
              <Td bold>{formatOrderNumber(o)}</Td>
              <Td>{formatDate(o.created_at)}</Td>
              <Td>{o.client_name || '—'}</Td>
              <Td>{ORDER_TYPES[o.order_type]?.label}</Td>
              <Td right>{o.width_mm}×{o.height_mm}</Td>
              <Td right>{o.qty}</Td>
              <Td>{FILM_TYPES[o.film_type]?.label || '—'}</Td>
              <Td>{o.need_lam ? (LAMINATION_TYPES[o.lam_type]?.label || 'Да') : '—'}</Td>
              <Td right danger={o.reject_pct > 15}>{o.reject_pct}%</Td>
              <Td right muted>{o.surplus > 0 ? `+${o.surplus}` : o.surplus}</Td>
              <Td right muted>{o.surplus_pct}%</Td>
              <Td right>{formatPrice(o.price_final)}</Td>
              <Td right muted>{Math.round(o.mat_film)}</Td>
              <Td right muted>{Math.round(o.mat_resin)}</Td>
              <Td right>{formatPrice(o.total_cost_with_mat_labor)}</Td>
              <Td right success={o.profit > 0} danger={o.profit < 0}>{formatPrice(o.profit)}</Td>
              <Td right>{o.margin_pct}%</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </ReportFrame>
  )
}

// ============================================================================
// 2) Сотрудники Конторы
// ============================================================================
function EmployeesTab({ period }) {
  const { data, loading, error, refetch } = useEmployeeReport(period)
  const [openWorker, setOpenWorker] = useState(null)

  if (loading) return <CenterSpinner />
  if (error) return <ReportError text="Не удалось загрузить сотрудников" error={error} onRetry={refetch} />
  if (data.length === 0) return <Empty text="Нет данных за период" />

  function handleExport() {
    const header = [
      'Сотрудник', 'Отработанные часы', 'Заработок, ₽',
      'Залито, шт', 'Выбрано, шт', 'Собрано паков', 'Упаковано',
      'Напечатано', 'Заламинировано', 'Нарезано',
    ]
    const aoa = [header, ...data.map((w) => [
      w.name, (w.totalMinutes / 60).toFixed(1), Math.round(w.payout),
      w.poured, w.selected, w.assembled, w.packaged,
      w.printed, w.laminated, w.cut,
    ])]
    downloadXlsx(`сотрудники-${period}`, 'Сотрудники', aoa)
      .catch((err) => toast.error(translateError(err).message))
  }

  return (
    <ReportFrame title="Учёт работы сотрудников" onXlsx={handleExport}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.map((w) => (
          <button
            key={w.worker_id}
            onClick={() => setOpenWorker(w)}
            className="text-left bg-surface-2 hover:bg-surface-dim border border-border rounded-xl p-4 transition-colors"
          >
            <p className="font-semibold text-sm">{w.name}</p>
            <p className="text-2xl font-display font-bold mt-1 tabular-nums">
              {(w.totalMinutes / 60).toFixed(1)}<span className="text-sm text-text-muted font-sans"> ч</span>
            </p>
            <p className="text-sm text-accent font-medium">{formatPrice(w.payout)}</p>
            <div className="grid grid-cols-2 gap-1 mt-2 text-xs text-text-muted">
              <span>Залито: <b className="text-text">{w.poured}</b></span>
              <span>Выбрано: <b className="text-text">{w.selected}</b></span>
              <span>Собрано: <b className="text-text">{w.assembled}</b></span>
              <span>Упаковано: <b className="text-text">{w.packaged}</b></span>
            </div>
            <p className="text-xs text-accent mt-2">Подробнее →</p>
          </button>
        ))}
      </div>
      {openWorker && <EmployeeDetailModal worker={openWorker} onClose={() => setOpenWorker(null)} />}
    </ReportFrame>
  )
}

function EmployeeDetailModal({ worker, onClose }) {
  const days = Object.entries(worker.days).sort(([a], [b]) => a.localeCompare(b))
  return (
    <Modal isOpen={true} onClose={onClose} title={`${worker.name} — детально`} maxWidth="max-w-2xl">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Stat label="Часы всего" value={`${(worker.totalMinutes / 60).toFixed(1)} ч`} />
          <Stat label="Заработок" value={formatPrice(worker.payout)} />
          <Stat label="Залито стикеров" value={worker.poured} />
          <Stat label="Выбрано фонов" value={worker.selected} />
          <Stat label="Собрано паков" value={worker.assembled} />
          <Stat label="Упаковано" value={worker.packaged} />
          <Stat label="Напечатано" value={worker.printed} />
          <Stat label="Заламинировано" value={worker.laminated} />
          <Stat label="Нарезано" value={worker.cut} />
        </div>
        <div>
          <h3 className="font-semibold text-sm mb-2">График по дням</h3>
          <div className="bg-surface-2 rounded-xl divide-y divide-border max-h-96 overflow-y-auto">
            {days.length === 0 && <p className="p-4 text-sm text-text-muted">Нет смен</p>}
            {days.map(([day, min]) => (
              <div key={day} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>{day}</span>
                <span className="tabular-nums font-medium">{(min / 60).toFixed(1)} ч</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}

function Stat({ label, value }) {
  return (
    <div className="bg-surface-2 rounded-lg p-3">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  )
}

// ============================================================================
// 4) Расходы по заказам
// ============================================================================
function ExpensesTab({ period }) {
  const { data, loading, error, refetch } = useOrdersCostReport(period)
  const { materials } = useMaterials()
  const costMap = useMemo(() => buildCostMap(materials), [materials])

  if (loading) return <CenterSpinner />
  if (error) return <ReportError text="Не удалось загрузить расходы" error={error} onRetry={refetch} />
  if (data.length === 0) return <Empty text="Нет заказов за период" />

  const rows = data.map((o) => ({ ...o, cost: costForOrder(o, costMap) }))

  function handleExport() {
    const header = [
      '№ заказа', 'Клиент', 'Тираж', 'Излишки, шт', 'Излишки, %',
      'Плёнка, м', 'Себест. плёнки, ₽',
      'Ламинация, м', 'Себест. лам., ₽',
      'Коробки, шт', 'Себест. коробок, ₽',
      'Смола, г', 'Себест. смолы, ₽',
      'Итого материалов, ₽',
    ]
    const aoa = [header, ...rows.map((o) => [
      formatOrderNumber(o), o.client_name || '—', o.qty,
      o.surplus, `${o.surplus_pct}%`,
      Number(o.actual_film || 0).toFixed(1), Math.round(o.cost.film),
      Number(o.actual_lam || 0).toFixed(1), Math.round(o.cost.lam),
      o.boxes_used || 0, Math.round(o.cost.box),
      Math.round(o.actual_resin), Math.round(o.cost.resin),
      Math.round(o.cost.total),
    ])]
    downloadXlsx(`расходы-по-заказам-${period}`, 'Расходы', aoa)
      .catch((err) => toast.error(translateError(err).message))
  }

  return (
    <ReportFrame title="Расходы по заказам — фактическое списание" onXlsx={handleExport}>
      <table className="w-full text-xs">
        <thead className="text-text-muted">
          <tr className="border-b border-border">
            <Th>№</Th><Th>Клиент</Th><Th right>Тираж</Th>
            <Th right>Излиш.шт</Th><Th right>Излиш.%</Th>
            <Th right>Плёнка</Th><Th right>₽</Th>
            <Th right>Лам.</Th><Th right>₽</Th>
            <Th right>Кор.</Th><Th right>₽</Th>
            <Th right>Смола</Th><Th right>₽</Th>
            <Th right>Итого ₽</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className="border-b border-border last:border-0">
              <Td bold>{formatOrderNumber(o)}</Td>
              <Td>{o.client_name || '—'}</Td>
              <Td right>{o.qty}</Td>
              <Td right muted>{o.surplus > 0 ? `+${o.surplus}` : o.surplus}</Td>
              <Td right muted>{o.surplus_pct}%</Td>
              <Td right>{Number(o.actual_film || 0).toFixed(1)}м</Td>
              <Td right muted>{Math.round(o.cost.film)}</Td>
              <Td right>{Number(o.actual_lam || 0).toFixed(1)}м</Td>
              <Td right muted>{Math.round(o.cost.lam)}</Td>
              <Td right>{o.boxes_used || 0}</Td>
              <Td right muted>{Math.round(o.cost.box)}</Td>
              <Td right>{Math.round(o.actual_resin)}г</Td>
              <Td right muted>{Math.round(o.cost.resin)}</Td>
              <Td right bold>{formatPrice(o.cost.total)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </ReportFrame>
  )
}

// ============================================================================
// 5) P&L
// ============================================================================
function PnLTab({ period }) {
  const { data, loading, error, refetch } = useOrdersCostReport(period)
  const { materials } = useMaterials()
  const costMap = useMemo(() => buildCostMap(materials), [materials])

  if (loading) return <CenterSpinner />
  if (error) return <ReportError text="Не удалось загрузить P&L" error={error} onRetry={refetch} />
  if (data.length === 0) return <Empty text="Нет заказов за период" />

  const rows = data.map((o) => {
    const mat = costForOrder(o, costMap)
    const matLabor = mat.total + (Number(o.cost_labor) || 0)
    const profit = (Number(o.price_final) || 0) - matLabor
    const marginPct = o.price_final > 0 ? Math.round((profit / o.price_final) * 100) : 0
    return { ...o, mat_total: mat.total, total_cost_with_mat_labor: matLabor, real_profit: profit, real_margin: marginPct }
  })

  const totals = rows.reduce((acc, o) => {
    acc.revenue += Number(o.price_final) || 0
    acc.cost += o.total_cost_with_mat_labor
    acc.profit += o.real_profit
    return acc
  }, { revenue: 0, cost: 0, profit: 0 })

  function handleExport() {
    const header = ['№ заказа', 'Клиент', 'Сумма заказа', 'Тип оплаты', 'Себестоимость', 'Оплата труда', 'Маржа ₽', 'Маржа %']
    const aoa = [header, ...rows.map((o) => [
      formatOrderNumber(o), o.client_name || '—',
      o.price_final || 0, PAYMENT_STATUSES[o.payment_status]?.label || o.payment_status,
      Math.round(o.mat_total), o.cost_labor || 0,
      Math.round(o.real_profit), `${o.real_margin}%`,
    ])]
    aoa.push([])
    aoa.push(['ИТОГО', '', totals.revenue, '', Math.round(totals.cost), '', Math.round(totals.profit),
      totals.revenue > 0 ? `${Math.round((totals.profit / totals.revenue) * 100)}%` : '0%'])
    downloadXlsx(`pnl-${period}`, 'P&L', aoa).catch((err) => toast.error(translateError(err).message))
  }

  return (
    <ReportFrame title="P&L (прибыль и убытки)" onXlsx={handleExport}>
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <SummaryCard label="Выручка" value={formatPrice(totals.revenue)} />
        <SummaryCard label="Себестоимость" value={formatPrice(totals.cost)} muted />
        <SummaryCard label="Маржа"
          value={formatPrice(totals.profit)}
          sub={totals.revenue > 0 ? `${Math.round((totals.profit / totals.revenue) * 100)}%` : '0%'}
          accent={totals.profit > 0}
          danger={totals.profit < 0}
        />
      </div>
      <table className="w-full text-xs">
        <thead className="text-text-muted">
          <tr className="border-b border-border">
            <Th>№</Th><Th>Клиент</Th><Th right>Сумма</Th><Th>Оплата</Th>
            <Th right>Себест.</Th><Th right>Труд</Th><Th right>Маржа ₽</Th><Th right>Маржа %</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className="border-b border-border last:border-0">
              <Td bold>{formatOrderNumber(o)}</Td>
              <Td>{o.client_name || '—'}</Td>
              <Td right>{formatPrice(o.price_final)}</Td>
              <Td muted>{PAYMENT_STATUSES[o.payment_status]?.label || '—'}</Td>
              <Td right muted>{formatPrice(o.mat_total)}</Td>
              <Td right muted>{formatPrice(o.cost_labor)}</Td>
              <Td right success={o.real_profit > 0} danger={o.real_profit < 0}>{formatPrice(o.real_profit)}</Td>
              <Td right>{o.real_margin}%</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </ReportFrame>
  )
}

// ============================================================================
// Shared
// ============================================================================
function ReportFrame({ title, onXlsx, children }) {
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">{title}</h2>
        {onXlsx && <Button variant="secondary" size="sm" onClick={onXlsx}>xlsx</Button>}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

function Th({ children, right }) {
  return <th className={`py-2 px-2 font-medium ${right ? 'text-right' : 'text-left'}`}>{children}</th>
}

function Td({ children, right, bold, muted, success, danger }) {
  const cls = [
    'py-2 px-2',
    right ? 'text-right tabular-nums' : '',
    bold ? 'font-medium' : '',
    muted ? 'text-text-muted' : '',
    success ? 'text-success font-medium' : '',
    danger ? 'text-danger font-medium' : '',
  ].filter(Boolean).join(' ')
  return <td className={cls}>{children}</td>
}

function SummaryCard({ label, value, sub, muted, accent, danger }) {
  return (
    <div className="bg-surface-2 rounded-xl border border-border p-3">
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${accent ? 'text-success' : danger ? 'text-danger' : muted ? 'text-text-muted' : ''}`}>{value}</p>
      {sub && <p className="text-xs text-text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

function CenterSpinner() {
  return <div className="flex justify-center py-12"><Spinner /></div>
}

function Empty({ text }) {
  return (
    <div className="bg-surface rounded-xl border border-border p-12 text-center">
      <p className="text-text-muted">{text}</p>
    </div>
  )
}

function ReportError({ text, error, onRetry }) {
  // R13.3 (бриф 02.06): «написать причину ошибки и предложить решения».
  // Заголовок — человекочитаемый перевод через translateError. Тело —
  // действия (Обновить + Скопировать код для саппорта). Сырой message
  // показываем мелким для дебага.
  const t = translateError(error)
  const rawMessage = error?.message
    || (typeof error === 'string' ? error : null)
  const codeParts = [error?.code, error?.hint, error?.details].filter(Boolean).join(' · ')

  function copyCode() {
    const lines = [text, t.message, rawMessage, codeParts].filter(Boolean)
    navigator.clipboard?.writeText(lines.join('\n')).then(
      () => toast.success('Код ошибки скопирован'),
      () => toast.error('Не удалось скопировать'),
    )
  }

  return (
    <div role="alert" className="bg-danger/10 border border-danger/30 text-danger rounded-xl p-6">
      <p className="text-base font-semibold text-center">{text}</p>
      <p className="text-sm mt-1 text-center text-text">{t.message}</p>
      <div className="flex justify-center gap-2 mt-4 flex-wrap">
        <Button variant="secondary" onClick={onRetry || (() => window.location.reload())}>
          Обновить
        </Button>
        <Button variant="secondary" onClick={copyCode}>
          Скопировать код ошибки
        </Button>
      </div>
      {(rawMessage || codeParts) && (
        <details className="mt-4 text-xs opacity-70">
          <summary className="cursor-pointer">Подробности для саппорта</summary>
          {rawMessage && <p className="mt-2 font-mono break-words">{rawMessage}</p>}
          {codeParts && <p className="mt-1 font-mono break-words">{codeParts}</p>}
        </details>
      )}
    </div>
  )
}
