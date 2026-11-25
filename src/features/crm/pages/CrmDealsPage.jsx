import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Button from '@/shared/components/Button'
import Tabs from '@/shared/components/Tabs'
import SearchInput from '@/shared/components/SearchInput'
import ErrorState from '@/shared/components/ErrorState'
import { Skeleton } from '@/shared/components/Skeleton'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import { formatPrice, formatDate } from '@/shared/lib/utils'
import { useCrmDirectory, useCrmDeals, useAsyncData } from '../hooks/useCrmData'
import { useProfiles } from '@/features/orders/hooks/useOrders'
import { ORDER_SOURCES } from '@/shared/constants'
import { listDeals, listPipelines, listLostReasons } from '../lib/deals-api'
import { listStageActivities } from '../lib/feed-api'
import { useDealMove } from '../hooks/useDealMove'
import {
  activeStages, weightedForecast, stageTotals, isOverdue, isRotting,
  dealsInPeriod, summarizeSales, buildFunnel, groupDeals, forecastByMonth,
} from '../lib/deals'
import { DealsBoard } from '../components/DealsBoard'
import { DealFormModal } from '../components/DealFormModal'
import { LostReasonModal } from '../components/LostReasonModal'

// Закрытые сделки на доске — только за последние 30 дней (иначе колонки
// «Выиграна/Проиграна» разрастаются); в списке — все.
const CLOSED_ON_BOARD_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

const ORDER_SOURCE_LABELS = Object.fromEntries(Object.entries(ORDER_SOURCES).map(([k, v]) => [k, v.label]))

const VIEWS = [
  { key: 'board', label: 'Канбан' },
  { key: 'list', label: 'Список' },
]

/**
 * R28.1 — раздел «Сделки»: воронка (канбан / список), прогноз, создание сделки.
 */
export default function CrmDealsPage() {
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'list' ? 'list' : 'board'
  const [query, setQuery] = useState('')
  const search = useDebounce(query, 300)
  const [creating, setCreating] = useState(false)
  const canEdit = useCanDo('crm:edit')

  const { pipelines, lostReasons, loading: dirLoading, error: dirError, refetch: refetchDir } = useCrmDirectory()
  const livePipelines = pipelines.filter((p) => !p.archived_at)
  const pipelineId = params.get('pipeline') || livePipelines.find((p) => p.is_default)?.id || livePipelines[0]?.id || null
  const pipeline = livePipelines.find((p) => p.id === pipelineId)
  const stages = activeStages(pipeline?.stages)
  const stagesById = Object.fromEntries((pipeline?.stages || []).map((s) => [s.id, s]))
  // «Сейчас» фиксируется при открытии страницы (чистый рендер).
  const [openedAt] = useState(() => Date.now())

  const { deals, setDeals, loading, error, refetch } = useCrmDeals({ pipelineId, search })

  const { requestMove, lostModal } = useDealMove({
    onOptimistic: (deal, stage) => setDeals((prev) => (prev || []).map((d) => (
      d.id === deal.id ? { ...d, stage_id: stage.id, stage_changed_at: new Date().toISOString() } : d
    ))),
    onDone: refetch,
  })

  const cutoff = openedAt - CLOSED_ON_BOARD_DAYS * DAY_MS
  const boardDeals = deals.filter((d) => {
    const st = stagesById[d.stage_id]
    return st?.kind === 'open' || !d.closed_at || new Date(d.closed_at).getTime() >= cutoff
  })

  const openTotals = stageTotals(deals.filter((d) => stagesById[d.stage_id]?.kind === 'open'))
  const forecast = weightedForecast(deals, stagesById)

  function setParam(key, value) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set(key, value)
      return next
    }, { replace: true })
  }

  if (dirError) return <ErrorState error={dirError} onRetry={refetchDir} />

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight">Сделки</h1>
          <p className="text-text-muted text-sm">
            В работе: {openTotals.count} на {formatPrice(openTotals.sum)} · прогноз {formatPrice(forecast)}
          </p>
        </div>
        {canEdit && pipeline && <Button onClick={() => setCreating(true)}>+ Сделка</Button>}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        {livePipelines.length > 1 && (
          <Tabs
            items={livePipelines.map((p) => ({ key: p.id, label: p.name }))}
            active={pipelineId}
            onChange={(pid) => setParam('pipeline', pid)}
          />
        )}
        <Tabs items={VIEWS} active={view} onChange={(v) => setParam('view', v)} />
        <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Название или номер сделки" className="flex-1" />
      </div>

      {dirLoading || loading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64 w-[272px] shrink-0" />)}
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} hideHomeButton />
      ) : !pipeline ? (
        <p className="text-sm text-text-muted py-8 text-center">Нет воронок — создайте в «Настройки → CRM»</p>
      ) : view === 'board' ? (
        <DealsBoard deals={boardDeals} stages={stages} onMove={canEdit ? requestMove : () => {}} />
      ) : (
        <DealsList deals={deals} stagesById={stagesById} />
      )}

      <DealFormModal
        isOpen={creating}
        onClose={() => setCreating(false)}
        pipelines={pipelines}
        defaultPipelineId={pipelineId}
        onSaved={refetch}
      />
      <LostReasonModal reasons={lostReasons} {...lostModal} />
    </div>
  )
}

