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
import { useCrmDirectory, useCrmDeals } from '../hooks/useCrmData'
import { useDealMove } from '../hooks/useDealMove'
import { activeStages, weightedForecast, stageTotals, isOverdue, isRotting } from '../lib/deals'
import { DealsBoard } from '../components/DealsBoard'
import { DealFormModal } from '../components/DealFormModal'
import { LostReasonModal } from '../components/LostReasonModal'

// Закрытые сделки на доске — только за последние 30 дней (иначе колонки
// «Выиграна/Проиграна» разрастаются); в списке — все.
const CLOSED_ON_BOARD_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

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
