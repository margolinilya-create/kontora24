import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Button from '@/shared/components/Button'
import Tabs from '@/shared/components/Tabs'
import SearchInput from '@/shared/components/SearchInput'
import ErrorState from '@/shared/components/ErrorState'
import { TableSkeleton } from '@/shared/components/Skeleton'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import { formatDate } from '@/shared/lib/utils'
import { useCrmCompanies, useCrmContacts } from '../hooks/useCrmData'
import { PAGE_SIZE } from '../lib/crm-api'
import { contactFullName } from '../lib/client-metrics'
import { CompanyFormModal } from '../components/CompanyFormModal'
import { ContactFormModal } from '../components/ContactFormModal'
import { IdentityList } from '../components/IdentityList'
import { ImportClientsModal } from '../components/ImportClientsModal'
import { fetchExportData } from '../lib/crm-ops'
import { buildExportAoa } from '../lib/import-clients'
import { downloadXlsxBook } from '@/shared/lib/export-xlsx'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { captureError } from '@/shared/lib/sentry'

const TABS = [
  { key: 'clients', label: 'Клиенты' },
  { key: 'contacts', label: 'Контакты' },
]

const KIND_FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'company', label: 'Компании' },
  { key: 'person', label: 'Физлица' },
]

function Pager({ page, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  if (total <= PAGE_SIZE) return null
  return (
    <div className="flex items-center justify-between gap-3 pt-3 text-sm text-text-muted">
      <span>Стр. {page} из {pages} · всего {total}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Назад</Button>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Вперёд</Button>
      </div>
    </div>
  )
}

function ClientsTab({ search, archived }) {
  const navigate = useNavigate()
  const [kind, setKind] = useState('all')
  const [page, setPage] = useState(1)
  const { rows, total, loading, error, refetch } = useCrmCompanies({ search, kind, archived, page })

  if (error) return <ErrorState error={error} onRetry={refetch} hideHomeButton />

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Тип клиента">
        {KIND_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => { setKind(f.key); setPage(1) }}
            aria-pressed={kind === f.key}
            className={`px-3 py-1.5 min-h-[36px] rounded-full text-sm border ${
              kind === f.key ? 'border-accent bg-accent/10 text-text' : 'border-border text-text-muted hover:text-text'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? <TableSkeleton rows={6} cols={4} /> : rows.length === 0 ? (
        <p className="text-sm text-text-muted py-8 text-center">Никого не нашли</p>
      ) : (
        <ul className="bg-surface rounded-xl border border-border divide-y divide-border">
          {rows.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => navigate(`/crm/clients/${c.id}`)}
                className="w-full text-left px-4 py-3 hover:bg-surface-2 focus-visible:outline-none focus-visible:bg-surface-2 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{c.name}</div>
                  <div className="text-xs text-text-muted">
                    {c.kind === 'person' ? 'Физлицо' : 'Компания'}
                    {c.inn ? ` · ИНН ${c.inn}` : ''}
                    {c.phone ? ` · ${c.phone}` : ''}
                  </div>
                </div>
                <div className="text-xs text-text-muted shrink-0">
                  Контактов: {c.contacts_count} · с {formatDate(c.created_at)}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} total={total} onPage={setPage} />
    </div>
  )
}

function ContactsTab({ search, archived, canEdit }) {
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState(null)
  const { rows, total, loading, error, refetch } = useCrmContacts({ search, archived, page })

  if (error) return <ErrorState error={error} onRetry={refetch} hideHomeButton />

  return (
    <div className="space-y-3">
      {loading ? <TableSkeleton rows={6} cols={3} /> : rows.length === 0 ? (
        <p className="text-sm text-text-muted py-8 text-center">Контактов нет</p>
      ) : (
        <ul className="bg-surface rounded-xl border border-border divide-y divide-border">
          {rows.map((c) => (
            <li key={c.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <div className="flex-1 min-w-0">
                <div className="font-medium">
                  {canEdit ? (
                    <button onClick={() => setEditing(c)} className="hover:underline text-left">{contactFullName(c)}</button>
                  ) : contactFullName(c)}
                  {c.position && <span className="text-text-muted font-normal"> · {c.position}</span>}
                </div>
                {c.client && (
                  <Link to={`/crm/clients/${c.client.id}`} className="text-xs text-accent hover:underline">{c.client.name}</Link>
                )}
              </div>
              <IdentityList identities={c.identities} compact />
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} total={total} onPage={setPage} />
      <ContactFormModal isOpen={!!editing} contact={editing} onClose={() => setEditing(null)} onSaved={refetch} />
    </div>
  )
}

/**
 * R28.0 — раздел CRM «Клиенты»: компании/физлица и контакты.
 */
export default function CrmClientsPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'contacts' ? 'contacts' : 'clients'
  const [query, setQuery] = useState('')
  const [archived, setArchived] = useState(false)
  const [creating, setCreating] = useState(null) // 'client' | 'contact'
  const [reloadKey, setReloadKey] = useState(0)
  const search = useDebounce(query, 300)
  const navigate = useNavigate()
  const canEdit = useCanDo('crm:edit')
  const canImport = useCanDo('crm:import')
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)

  async function doExport() {
    setExporting(true)
    try {
      const { clients, contactsByClient } = await fetchExportData()
      await downloadXlsxBook(`клиенты-${new Date().toISOString().slice(0, 10)}.xlsx`, [
        { name: 'Клиенты', aoa: buildExportAoa(clients, contactsByClient) },
      ])
    } catch (err) {
      captureError(err, { tags: { source: 'crm.CrmClientsPage.export' } })
      toast.error(translateError(err).message)
    } finally {
      setExporting(false)
    }
  }

  function selectTab(key) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', key)
      return next
    }, { replace: true })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight">Клиенты</h1>
          <p className="text-text-muted text-sm">База клиентов и контактных лиц</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            {canImport && <Button variant="ghost" onClick={() => setImporting(true)}>Импорт</Button>}
            {canImport && <Button variant="ghost" loading={exporting} onClick={doExport}>Экспорт</Button>}
            <Button variant="secondary" onClick={() => setCreating('contact')}>+ Контакт</Button>
            <Button onClick={() => setCreating('client')}>+ Клиент</Button>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <Tabs items={TABS} active={tab} onChange={selectTab} />
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tab === 'clients' ? 'Название, ИНН, телефон, email' : 'Имя, телефон, email, Telegram'}
          className="flex-1"
        />
        <label className="flex items-center gap-2 text-sm text-text-muted min-h-[44px]">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          Архив
        </label>
      </div>

      {tab === 'clients'
        ? <ClientsTab key={`c${reloadKey}`} search={search} archived={archived} />
        : <ContactsTab key={`p${reloadKey}`} search={search} archived={archived} canEdit={canEdit} />}

      <CompanyFormModal
        isOpen={creating === 'client'}
        onClose={() => setCreating(null)}
        onSaved={(saved) => saved?.id && navigate(`/crm/clients/${saved.id}`)}
      />
      <ImportClientsModal isOpen={importing} onClose={() => setImporting(false)} onDone={() => setReloadKey((k) => k + 1)} />
      <ContactFormModal
        isOpen={creating === 'contact'}
        onClose={() => setCreating(null)}
        onSaved={() => { selectTab('contacts'); setReloadKey((k) => k + 1) }}
      />
    </div>
  )
}
