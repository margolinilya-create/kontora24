import { useState } from 'react'
import { createClient } from '../hooks/useClients'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import Modal from '@/shared/components/Modal'
import Input from '@/shared/components/Input'
import Button from '@/shared/components/Button'

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
      toast.error(translateError(err).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={true} onClose={onClose} title="Новый клиент" maxWidth="max-w-sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Имя *"
          id="client-name"
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          required
          placeholder="Иван Иванов"
          autoFocus
        />
        <Input
          label="Телефон"
          id="client-phone"
          value={form.phone}
          onChange={(e) => update('phone', e.target.value)}
          placeholder="+7 999 123 45 67"
        />
        <Input
          label="Email"
          id="client-email"
          type="email"
          value={form.email}
          onChange={(e) => update('email', e.target.value)}
          placeholder="email@example.com"
        />
        <div>
          <label htmlFor="client-comment" className="block text-sm font-medium text-text mb-1">Комментарий</label>
          <textarea
            id="client-comment"
            value={form.comment}
            onChange={(e) => update('comment', e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none"
          />
        </div>
        <Button type="submit" loading={loading} className="w-full">
          Создать клиента
        </Button>
      </form>
    </Modal>
  )
}
