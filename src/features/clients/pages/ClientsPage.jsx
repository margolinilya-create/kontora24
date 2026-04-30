import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useClients } from '../hooks/useClients'
import { ClientForm } from '../components/ClientForm'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { formatDate } from '@/shared/lib/utils'

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
        <button
          onClick={() => setShowForm(true)}
          className="bg-accent hover:bg-accent-hover text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
        >
          + Новый клиент
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <svg className="absolute left-3 top-2.5 w-4 h-4 text-text-muted" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по имени, телефону, email..."
          className="w-full pl-9 rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent" />
        </div>
      ) : clients.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-12 text-center">
          <p className="text-text-muted">{search ? 'Ничего не найдено' : 'Нет клиентов'}</p>
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-dim">
                <th className="text-left px-4 py-3 font-medium text-text-muted">Имя</th>
                <th className="text-left px-4 py-3 font-medium text-text-muted">Телефон</th>
                <th className="text-left px-4 py-3 font-medium text-text-muted">Email</th>
                <th className="text-left px-4 py-3 font-medium text-text-muted">Теги</th>
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
                  <td className="px-4 py-3 text-right text-text-muted">{formatDate(client.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
