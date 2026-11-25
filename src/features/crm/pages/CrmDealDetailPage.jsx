import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Button from '@/shared/components/Button'
import ConfirmDialog from '@/shared/components/ConfirmDialog'
import ErrorState from '@/shared/components/ErrorState'
import { Skeleton } from '@/shared/components/Skeleton'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import { useProfiles } from '@/features/orders/hooks/useOrders'
import { StatusBadge } from '@/features/orders/components/StatusBadge'
import { ORDER_SOURCES } from '@/shared/constants'
import { formatDate, formatPrice, formatOrderNumber, formatOrderType } from '@/shared/lib/utils'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { captureError } from '@/shared/lib/sentry'
import { useCrmDeal, useCrmDirectory } from '../hooks/useCrmData'
import { useDealMove } from '../hooks/useDealMove'
import { setDealArchived } from '../lib/deals-api'
import { activeStages, daysInStage, isOverdue, isRotting } from '../lib/deals'
import { contactFullName } from '../lib/client-metrics'
import { DealFormModal } from '../components/DealFormModal'
import { LostReasonModal } from '../components/LostReasonModal'

function Field({ label, children }) {
  return (
    <div>
      <div className="text-xs text-text-muted">{label}</div>
      <div className="text-sm">{children || '—'}</div>
    </div>
  )
}

/**
 * R28.1 — карточка сделки: этапы, поля, заказы, «Создать заказ».
 * Лента активности добавится в R28.2.
 */
