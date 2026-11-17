import { useCallback, useEffect, useState } from 'react'
import { useOrderTypesStore } from '../store'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { captureError } from '@/shared/lib/sentry'
import Button from '@/shared/components/Button'
import Modal from '@/shared/components/Modal'
import ConfirmDialog from '@/shared/components/ConfirmDialog'
import Tabs from '@/shared/components/Tabs'
import { OrderTypeEditor } from './OrderTypeEditor'
import { StagesCatalog } from './StagesCatalog'
import { typeToDraft } from '../lib/type-draft'
import { fetchOrderTypeUsage, deleteOrderType } from '../lib/order-types-api'
import { routeUnitLabel, toRouteUnits } from '../lib/validate-type-route'

const SUB_TABS = [
  { key: 'types', label: 'Типы' },
  { key: 'stages', label: 'Этапы' },
]

/**
 * R25.7C (ТЗ 7.1): раздел «Типы заказов» в настройках (право
 * order_type:manage — проверяет SettingsPage). Подвкладки: «Типы» (реестр
 * k24_order_types) и «Этапы» (каталог своих этапов, часть D).
 */
export function OrderTypesSettings() {
  const [tab, setTab] = useState('types')
  return (
    <div className="space-y-4">
      <Tabs items={SUB_TABS} active={tab} onChange={setTab} />
      {tab === 'types' ? <TypesList /> : <StagesCatalog />}
    </div>
  )
}

function TypesList() {
  const types = useOrderTypesStore((s) => s.types)
  const stages = useOrderTypesStore((s) => s.stages)
  const reload = useOrderTypesStore((s) => s.load)
  const [usage, setUsage] = useState({})
  const [editing, setEditing] = useState(null) // draft
  const [copyFrom, setCopyFrom] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)

  const loadUsage = useCallback(async () => {
    try {
      setUsage(await fetchOrderTypeUsage())
    } catch (err) {
      captureError(err, { tags: { source: 'OrderTypesSettings.usage' } })
    }
  }, [])
  useEffect(() => { loadUsage() }, [loadUsage])

  const activeStages = stages.filter((s) => !s.archived_at)
  const visible = types.filter((t) => showArchived || !t.archived_at)
  const archivedCount = types.filter((t) => t.archived_at).length

  async function handleSaved() {
    setEditing(null)
    await Promise.all([reload(), loadUsage()])
  }

  async function handleDelete() {
    const t = pendingDelete
    setPendingDelete(null)
    try {
      await deleteOrderType(t.key)
      toast.success('Тип удалён')
      await Promise.all([reload(), loadUsage()])
    } catch (err) {
      toast.error(translateError(err).message)
    }
  }

  function startCopy() {
    const src = types.find((t) => t.key === copyFrom)
    if (!src) { toast.error('Выберите тип, из которого скопировать'); return }
    setEditing(typeToDraft(src, { copy: true }))
    setCopyFrom('')
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold">Типы заказов</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Маршрут и ставки копируются в заказ при создании: правка типа действует только на новые заказы.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Button size="sm" onClick={() => setEditing(typeToDraft(null))}>Новый тип</Button>
          <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} aria-label="Скопировать из типа"
            className="rounded-lg border border-border px-2 py-2 text-sm bg-surface min-h-[36px] sm:min-h-[44px]">
            <option value="">Скопировать из…</option>
            {types.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
          </select>
          <Button size="sm" variant="secondary" onClick={startCopy} disabled={!copyFrom}>Копировать</Button>
        </div>
      </div>

      {archivedCount > 0 && (
        <label className="inline-flex items-center gap-2 text-xs text-text-muted">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Показать архивные ({archivedCount})
        </label>
      )}

      <ul className="divide-y divide-border">
        {visible.map((t) => {
          const u = usage[t.key] || { total: 0, active: 0 }
          return (
            <li key={t.key} className={`py-3 flex items-center gap-3 flex-wrap ${t.archived_at ? 'opacity-60' : ''}`}>
              <div className="flex-1 min-w-[14rem]">
                <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                  {t.name}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${t.is_builtin ? 'bg-info/15 text-info' : 'bg-accent/15 text-accent'}`}>
                    {t.is_builtin ? 'встроенный' : 'свой'}
                  </span>
                  {t.is_set && <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-text-muted">набор</span>}
                  {t.archived_at && <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-text-muted">архив</span>}
                </div>
                <div className="text-xs text-text-muted mt-0.5">
                  {toRouteUnits(t.production || [], t.locked_blocks || []).map(routeUnitLabel).join(' → ') || 'без этапов цеха'}
                </div>
                <div className="text-xs text-text-muted">Заказов: {u.total}{u.active ? ` · в работе ${u.active}` : ''}</div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(typeToDraft(t))}>Изменить</Button>
                {!t.is_builtin && u.total === 0 && (
                  <Button size="sm" variant="ghost" className="text-danger" onClick={() => setPendingDelete(t)}>Удалить</Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={editing?.key ? 'Изменить тип' : 'Новый тип'} maxWidth="max-w-3xl">
        {editing && (
          <OrderTypeEditor
            key={editing.key || 'new'}
            initial={editing}
            stageDefs={activeStages}
            onCancel={() => setEditing(null)}
            onSaved={handleSaved}
          />
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleDelete}
        title="Удалить тип?"
        message={pendingDelete ? `Тип «${pendingDelete.name}» без заказов будет удалён.` : ''}
        confirmText="Удалить"
      />
    </div>
  )
}
