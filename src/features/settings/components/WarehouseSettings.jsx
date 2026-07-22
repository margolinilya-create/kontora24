import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'
import Spinner from '@/shared/components/Spinner'
import ConfirmDialog from '@/shared/components/ConfirmDialog'

/**
 * R22.6 (ТЗ 20.07 Фаза 7) — «Настройки склада»: CRUD категорий и складских
 * статусов. При удалении используемой сущности — предупреждение с числом
 * связанных материалов (FK ON DELETE SET NULL — материалы не теряются).
 */
export function WarehouseSettings() {
  const canManage = useCanDo('material:manage')
  return (
    <div className="space-y-8">
      <CrudSection
        title="Категории склада"
        table="k24_warehouse_categories"
        usageColumn="category_id"
        canManage={canManage}
        withColor={false}
      />
      <CrudSection
        title="Статусы склада"
        table="k24_warehouse_statuses"
        usageColumn="wh_status_id"
        canManage={canManage}
        withColor
      />
    </div>
  )
}

function CrudSection({ title, table, usageColumn, canManage, withColor }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#22c55e')
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null) // { id, name, usage }

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from(table).select('*').order('sort_order').order('name')
    if (error) captureError(error, { tags: { source: `WarehouseSettings.${table}` } })
    setRows(data || [])
    setLoading(false)
  }, [table])

  useEffect(() => { load() }, [load])

  async function handleAdd(e) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) { toast.error('Введите название'); return }
    setSaving(true)
    try {
      const payload = { name, sort_order: rows.length }
      if (withColor) payload.color = newColor
      const { error } = await supabase.from(table).insert(payload)
      if (error) throw error
      toast.success('Добавлено')
      setNewName('')
      await load()
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleRename(id) {
    const name = editName.trim()
    if (!name) { toast.error('Введите название'); return }
    try {
      const { error } = await supabase.from(table).update({ name }).eq('id', id)
      if (error) throw error
      setEditId(null)
      await load()
    } catch (err) {
      toast.error(translateError(err).message)
    }
  }

  async function requestDelete(row) {
    // Сколько материалов используют эту сущность.
    const { count } = await supabase
      .from('k24_materials')
      .select('id', { count: 'exact', head: true })
      .eq(usageColumn, row.id)
    setPendingDelete({ id: row.id, name: row.name, usage: count || 0 })
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    try {
      const { error } = await supabase.from(table).delete().eq('id', pendingDelete.id)
      if (error) throw error
      toast.success('Удалено')
      setPendingDelete(null)
      await load()
    } catch (err) {
      toast.error(translateError(err).message)
      setPendingDelete(null)
    }
  }

  if (loading) return <div className="flex justify-center py-6"><Spinner /></div>

  return (
    <section className="space-y-3">
      <h2 className="font-semibold">{title}</h2>

      <div className="bg-surface rounded-xl border border-border divide-y divide-border">
        {rows.length === 0 && <p className="p-4 text-sm text-text-muted">Пока пусто.</p>}
        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-3 px-4 py-2.5">
            {withColor && row.color && (
              <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: row.color }} />
            )}
            {editId === row.id ? (
              <>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
                  autoFocus
                />
                <Button size="sm" onClick={() => handleRename(row.id)}>OK</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Отмена</Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm">{row.name}</span>
                {canManage && (
                  <>
                    <button
                      onClick={() => { setEditId(row.id); setEditName(row.name) }}
                      className="text-xs text-text-muted hover:text-text"
                    >
                      Изменить
                    </button>
                    <button
                      onClick={() => requestDelete(row)}
                      className="text-xs text-danger hover:opacity-80"
                    >
                      Удалить
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {canManage && (
        <form onSubmit={handleAdd} className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              id={`${table}-new`}
              label="Новое название"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Например: Плёнка"
            />
          </div>
          {withColor && (
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="h-[46px] w-12 rounded-lg border border-border bg-surface"
              aria-label="Цвет"
            />
          )}
          <Button type="submit" loading={saving}>Добавить</Button>
        </form>
      )}

      {pendingDelete && (
        <ConfirmDialog
          isOpen
          onClose={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
          title={`Удалить «${pendingDelete.name}»?`}
          message={
            pendingDelete.usage > 0
              ? `Используется в ${pendingDelete.usage} материал(ах). После удаления они останутся без этого значения. Продолжить?`
              : 'Значение нигде не используется. Удалить?'
          }
          confirmText="Удалить"
          variant="danger"
        />
      )}
    </section>
  )
}
