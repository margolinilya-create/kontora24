import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useClients } from '../hooks/useClients'
import { ClientForm } from '../components/ClientForm'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { formatDate } from '@/shared/lib/utils'
import { MS_PER_DAY } from '@/shared/constants'
import Button from '@/shared/components/Button'
import SearchInput from '@/shared/components/SearchInput'
import Spinner from '@/shared/components/Spinner'

export default function ClientsPage() {
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const debouncedSearch = useDebounce(search, 300)
  const { clients, loading, refetch } = useClients(debouncedSearch)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Клиенты</h1>
          <p className="text-text-muted">{clients.length} клиентов</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          + Новый клиент
        </Button>
      </div>

      {/* Search */}
      <SearchInput
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Поиск по имени, телефону, email..."
        ariaLabel="Поиск клиентов"
        className="max-w-md"
      />

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : clients.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-12 text-center">
          <h3 className="text-lg font-semibold mb-1">{search ? 'Ничего не найдено' : 'Нет клиентов'}</h3>
          <p className="text-text-muted text-sm mb-4">{search ? 'Попробуйте другой запрос' : 'Добавьте первого клиента'}</p>
          {!search && (
            <Button onClick={() => setShowForm(true)}>+ Новый клиент</Button>
          )}
        </div>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="sm:hidden space-y-3">
            {clients.map((client) => (
              <Link
                key={client.id}
                to={`/clients/${client.id}`}
                className="block bg-surface rounded-xl border border-border p-4 hover:border-accent/30 transition-colors active:bg-surface-dim"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-accent">{client.name}</span>
                  <LastOrderCell date={client.last_order_date} />
                </div>
                {(client.phone || client.email) && (
                  <p className="text-sm text-text-muted truncate">
                    {[client.phone, client.email].filter(Boolean).join(' · ')}
                  </p>
                )}
                {client.tags?.length > 0 && (
                  <div className="flex gap-1 flex-wrap mt-2">
                    {client.tags.map((t) => <span key={t} className="bg-accent/10 text-accent text-[10px] px-1.5 py-0.5 rounded-full">{t}</span>)}
                  </div>
                )}
              </Link>
            ))}
          </div>
          {/* Desktop table */}
          <div className="hidden sm:block bg-surface rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Список клиентов</caption>
              <thead>
                <tr className="border-b border-border bg-surface-dim">
                  <th className="text-left px-4 py-3 font-medium text-text-muted">Имя</th>
                  <th className="text-left px-4 py-3 font-medium text-text-muted">Телефон</th>
                  <th className="text-left px-4 py-3 font-medium text-text-muted">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-text-muted">Теги</th>
                  <th className="text-left px-4 py-3 font-medium text-text-muted">Последний заказ</th>
                  <th className="text-right px-4 py-3 font-medium text-text-muted">Добавлен</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id} className="border-b border-border last:border-0 hover:bg-surface-dim/50">
                    <td className="px-4 py-3 font-medium"><Link to={`/clients/${client.id}`} className="text-accent hover:underline">{client.name}</Link></td>
                    <td className="px-4 py-3 text-text-muted">{client.phone || '—'}</td>
                    <td className="px-4 py-3 text-text-muted">{client.email || '—'}</td>
                    <td className="px-4 py-3">
                      {client.tags?.length > 0 ? (
                        <div className="flex gap-1 flex-wrap">
                          {client.tags.map((t) => <span key={t} className="bg-accent/10 text-accent text-[10px] px-1.5 py-0.5 rounded-full">{t}</span>)}
                        </div>
                      ) : <span className="text-text-muted">—</span>}
                    </td>
                    <td className="px-4 py-3"><LastOrderCell date={client.last_order_date} /></td>
                    <td className="px-4 py-3 text-right text-text-muted">{formatDate(client.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* New client form */}
      {showForm && (
        <ClientForm
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false)
            refetch()
          }}
        />
      )}
    </div>
  )
}

function LastOrderCell({ date }) {
  if (!date) {
    return <span className="text-text-muted">нет заказов</span>
  }
  const days = Math.floor((new Date() - new Date(date)) / MS_PER_DAY)
  if (days > 90) {
    return (
      <span className="text-danger">
        {days} дн назад <span className="text-[10px] font-medium ml-1 bg-danger/10 px-1.5 py-0.5 rounded-full">спящий</span>
      </span>
    )
  }
  if (days > 30) {
    return <span className="text-warning">{days} дн назад</span>
  }
  return <span className="text-text-muted">{days} дн назад</span>
}
