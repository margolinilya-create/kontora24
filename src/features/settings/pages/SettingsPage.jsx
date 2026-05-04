import { useState, useEffect } from 'react'
import { useSettings, useUsers } from '../hooks/useSettings'
import { ProfileCard } from '../components/ProfileCard'
import { SheetsImport } from '../components/SheetsImport'
import { ROLES } from '@/shared/constants'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/stores/toast-store'
import { formatDateTime } from '@/shared/lib/utils'
import Tabs from '@/shared/components/Tabs'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'
import Modal from '@/shared/components/Modal'

const SETTINGS_TABS = [
  { key: 'profile', label: 'Профиль' },
  { key: 'users', label: 'Пользователи' },
  { key: 'bitrix', label: 'Bitrix24' },
  { key: 'logs', label: 'Логи' },
  { key: 'import', label: 'Импорт' },
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile')

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Настройки</h1>
        <p className="text-text-muted">Параметры производства и управление пользователями</p>
      </div>

      <Tabs items={SETTINGS_TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'profile' && <ProfileCard />}
      {activeTab === 'users' && (
        <>
          <UserManagement />
          <CreateUser />
        </>
      )}
      {activeTab === 'bitrix' && <BitrixSettings />}
      {activeTab === 'logs' && <IntegrationLog />}
      {activeTab === 'import' && <SheetsImport />}
    </div>
  )
}

function UserManagement() {
  const { users, loading, updateUser } = useUsers()
  const [editingUser, setEditingUser] = useState(null)

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <h2 className="font-semibold mb-4">Пользователи</h2>

      {loading ? (
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 bg-border/50 rounded" />)}
        </div>
      ) : users.length === 0 ? (
        <p className="text-text-muted text-sm">Нет пользователей</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Список пользователей</caption>
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 font-medium text-text-muted">Имя</th>
                <th className="text-left py-2 font-medium text-text-muted">Email</th>
                <th className="text-left py-2 font-medium text-text-muted">Роль</th>
                <th className="text-left py-2 font-medium text-text-muted">Статус</th>
                <th className="text-right py-2 font-medium text-text-muted">Добавлен</th>
                <th className="text-right py-2 font-medium text-text-muted sr-only">Действия</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-border last:border-0">
                  <td className="py-3 font-medium">{user.display_name || user.name}</td>
                  <td className="py-3 text-text-muted">{user.email || '—'}</td>
                  <td className="py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLES[user.role]?.color || 'bg-gray-100 text-gray-800'}`}>
                      {ROLES[user.role]?.label || user.role}
                    </span>
                  </td>
                  <td className="py-3">
                    {user.approved === false ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                        Деактивирован
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                        Активен
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-right text-text-muted text-xs">{formatDateTime(user.created_at)}</td>
                  <td className="py-3 text-right">
                    <button
                      onClick={() => setEditingUser(user)}
                      aria-label={`Редактировать ${user.display_name || user.email}`}
                      className="text-text-muted hover:text-accent transition-colors rounded-lg p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSave={updateUser}
        />
      )}
    </div>
  )
}