export default function CrmDealDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, loading, error, refetch } = useCrmDeal(id)
  const { pipelines, lostReasons } = useCrmDirectory()
  const { profiles } = useProfiles()
  const canEdit = useCanDo('crm:edit')
  const canCreateOrder = useCanDo('order:create')
  const [editing, setEditing] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)

  const deal = data?.deal
  const orders = data?.orders || []
  const pipeline = pipelines.find((p) => p.id === deal?.pipeline_id)
  const stages = useMemo(() => activeStages(pipeline?.stages), [pipeline])
  const stage = pipeline?.stages.find((s) => s.id === deal?.stage_id)

  const { requestMove, saving: moving, lostModal } = useDealMove({ onDone: refetch })

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }
  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (!deal) {
    return (
      <div className="py-12 text-center space-y-3">
        <p className="text-text-muted">Сделка не найдена или нет доступа</p>
        <Link to="/crm/deals" className="text-accent hover:underline">К сделкам</Link>
      </div>
    )
  }

  const now = new Date()
  const owner = profiles.find((p) => p.id === deal.owner_id)
  const allOrdersDone = orders.length > 0 && orders.every((o) => o.status === 'done' || o.status === 'cancelled')
  const wonStage = stages.find((s) => s.kind === 'won')

  async function doArchive() {
    setConfirmArchive(false)
    try {
      await setDealArchived(deal.id, !deal.archived_at)
      toast.success(deal.archived_at ? 'Сделка возвращена из архива' : 'Сделка в архиве')
      refetch()
    } catch (err) {
      captureError(err, { tags: { source: 'crm.CrmDealDetailPage.archive' } })
      toast.error(translateError(err).message)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <Link to="/crm/deals" className="text-sm text-text-muted hover:text-text">← Сделки</Link>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mt-1">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold font-display tracking-tight break-words">
              {deal.title}
              {deal.archived_at && <span className="ml-2 align-middle text-xs font-medium px-2 py-0.5 rounded-full bg-surface-2 text-text-muted">в архиве</span>}
            </h1>
            <p className="text-sm text-text-muted">
              Сделка № {deal.number} · создана {formatDate(deal.created_at)}
              {stage?.kind === 'open' ? ` · ${daysInStage(deal, now)} дн. на этапе` : ''}
            </p>
          </div>
          <div className="flex gap-2 shrink-0 flex-wrap">
            {canEdit && <Button variant="secondary" onClick={() => setConfirmArchive(true)}>{deal.archived_at ? 'Из архива' : 'В архив'}</Button>}
            {canEdit && <Button variant="secondary" onClick={() => setEditing(true)}>Изменить</Button>}
            {canCreateOrder && <Button onClick={() => navigate(`/orders/create?deal=${deal.id}`)}>Создать заказ</Button>}
          </div>
        </div>
      </div>

      {/* Этапы воронки — клик переносит сделку */}
      <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
        <div className="flex gap-1 min-w-max" role="group" aria-label="Этап сделки">
          {stages.map((s) => {
            const current = s.id === deal.stage_id
            return (
              <button
                key={s.id}
                type="button"
                disabled={!canEdit || current || moving}
                onClick={() => requestMove(deal, s)}
                aria-current={current ? 'step' : undefined}
                className={`px-3 py-2 min-h-[40px] rounded-lg text-sm border transition-colors ${
                  current ? 'text-white border-transparent' : 'border-border text-text-muted hover:text-text disabled:hover:text-text-muted'
                }`}
                style={current ? { backgroundColor: s.color } : undefined}
              >
                {s.name}
              </button>
            )
          })}
        </div>
      </div>

      {stage?.kind === 'lost' && deal.lost_reason && (
        <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm">
          Проиграна: <b>{deal.lost_reason.name}</b>{deal.lost_comment ? ` — ${deal.lost_comment}` : ''}
        </div>
      )}
      {stage?.kind === 'open' && allOrdersDone && wonStage && canEdit && (
        <div className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
          <span>Все заказы по сделке завершены. Закрыть сделку как выигранную?</span>
          <Button size="sm" onClick={() => requestMove(deal, wonStage)}>Выиграна</Button>
        </div>
      )}

      <section className="bg-surface rounded-xl border border-border p-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Field label="Сумма">{deal.amount != null ? formatPrice(deal.amount) : null}</Field>
        <Field label="Ожидаемое закрытие">
          {deal.expected_close && (
            <span className={isOverdue(deal, stage, now) ? 'text-danger font-medium' : isRotting(deal, stage, now) ? 'text-warning' : ''}>
              {formatDate(deal.expected_close)}
            </span>
          )}
        </Field>
        <Field label="Клиент">
          {deal.client && <Link to={`/crm/clients/${deal.client.id}`} className="text-accent hover:underline">{deal.client.name}</Link>}
        </Field>
        <Field label="Контактное лицо">{deal.contact ? contactFullName(deal.contact) : null}</Field>
        <Field label="Ответственный">{owner?.display_name}</Field>
        <Field label="Источник">{deal.source ? ORDER_SOURCES[deal.source]?.label || deal.source : null}</Field>
        <Field label="Воронка">{pipeline?.name}</Field>
        <Field label="Закрыта">{deal.closed_at ? formatDate(deal.closed_at) : null}</Field>
        {deal.notes && <div className="col-span-2 lg:col-span-4 text-sm whitespace-pre-wrap">{deal.notes}</div>}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Заказы <span className="text-text-muted font-normal">{orders.length}</span></h2>
        {orders.length === 0 ? (
          <p className="text-sm text-text-muted">Заказов по сделке ещё нет{canCreateOrder ? ' — нажмите «Создать заказ»' : ''}</p>
        ) : (
          <ul className="bg-surface rounded-xl border border-border divide-y divide-border">
            {orders.map((o) => (
              <li key={o.id}>
                <Link to={`/orders/${o.id}`} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 px-4 py-3 hover:bg-surface-2">
                  <span className="font-medium sm:w-20 shrink-0">№ {formatOrderNumber(o)}</span>
                  <span className="flex-1 min-w-0 truncate text-sm">{formatOrderType(o)}{o.qty ? ` · ${o.qty} шт` : ''}</span>
                  <span className="text-xs text-text-muted shrink-0">{o.deadline ? `до ${formatDate(o.deadline)}` : ''}</span>
                  <StatusBadge status={o.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DealFormModal isOpen={editing} onClose={() => setEditing(false)} deal={deal} pipelines={pipelines} onSaved={refetch} />
      <LostReasonModal reasons={lostReasons} {...lostModal} />
      <ConfirmDialog
        isOpen={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        onConfirm={doArchive}
        variant={deal.archived_at ? 'primary' : 'danger'}
        title={deal.archived_at ? 'Вернуть сделку из архива?' : 'Отправить сделку в архив?'}
        message="Заказы по сделке не изменятся."
        confirmText={deal.archived_at ? 'Вернуть' : 'В архив'}
      />
    </div>
  )
}
