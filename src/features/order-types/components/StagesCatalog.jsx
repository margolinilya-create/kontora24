import { useState } from 'react'
import { useOrderTypesStore } from '../store'
import { useRolePermissionsStore } from '@/features/auth/role-permissions-store'
import { getStatusMeta, ROLES } from '@/shared/constants'
import { BUILTIN_PRODUCTION_STAGES } from '@/shared/lib/route-registry'
import { ORG_DEPARTMENTS, getDepartment, stageDotClass } from '@/shared/lib/department-mapping'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'
import Modal from '@/shared/components/Modal'
import ConfirmDialog from '@/shared/components/ConfirmDialog'
import { createStageDef, updateStageDef, archiveStageDef, deleteStageDef } from '../lib/order-types-api'

// Отделы фазы 1 (k24_stage_defs.department).
const DEPT_OPTIONS = ORG_DEPARTMENTS.filter((d) => ['sales', 'prepress', 'print', '3d', 'osk'].includes(d.id))
// Роли-исполнители (admin и manager получают право всегда).
const WORKER_ROLES = ['designer', 'printer', 'post_printer']

const EMPTY = { name: '', department: 'print', roles: ['printer'], norm: '', showInMenu: true, otkDefect: true }

function rolesForStage(permissions, key) {
  return WORKER_ROLES.filter((r) => permissions[r]?.has(`stage:${key}`))
}

/**
 * R25.7D (ТЗ 7.4): каталог этапов. Встроенные этапы цеха — только чтение;
 * свои этапы — создание (ключ custom_<N> и права stage:<ключ> заводит RPC),
 * правка, архив, удаление неиспользуемого.
 */
