import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
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
import { useCrmCompany, useCrmDirectory } from '../hooks/useCrmData'
import { DealFormModal } from '../components/DealFormModal'
import { ActivityFeed } from '../components/ActivityFeed'
import { MergeClientModal } from '../components/MergeClientModal'
import { setCompanyArchived, setContactArchived } from '../lib/crm-api'
import { computeClientMetrics, contactFullName } from '../lib/client-metrics'
import { CompanyFormModal } from '../components/CompanyFormModal'
import { ContactFormModal } from '../components/ContactFormModal'
import { IdentityList } from '../components/IdentityList'

function Metric({ label, value, tone = '' }) {
  return (
    <div className="bg-surface rounded-xl border border-border px-4 py-3">
      <div className="text-xs text-text-muted">{label}</div>
      <div className={`text-lg font-semibold ${tone}`}>{value}</div>
    </div>
  )
}

/**
 * R28.0 — карточка клиента: реквизиты, метрики, контакты, заказы.
 * Сделки и лента активности добавятся сюда в R28.1–R28.2.
 */
export default function CrmClientDetailPage() {
  const { id } = useParams()
  const { data, loading, error, refetch } = useCrmCompany(id)
  const canEdit = useCanDo('crm:edit')
  const canSeeFinance = useCanDo('view:finance')
  const { profiles } = useProfiles()
  const [editingCompany, setEditingCompany] = useState(false)
  const [contactModal, setContactModal] = useState(null) // { contact } — null = закрыто
  const [confirm, setConfirm] = useState(null) // { kind: 'company'|'contact', target? }
  const [creatingDeal, setCreatingDeal] = useState(false)
  const [merging, setMerging] = useState(false)
  const canManage = useCanDo('crm:manage')
  const { pipelines } = useCrmDirectory()

  const metrics = useMemo(() => computeClientMetrics(data?.orders || []), [data?.orders])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }
  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (!data?.company) {
    return (
      <div className="py-12 text-center space-y-3">
        <p className="text-text-muted">Клиент не найден или нет доступа</p>
        <Link to="/crm/clients" className="text-accent hover:underline">К списку клиентов</Link>
      </div>
    )
  }

  const { company, contacts, orders, deals = [] } = data
  const stagesById = Object.fromEntries(pipelines.flatMap((p) => p.stages).map((s) => [s.id, s]))
  const owner = profiles.find((p) => p.id === company.owner_id)
  const isArchived = !!company.archived_at
  const restoring = confirm?.kind === 'company' && isArchived

  async function doArchive() {
    const { kind, target } = confirm
    setConfirm(null)
    try {
      if (kind === 'company') await setCompanyArchived(company.id, !isArchived)
      else await setContactArchived(target.id, true)
      toast.success(kind === 'company' ? (isArchived ? 'Клиент возвращён из архива' : 'Клиент в архиве') : 'Контакт в архиве')
      refetch()
    } catch (err) {
      captureError(err, { tags: { source: 'crm.CrmClientDetailPage.archive' } })
      toast.error(translateError(err).message)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <Link to="/crm/clients" className="text-sm text-text-muted hover:text-text">← Клиенты</Link>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mt-1">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold font-display tracking-tight break-words">
              {company.name}
              {isArchived && <span className="ml-2 align-middle text-xs font-medium px-2 py-0.5 rounded-full bg-surface-2 text-text-muted">в архиве</span>}
            </h1>
            <p className="text-sm text-text-muted">
              {company.kind === 'person' ? 'Физлицо' : 'Компания'}
              {company.inn ? ` · ИНН ${company.inn}` : ''}
              {company.source ? ` · ${ORDER_SOURCES[company.source]?.label || company.source}` : ''}
              {owner ? ` · ответственный ${owner.display_name}` : ''}
            </p>
          </div>
          {canEdit && (
            <div className="flex gap-2 shrink-0">
              <Button variant="secondary" onClick={() => setConfirm({ kind: 'company' })}>
                {isArchived ? 'Из архива' : 'В архив'}
              </Button>
              {canManage && !isArchived && <Button variant="secondary" onClick={() => setMerging(true)}>Объединить</Button>}
              <Button onClick={() => setEditingCompany(true)}>Изменить</Button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric label="Заказов" value={metrics.ordersCount} />
        <Metric label="В работе" value={metrics.inProgress} />
        {canSeeFinance && <Metric label="Выручка (LTV)" value={formatPrice(metrics.ltv)} />}
        {canSeeFinance && <Metric label="Средний чек" value={formatPrice(metrics.avgCheck)} />}
        <Metric
          label={metrics.isSleeping ? 'Давно не заказывал' : 'Последний заказ'}
          value={metrics.lastOrderAt ? formatDate(metrics.lastOrderAt) : '—'}
          tone={metrics.isSleeping ? 'text-warning' : ''}
        />
      </div>

      {(company.phone || company.email || company.website || company.comment) && (
        <section className="bg-surface rounded-xl border border-border p-4 space-y-1 text-sm">
          {company.phone && <div><span className="text-text-muted">Телефон: </span><a className="text-accent hover:underline" href={`tel:${company.phone}`}>{company.phone}</a></div>}
          {company.email && <div><span className="text-text-muted">Email: </span><a className="text-accent hover:underline" href={`mailto:${company.email}`}>{company.email}</a></div>}
          {company.website && <div><span className="text-text-muted">Сайт: </span>{company.website}</div>}
          {company.comment && <p className="whitespace-pre-wrap pt-1">{company.comment}</p>}
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Контакты <span className="text-text-muted font-normal">{contacts.length}</span></h2>
          {canEdit && <Button size="sm" variant="secondary" onClick={() => setContactModal({ contact: null })}>+ Контакт</Button>}
        </div>
        {contacts.length === 0 ? (
          <p className="text-sm text-text-muted">Пока нет контактных лиц</p>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {contacts.map((c) => (
              <li key={c.id} className="bg-surface rounded-xl border border-border p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{contactFullName(c)}</div>
                    {c.position && <div className="text-xs text-text-muted">{c.position}</div>}
                  </div>
                  {canEdit && (
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => setContactModal({ contact: c })}>Изменить</Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'contact', target: c })}>В архив</Button>
                    </div>
                  )}
                </div>
                <IdentityList identities={c.identities} />
                {c.notes && <p className="text-sm text-text-muted whitespace-pre-wrap">{c.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Сделки <span className="text-text-muted font-normal">{deals.length}</span></h2>
          {canEdit && <Button size="sm" variant="secondary" onClick={() => setCreatingDeal(true)}>+ Сделка</Button>}
        </div>
        {deals.length === 0 ? (
          <p className="text-sm text-text-muted">Сделок пока нет</p>
        ) : (
          <ul className="bg-surface rounded-xl border border-border divide-y divide-border">
            {deals.map((d) => {
              const st = stagesById[d.stage_id]
              return (
                <li key={d.id}>
                  <Link to={`/crm/deals/${d.id}`} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 px-4 py-3 hover:bg-surface-2">
                    <span className="text-xs text-text-muted sm:w-14 shrink-0">№ {d.number}</span>
                    <span className="flex-1 min-w-0 truncate font-medium">{d.title}</span>
                    <span className="inline-flex items-center gap-1.5 text-xs shrink-0">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: st?.color }} aria-hidden="true" />
                      {st?.name || '—'}
                    </span>
                    <span className="text-sm shrink-0">{d.amount != null ? formatPrice(d.amount) : ''}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Заказы <span className="text-text-muted font-normal">{orders.length}</span></h2>
        {orders.length === 0 ? (
          <p className="text-sm text-text-muted">Заказов пока нет</p>
        ) : (
          <ul className="bg-surface rounded-xl border border-border divide-y divide-border">
            {orders.map((o) => (
              <li key={o.id}>
                <Link to={`/orders/${o.id}`} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 px-4 py-3 hover:bg-surface-2">
                  <span className="font-medium sm:w-20 shrink-0">№ {formatOrderNumber(o)}</span>
                  <span className="flex-1 min-w-0 truncate text-sm">
                    {o.deal_name || formatOrderType(o)}{o.qty ? ` · ${o.qty} шт` : ''}
                  </span>
                  <span className="text-xs text-text-muted shrink-0">{formatDate(o.created_at)}</span>
                  {canSeeFinance && o.price_final != null && <span className="text-sm shrink-0">{formatPrice(o.price_final)}</span>}
                  <StatusBadge status={o.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ActivityFeed target={{ clientId: company.id }} scopeBy="client" orders={orders} />

      {merging && <MergeClientModal isOpen onClose={() => setMerging(false)} company={company} onMerged={refetch} />}

      <DealFormModal
        isOpen={creatingDeal}
        onClose={() => setCreatingDeal(false)}
        pipelines={pipelines}
        defaultClient={{ id: company.id, name: company.name }}
        onSaved={refetch}
      />
      <CompanyFormModal isOpen={editingCompany} onClose={() => setEditingCompany(false)} company={company} onSaved={refetch} />
      <ContactFormModal
        isOpen={!!contactModal}
        onClose={() => setContactModal(null)}
        contact={contactModal?.contact || null}
        defaultClient={{ id: company.id, name: company.name }}
        onSaved={refetch}
      />
      <ConfirmDialog
        isOpen={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={doArchive}
        variant={restoring ? 'primary' : 'danger'}
        title={confirm?.kind === 'company' ? (restoring ? 'Вернуть из архива?' : 'Отправить клиента в архив?') : 'Отправить контакт в архив?'}
        message={confirm?.kind === 'company'
          ? 'Заказы клиента не изменятся. Архив открывается фильтром «Архив» в списке.'
          : `${contactFullName(confirm?.target)} пропадёт из списков, данные сохранятся.`}
        confirmText={restoring ? 'Вернуть' : 'В архив'}
      />
    </div>
  )
}