function DealsList({ deals, stagesById }) {
  const now = new Date()
  if (!deals.length) return <p className="text-sm text-text-muted py-8 text-center">Сделок нет</p>
  return (
    <ul className="bg-surface rounded-xl border border-border divide-y divide-border">
      {deals.map((d) => {
        const st = stagesById[d.stage_id]
        const overdue = isOverdue(d, st, now)
        const rotting = isRotting(d, st, now)
        return (
          <li key={d.id}>
            <Link to={`/crm/deals/${d.id}`} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 px-4 py-3 hover:bg-surface-2">
              <span className="text-xs text-text-muted sm:w-14 shrink-0">№ {d.number}</span>
              <span className="flex-1 min-w-0">
                <span className="font-medium block truncate">{d.title}</span>
                {d.client && <span className="text-xs text-text-muted">{d.client.name}</span>}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs shrink-0">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: st?.color }} aria-hidden="true" />
                {st?.name || '—'}
              </span>
              <span className={`text-xs shrink-0 sm:w-24 ${overdue ? 'text-danger' : rotting ? 'text-warning' : 'text-text-muted'}`}>
                {d.expected_close ? formatDate(d.expected_close) : ''}
              </span>
              <span className="text-sm font-semibold shrink-0 sm:w-28 sm:text-right">{d.amount != null ? formatPrice(d.amount) : '—'}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// R28.4 — Аналитика продаж (/crm/analytics)
// ---------------------------------------------------------------------------

const PERIODS = [
  { key: '30', label: '30 дней' },
  { key: '90', label: '90 дней' },
  { key: '365', label: 'Год' },
  { key: 'all', label: 'Всё время' },
]

function StatTile({ label, value, hint }) {
  return (
    <div className="bg-surface rounded-xl border border-border px-4 py-3">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {hint && <div className="text-xs text-text-muted">{hint}</div>}
    </div>
  )
}

function BarRows({ rows, valueKey = 'count', format = (v) => v, colorKey }) {
  const max = Math.max(1, ...rows.map((r) => r[valueKey] || 0))
  if (!rows.length) return <p className="text-sm text-text-muted">Нет данных</p>
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.key || r.stageId || r.month} className="text-sm">
          <div className="flex justify-between gap-2"><span className="truncate">{r.label || r.name || r.month}</span><span className="shrink-0 font-medium">{format(r[valueKey], r)}</span></div>
          <div className="h-2 rounded-full bg-surface-2 overflow-hidden mt-1">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(((r[valueKey] || 0) / max) * 100)}%`, ...(colorKey && r[colorKey] ? { backgroundColor: r[colorKey] } : {}) }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function SalesAnalyticsPage() {
  const [period, setPeriod] = useState('90')
  const [openedAt] = useState(() => Date.now())
  const since = period === 'all' ? null : new Date(openedAt - Number(period) * DAY_MS).toISOString()
  const { profiles } = useProfiles()
  const { data, loading, error, refetch } = useAsyncData(
    async () => {
      const [deals, pipelines, reasons, stageActs] = await Promise.all([
        listDeals({ includeArchived: false }), listPipelines(), listLostReasons({ includeArchived: true }), listStageActivities(since),
      ])
      return { deals, pipelines, reasons, stageActs }
    },
    String(since),
    'crm.SalesAnalyticsPage',
  )

  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (loading || !data) return <Skeleton className="h-64 w-full" />

  const stages = data.pipelines.flatMap((p) => p.stages)
  const stagesById = Object.fromEntries(stages.map((s) => [s.id, s]))
  const pipeline = data.pipelines.find((p) => p.is_default) || data.pipelines[0]
  const inPeriod = dealsInPeriod(data.deals, since, null)
  const s = summarizeSales(inPeriod, stagesById)
  const funnel = buildFunnel(inPeriod.filter((d) => d.pipeline_id === pipeline?.id), pipeline?.stages || [], data.stageActs)
  const reasonsById = Object.fromEntries(data.reasons.map((r) => [r.id, r]))
  const lost = groupDeals(inPeriod.filter((d) => stagesById[d.stage_id]?.kind === 'lost'), stagesById, (d) => d.lost_reason_id, (k) => reasonsById[k]?.name || 'Не указана')
  const sources = groupDeals(inPeriod, stagesById, (d) => d.source, (k) => ORDER_SOURCE_LABELS[k] || 'Не указан')
  const owners = groupDeals(inPeriod, stagesById, (d) => d.owner_id, (k) => profiles.find((p) => p.id === k)?.display_name || 'Без ответственного')
  const forecast = forecastByMonth(data.deals, stagesById)
  const monthLabel = (m) => (m === 'без даты' ? m : new Date(`${m}-01T00:00:00`).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }))

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight">Аналитика продаж</h1>
          <p className="text-text-muted text-sm">Сделки, созданные за период</p>
        </div>
        <Tabs items={PERIODS} active={period} onChange={setPeriod} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Новых сделок" value={s.created} />
        <StatTile label="Выиграно" value={`${s.won} · ${formatPrice(s.wonSum)}`} hint={s.winRate != null ? `доля выигранных ${s.winRate}%` : 'закрытых пока нет'} />
        <StatTile label="Средний чек" value={formatPrice(s.avgWon)} hint={s.avgCycleDays != null ? `цикл ~${s.avgCycleDays} дн.` : ''} />
        <StatTile label="В работе" value={`${s.open} · ${formatPrice(s.openSum)}`} hint={`проиграно ${s.lost}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-surface rounded-xl border border-border p-4 space-y-3">
          <h2 className="font-semibold">Воронка «{pipeline?.name}»</h2>
          <BarRows rows={funnel} colorKey="color" format={(v, r) => `${v} · ${r.pct}%`} />
        </section>
        <section className="bg-surface rounded-xl border border-border p-4 space-y-3">
          <h2 className="font-semibold">Прогноз по месяцам закрытия</h2>
          <p className="text-xs text-text-muted">Сумма открытых сделок × вероятность этапа</p>
          <BarRows
            rows={forecast.map((r) => ({ ...r, label: `${monthLabel(r.month)}${r.overdue ? ' (просрочено)' : ''}` }))}
            valueKey="weighted"
            format={(v, r) => `${formatPrice(v)} из ${formatPrice(r.sum)}`}
          />
        </section>
        <section className="bg-surface rounded-xl border border-border p-4 space-y-3">
          <h2 className="font-semibold">Причины проигрыша</h2>
          <BarRows rows={lost} />
        </section>
        <section className="bg-surface rounded-xl border border-border p-4 space-y-3">
          <h2 className="font-semibold">Источники</h2>
          <BarRows rows={sources} format={(v, r) => `${v} · выиграно ${r.won}`} />
        </section>
        <section className="bg-surface rounded-xl border border-border p-4 space-y-3 lg:col-span-2">
          <h2 className="font-semibold">По ответственным</h2>
          <BarRows rows={owners} valueKey="wonSum" format={(v, r) => `${formatPrice(v)} · ${r.won} из ${r.count}`} />
        </section>
      </div>
    </div>
  )
}