export function StagesCatalog() {
  const stages = useOrderTypesStore((s) => s.stages)
  const reload = useOrderTypesStore((s) => s.load)
  const permissions = useRolePermissionsStore((s) => s.permissions)
  const reloadPerms = useRolePermissionsStore((s) => s.load)
  const [editing, setEditing] = useState(null) // { key|null, values }
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)

  async function refresh() {
    await Promise.all([reload(), reloadPerms()])
  }

  async function handleSave(e) {
    e.preventDefault()
    const v = editing.values
    if (!v.name.trim()) { toast.error('Укажите название этапа'); return }
    const norm = v.norm === '' ? null : Number(String(v.norm).replace(',', '.'))
    if (norm != null && !(norm > 0)) { toast.error('Норма должна быть больше нуля (или пусто)'); return }
    setSaving(true)
    try {
      if (editing.key) {
        await updateStageDef(editing.key, {
          name: v.name.trim(), department: v.department, norm_per_8h: norm,
          show_in_menu: v.showInMenu, otk_defect: v.otkDefect, roles: v.roles,
        })
        toast.success('Этап сохранён')
      } else {
        await createStageDef({ name: v.name.trim(), department: v.department, roles: v.roles, norm, showInMenu: v.showInMenu, otkDefect: v.otkDefect })
        toast.success('Этап создан — права на него добавлены в «Права ролей»')
      }
      setEditing(null)
      await refresh()
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive(def, archived) {
    try {
      await archiveStageDef(def.key, archived)
      toast.success(archived ? 'Этап в архиве' : 'Этап возвращён из архива')
      await refresh()
    } catch (err) {
      toast.error(translateError(err).message)
    }
  }

  async function handleDelete() {
    const def = pendingDelete
    setPendingDelete(null)
    try {
      await deleteStageDef(def.key)
      toast.success('Этап удалён')
      await refresh()
    } catch (err) {
      toast.error(translateError(err).message)
    }
  }

  function openEdit(def) {
    setEditing({
      key: def.key,
      values: {
        name: def.name, department: def.department, roles: rolesForStage(permissions, def.key),
        norm: def.norm_per_8h ?? '', showInMenu: def.show_in_menu !== false, otkDefect: def.otk_defect !== false,
      },
    })
  }

  const setValue = (patch) => setEditing((ed) => ({ ...ed, values: { ...ed.values, ...patch } }))

  return (
    <div className="space-y-5">
      <div className="bg-surface rounded-xl border border-border p-5">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div>
            <h2 className="font-semibold">Свои этапы</h2>
            <p className="text-xs text-text-muted mt-0.5">Ключ этапа не меняется при переименовании — история учёта сохраняется. Использованный этап можно только отправить в архив.</p>
          </div>
          <Button size="sm" onClick={() => setEditing({ key: null, values: { ...EMPTY } })}>Новый этап</Button>
        </div>
        {stages.length === 0 ? (
          <p className="text-sm text-text-muted">Своих этапов пока нет.</p>
        ) : (
          <ul className="divide-y divide-border">
            {stages.map((d) => (
              <li key={d.key} className={`py-2.5 flex items-center gap-3 flex-wrap ${d.archived_at ? 'opacity-60' : ''}`}>
                <span className={`w-2 h-2 rounded-full ${stageDotClass(d.key)}`} aria-hidden="true" />
                <div className="flex-1 min-w-[12rem]">
                  <div className="text-sm font-medium">{d.name}{d.archived_at && <span className="ml-2 text-xs text-text-muted">в архиве</span>}</div>
                  <div className="text-xs text-text-muted">
                    {getDepartment(d.key)?.departmentLabel || d.department}
                    {' · '}{d.norm_per_8h ? `норма ${d.norm_per_8h} шт / 8 ч` : 'без нормы (веха)'}
                    {d.show_in_menu !== false ? ' · в меню' : ''}
                    {d.otk_defect !== false ? ' · брак на ТК' : ''}
                    {' · '}<span className="font-mono">{d.key}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(d)}>Изменить</Button>
                  <Button size="sm" variant="ghost" onClick={() => handleArchive(d, !d.archived_at)}>{d.archived_at ? 'Из архива' : 'В архив'}</Button>
                  <Button size="sm" variant="ghost" className="text-danger" onClick={() => setPendingDelete(d)}>Удалить</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="font-semibold mb-1">Встроенные этапы цеха</h2>
        <p className="text-xs text-text-muted mb-3">Только для чтения.</p>
        <div className="flex flex-wrap gap-2">
          {BUILTIN_PRODUCTION_STAGES.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs">
              <span className={`w-1.5 h-1.5 rounded-full ${stageDotClass(s)}`} aria-hidden="true" />
              {getStatusMeta(s)?.label || s}
              <span className="text-text-muted">· {getDepartment(s)?.departmentLabel}</span>
            </span>
          ))}
        </div>
      </div>

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={editing?.key ? 'Изменить этап' : 'Новый этап'} maxWidth="max-w-lg">
        {editing && (
          <form onSubmit={handleSave} className="space-y-3">
            <Input label="Название" value={editing.values.name} onChange={(e) => setValue({ name: e.target.value })} required maxLength={60} />
            <label className="block text-sm">
              <span className="block text-xs text-text-muted mb-1">Отдел</span>
              <select value={editing.values.department} onChange={(e) => setValue({ department: e.target.value })}
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm bg-surface min-h-[44px]">
                {DEPT_OPTIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </label>
            <fieldset>
              <legend className="text-xs text-text-muted mb-1">Кто выполняет (администратор и руководитель — всегда)</legend>
              <div className="flex flex-wrap gap-4">
                {WORKER_ROLES.map((r) => (
                  <label key={r} className="inline-flex items-center gap-2 text-sm min-h-[40px]">
                    <input type="checkbox" checked={editing.values.roles.includes(r)}
                      onChange={(e) => setValue({ roles: e.target.checked ? [...editing.values.roles, r] : editing.values.roles.filter((x) => x !== r) })} />
                    {ROLES[r]?.label || r}
                  </label>
                ))}
              </div>
            </fieldset>
            <Input label="Норма, шт за 8 ч (пусто — веха в планировщике)" type="text" inputMode="decimal" value={editing.values.norm}
              onChange={(e) => { const v = e.target.value; if (v === '' || /^[\d.,]*$/.test(v)) setValue({ norm: v }) }} />
            <label className="flex items-center gap-2 text-sm min-h-[40px]">
              <input type="checkbox" checked={editing.values.showInMenu} onChange={(e) => setValue({ showInMenu: e.target.checked })} />
              Показывать в меню (своя очередь)
            </label>
            <label className="flex items-center gap-2 text-sm min-h-[40px]">
              <input type="checkbox" checked={editing.values.otkDefect} onChange={(e) => setValue({ otkDefect: e.target.checked })} />
              Тип брака на ТК
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Отмена</Button>
              <Button type="submit" loading={saving}>Сохранить</Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleDelete}
        title="Удалить этап?"
        message={pendingDelete ? `Этап «${pendingDelete.name}» будет удалён вместе с правами. Если он уже использовался — удаление будет отклонено, отправьте его в архив.` : ''}
        confirmText="Удалить"
      />
    </div>
  )
}
