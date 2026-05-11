import { useState } from 'react'
import { useUsers } from '../hooks/useSettings'
import { EditUserModal } from './EditUserModal'
import { ROLES } from '@/shared/constants'
import { formatDateTime } from '@/shared/lib/utils'
import { useAuth } from '@/features/auth/hooks/useAuth'
import ConfirmDialog from '@/shared/components/ConfirmDialog'
import { toast } from '@/shared/stores/toast-store'

export function UserManagement() {
  const { users, loading, updateUser, deleteUser } = useUsers()
  const { profile: me } = useAuth()
  const [editingUser, setEditingUser] = useState(null)
  const [deletingUser, setDeletingUser] = useState(null)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!deletingUser) return
    setDeleting(true)
    try {
      await deleteUser(deletingUser.id)
      setDeletingUser(null)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setDeleting(false)
    }
  }

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
              {users.map((user) => {
                const isSelf = me?.id === user.id
                return (
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
                    <td className="py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => setEditingUser(user)}
                        aria-label={`Редактировать ${user.display_name || user.email}`}
                        className="text-text-muted hover:text-accent transition-colors rounded-lg p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                      </button>
                      <button
                        onClick={() => setDeletingUser(user)}
                        disabled={isSelf}
                        aria-label={`Удалить ${user.display_name || user.email}`}
                        title={isSelf ? 'Нельзя удалить собственный аккаунт' : 'Удалить пользователя'}
                        className="text-text-muted hover:text-danger transition-colors rounded-lg p-1.5 ml-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-text-muted"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                      </button>
                    </td>
                  </tr>
                )
              })}
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

      <ConfirmDialog
        isOpen={!!deletingUser}
        onClose={() => setDeletingUser(null)}
        onConfirm={handleDelete}
        title="Удалить пользователя?"
        message={
          deletingUser
            ? `Пользователь «${deletingUser.display_name || deletingUser.email}» будет удалён без возможности восстановления. Связанные с ним заказы останутся, но поле «Исполнитель» сбросится.`
            : ''
        }
        confirmText={deleting ? 'Удаление…' : 'Удалить'}
      />
    </div>
  )
}
