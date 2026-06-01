import { useEffect } from 'react'
import { useRolePermissionsStore } from '@/features/auth/role-permissions-store'
import { PERMISSIONS, PERMISSION_LABELS, ROLES } from '@/shared/constants'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'

const ROLE_KEYS = ['admin', 'manager', 'designer', 'printer', 'post_printer']

const SECTIONS = [
  { key: 'stages', title: 'Производственные этапы' },
  { key: 'views', title: 'Доступ к разделам' },
  { key: 'actions', title: 'Действия' },
  { key: 'materials', title: 'Материалы / Склад' },
]

/**
 * Таблица «Право × Роль» с чекбоксами для админа.
 * Колонка admin — read-only (всегда true), нельзя отнять у себя.
 * Изменения сохраняются сразу через upsert + оптимистично обновляются в сторе.
 */
export function RolePermissionsTable() {
  const { permissions, loaded, error, load, setPermission } = useRolePermissionsStore()

  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])

  function isChecked(role, perm) {
    return permissions[role]?.has(perm) || false
  }

  async function toggle(role, perm, currentlyAllowed) {
    if (role === 'admin') return
    try {
      await setPermission(role, perm, !currentlyAllowed)
    } catch (err) {
      toast.error(translateError(err).message)
    }
  }

  function permCount(role) {
    return permissions[role]?.size || 0
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="font-semibold">Права ролей</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Изменения применяются мгновенно. Пользователи увидят новые права при следующем логине или обновлении страницы.
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="bg-danger/10 border border-danger/30 text-danger rounded-lg px-3 py-2 text-sm mb-4">
          Не удалось загрузить права: {error.message}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-3 font-medium text-text-muted sticky left-0 bg-surface z-10">
                Право
              </th>
              {ROLE_KEYS.map((role) => (
                <th key={role} className="text-center py-2 px-2 font-medium text-text-muted whitespace-nowrap">
                  <div>{ROLES[role]?.label || role}</div>
                  <div className="text-xs font-normal opacity-60">{permCount(role)} прав</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SECTIONS.map((section) => (
              <>
                <tr key={`${section.key}-h`}>
                  <td colSpan={ROLE_KEYS.length + 1} className="pt-5 pb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                    {section.title}
                  </td>
                </tr>
                {PERMISSIONS[section.key].map((perm) => (
                  <tr key={perm} className="border-b border-border last:border-0 hover:bg-surface-2/40">
                    <td className="py-2 pr-3 sticky left-0 bg-surface z-10 group-hover:bg-surface-2/40">
                      <div className="text-sm">{PERMISSION_LABELS[perm] || perm}</div>
                      <div className="text-xs text-text-muted font-mono">{perm}</div>
                    </td>
                    {ROLE_KEYS.map((role) => {
                      const checked = isChecked(role, perm)
                      const isAdmin = role === 'admin'
                      return (
                        <td key={role} className="text-center py-2 px-2">
                          <input
                            type="checkbox"
                            checked={isAdmin || checked}
                            disabled={isAdmin}
                            onChange={() => toggle(role, perm, checked)}
                            aria-label={`${ROLES[role]?.label}: ${PERMISSION_LABELS[perm] || perm}`}
                            title={isAdmin ? 'admin имеет все права (нельзя изменить)' : ''}
                            className="w-5 h-5 rounded border-border text-accent focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
