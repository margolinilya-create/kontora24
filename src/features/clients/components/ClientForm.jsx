import { useState } from 'react'
import { createClient } from '../hooks/useClients'

export function ClientForm({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', comment: '' })
  const [loading, setLoading] = useState(false)

  function update(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setLoading(true)
    try {
      const client = await createClient(form)
      onCreated(client)
    } catch (err) {
      alert('Ошибка: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-surface rounded-xl shadow-xl max-w-sm w-full">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-semibold">Новый клиент</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text text-xl">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Имя *</label>
            <input
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              required
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
              placeholder="Иван Иванов"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Телефон</label>
            <input
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
              placeholder="+7 999 123 45 67"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
              placeholder="email@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Комментарий</label>
            <textarea
              value={form.comment}
              onChange={(e) => update('comment', e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-hover text-white font-medium rounded-lg py-2.5 text-sm transition-colors disabled:opacity-50"
          >
            {loading ? 'Создание...' : 'Создать клиента'}
          </button>
        </form>
      </div>
    </div>
  )
}