function EditUserModal({ user, onClose, onSave }) {
  const [form, setForm] = useState({
    display_name: user.display_name || '',
    email: user.email || '',
    role: user.role,
    approved: user.approved !== false,
  })
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.display_name.trim()) return

    setSaving(true)
    try {
      const updates = {}
      if (form.display_name !== user.display_name) updates.display_name = form.display_name
      if (form.email !== user.email) updates.email = form.email
      if (form.role !== user.role) updates.role = form.role
      if (form.approved !== (user.approved !== false)) updates.approved = form.approved
      if (password) updates.password = password

      if (Object.keys(updates).length === 0) {
        onClose()
        return
      }

      await onSave(user.id, updates)
      onClose()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Редактировать пользователя" maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Имя"
          value={form.display_name}
          onChange={(e) => update('display_name', e.target.value)}
          required
        />
        <Input
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => update('email', e.target.value)}
        />
        <div>
          <label htmlFor="edit-user-role" className="block text-sm font-medium text-text mb-1">Роль</label>
          <select
            id="edit-user-role"
            value={form.role}
            onChange={(e) => update('role', e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent/50"
          >
            {Object.entries(ROLES).map(([key, r]) => (
              <option key={key} value={key}>{r.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <input
            id="edit-user-approved"
            type="checkbox"
            checked={form.approved}
            onChange={(e) => update('approved', e.target.checked)}
            className="rounded border-border text-accent focus:ring-accent/50"
          />
          <label htmlFor="edit-user-approved" className="text-sm">
            Активен (может входить в систему)
          </label>
        </div>
        <div className="border-t border-border pt-4">
          <Input
            label="Новый пароль (оставьте пустым, чтобы не менять)"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Минимум 6 символов"
            minLength={6}
          />
        </div>
        <div className="flex gap-2 pt-2">
          <Button type="submit" loading={saving}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function CreateUser() {
  const [form, setForm] = useState({ display_name: '', email: '', password: '', role: 'post_printer' })
  const [saving, setSaving] = useState(false)

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.display_name || !form.email || !form.password) return
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/users/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(form),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)
      toast.success(`Пользователь ${form.display_name} создан`)
      setForm({ display_name: '', email: '', password: '', role: 'post_printer' })
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <h2 className="font-semibold mb-4">Добавить пользователя</h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Имя"
            value={form.display_name}
            onChange={(e) => update('display_name', e.target.value)}
            placeholder="Иван Петров"
            required
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            placeholder="ivan@example.com"
            required
          />
          <Input
            label="Пароль"
            type="password"
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            placeholder="Минимум 6 символов"
            minLength={6}
            required
          />
          <div>
            <label htmlFor="new-user-role" className="block text-sm font-medium text-text mb-1">Роль</label>
            <select
              id="new-user-role"
              value={form.role}
              onChange={(e) => update('role', e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              {Object.entries(ROLES).map(([key, r]) => (
                <option key={key} value={key}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>
        <Button type="submit" loading={saving} className="w-full sm:w-auto">
          Создать пользователя
        </Button>
      </form>
    </div>
  )
}

const FIELD_MAPPING_LABELS = {
  dealTitle: { bitrix: 'Название сделки', kontora: 'Тип заказа' },
  width: { bitrix: 'Ширина (мм)', kontora: 'width_mm' },
  height: { bitrix: 'Высота (мм)', kontora: 'height_mm' },
  qty: { bitrix: 'Количество', kontora: 'qty' },
  clientName: { bitrix: 'Имя клиента', kontora: 'client_name' },
}

const DEFAULT_BITRIX_CONFIG = {
  webhookUrl: '',
  enabled: false,
  fieldMapping: {
    dealTitle: 'order_type',
    width: 'width_mm',
    height: 'height_mm',
    qty: 'qty',
    clientName: 'client_name',
  },
}

function BitrixSettings() {
  const { value: config, loading, save } = useSettings('bitrix')
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (config && !form) {
      setForm({ ...DEFAULT_BITRIX_CONFIG, ...config })
    } else if (!config && !form && !loading) {
      setForm({ ...DEFAULT_BITRIX_CONFIG })
    }
  }, [config, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleTest() {
    if (!form.webhookUrl) {
      toast.error('Введите URL вебхука')
      return
    }
    setTesting(true)
    try {
      const url = new URL(form.webhookUrl)
      if (!url.hostname.includes('bitrix')) {
        toast.info('URL не похож на Bitrix24 webhook')
      } else {
        toast.success('URL корректный')
      }
    } catch {
      toast.error('Некорректный URL')
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      await save(form)
    } catch (err) {
      toast.error('Ошибка: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading || !form) {
    return (
      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="font-semibold mb-4">Bitrix24</h2>
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-8 bg-border/50 rounded" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="font-semibold mb-4">Подключение Bitrix24</h2>

        <div className="space-y-4">
          <div>
            <Input
              id="bitrix-webhook-url"
              label="Webhook URL"
              type="url"
              value={form.webhookUrl}
              onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })}
              placeholder="https://your-domain.bitrix24.ru/rest/1/abc123/"
            />
            <p className="text-xs text-text-muted mt-1">
              Входящий вебхук из Bitrix24. Настройки &rarr; Вебхуки &rarr; Входящий вебхук.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="bitrix-enabled"
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              aria-label="Включить интеграцию с Bitrix24"
              className="rounded border-border text-accent focus:ring-accent/50"
            />
            <label htmlFor="bitrix-enabled" className="text-sm">
              Включена
            </label>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <Button variant="secondary" onClick={handleTest} loading={testing}>
            {testing ? 'Проверка...' : 'Тест URL'}
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="font-semibold mb-4">Маппинг полей</h2>
        <p className="text-sm text-text-muted mb-3">
          Соответствие полей Bitrix24 и Kontora24 при создании заказа через вебхук.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Маппинг полей Bitrix24</caption>
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 font-medium text-text-muted">Поле Bitrix24</th>
                <th className="text-left py-2 font-medium text-text-muted">Поле Kontora24</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(form.fieldMapping || {}).map(([key, value]) => {
                const labels = FIELD_MAPPING_LABELS[key] || { bitrix: key, kontora: value }
                return (
                  <tr key={key} className="border-b border-border last:border-0">
                    <td className="py-2.5">{labels.bitrix}</td>
                    <td className="py-2.5">
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => setForm({
                          ...form,
                          fieldMapping: { ...form.fieldMapping, [key]: e.target.value },
                        })}
                        aria-label={`Маппинг поля ${labels.bitrix}`}
                        className="rounded border border-border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 w-full max-w-xs"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function IntegrationLog() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    async function fetchLogs() {
      const { data } = await supabase
        .from('k24_integration_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      setLogs(data || [])
      setLoading(false)
    }
    fetchLogs()
  }, [])

  const directionLabel = (d) => d === 'incoming' ? 'Входящий' : 'Исходящий'

  const statusBadge = (s) => {
    const colors = {
      success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
      error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      retry: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    }
    return colors[s] || 'bg-gray-100 text-gray-800'
  }

  if (loading) {
    return (
      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="font-semibold mb-4">Логи интеграции</h2>
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-border/50 rounded" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <h2 className="font-semibold mb-4">Логи интеграции</h2>

      {logs.length === 0 ? (
        <p className="text-text-muted text-sm">Нет записей</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Логи интеграции с Bitrix24</caption>
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 font-medium text-text-muted">Дата</th>
                <th className="text-left py-2 font-medium text-text-muted">Направление</th>
                <th className="text-left py-2 font-medium text-text-muted">Статус</th>
                <th className="text-left py-2 font-medium text-text-muted">Endpoint</th>
                <th className="text-left py-2 font-medium text-text-muted">Ошибка</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-border last:border-0 cursor-pointer hover:bg-surface-dim transition-colors"
                  onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                >
                  <td className="py-2.5 whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                  <td className="py-2.5">{directionLabel(log.direction)}</td>
                  <td className="py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(log.status)}`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="py-2.5 text-text-muted text-xs max-w-[200px] truncate">{log.endpoint || '---'}</td>
                  <td className="py-2.5 text-text-muted text-xs max-w-[200px] truncate">{log.error_message || '---'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {expandedId && (() => {
            const log = logs.find((l) => l.id === expandedId)
            if (!log) return null
            return (
              <div className="mt-3 p-3 bg-surface-dim rounded-lg text-xs space-y-2">
                {log.payload && (
                  <div>
                    <span className="font-medium text-text-muted">Payload:</span>
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-text-muted">
                      {JSON.stringify(log.payload, null, 2)}
                    </pre>
                  </div>
                )}
                {log.response && (
                  <div>
                    <span className="font-medium text-text-muted">Response:</span>
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-text-muted">
                      {JSON.stringify(log.response, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
