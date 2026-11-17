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
import { ORDER_STATUSES, getStatusMeta } from '@/shared/constants'
import { ORDER_FIELDS } from '@/features/warehouse/lib/order-material-categories'

// R25.7B (ТЗ 7.5): этапы, на которых можно вносить расход материала.
// Вехи (новый / оплата / утверждения / выдача / готово) и устаревшие этапы — нет.
const NON_CONSUME_STAGES = new Set([
  'new', 'awaiting_payment', 'design_approval', 'color_approval', 'awaiting_pickup',
  'delivery', 'done', 'cancelled', 'batch_layout', 'selection_pouring', 'subcontract',
])
const CONSUME_STAGE_OPTIONS = Object.entries(ORDER_STATUSES)
  .filter(([k]) => !NON_CONSUME_STAGES.has(k))
  .sort(([, a], [, b]) => a.order - b.order)

/** Короткая сводка отметок категории для строки списка. */
function categoryFlagsSummary(row) {
  const parts = []
  if (row.show_in_order) {
    const field = ORDER_FIELDS[row.order_field]?.label
    parts.push(field ? `В заказе: ${field.toLowerCase()}` : 'В заказе')
    if (row.consume_stage) parts.push(`списание — ${getStatusMeta(row.consume_stage).label}`)
    if (Number(row.norm_per_item) > 0) parts.push(`норма ${row.norm_per_item} на изделие`)
  }
  if (row.count_in_costs) parts.push('в расходах заказа')
  return parts.join(' · ')
}

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
        withOrderFlags
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

function CrudSection({ title, table, usageColumn, canManage, withColor, withOrderFlags = false }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#22c55e')
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null) // { id, name, usage }
  const [flagsId, setFlagsId] = useState(null) // R25.7B: строка с открытыми отметками

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
          <div key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
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
                <span className="flex-1 min-w-0 text-sm">
                  {row.name}
                  {withOrderFlags && categoryFlagsSummary(row) && (
                    <span className="block text-xs text-text-muted">{categoryFlagsSummary(row)}</span>
                  )}
                </span>
                {canManage && (
                  <>
                    {withOrderFlags && 'show_in_order' in row && (
                      <button
                        onClick={() => setFlagsId(flagsId === row.id ? null : row.id)}
                        className="text-xs text-text-muted hover:text-text"
                      >
                        Отметки
                      </button>
                    )}
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
            {withOrderFlags && flagsId === row.id && (
              <CategoryFlagsEditor
                row={row}
                table={table}
                onClose={() => setFlagsId(null)}
                onSaved={async () => { setFlagsId(null); await load() }}
              />
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

/**
 * R25.7B (ТЗ 7.5): отметки категории для заказов и расходов.
 * «Поле в заказе» и этап имеют смысл только при «Показывать при заведении
 * заказа» (CHECK в миграции 105) — без отметки поле сбрасывается.
 */
function CategoryFlagsEditor({ row, table, onClose, onSaved }) {
  const [showInOrder, setShowInOrder] = useState(!!row.show_in_order)
  const [orderField, setOrderField] = useState(row.order_field || '')
  const [consumeStage, setConsumeStage] = useState(row.consume_stage || '')
  const [norm, setNorm] = useState(row.norm_per_item != null ? String(row.norm_per_item) : '')
  const [countInCosts, setCountInCosts] = useState(!!row.count_in_costs)
  const [saving, setSaving] = useState(false)

  function changeField(value) {
    setOrderField(value)
    const def = ORDER_FIELDS[value]?.defaultStage
    if (def && !consumeStage) setConsumeStage(def)
  }

  async function save() {
    const normStr = norm.trim().replace(',', '.')
    const normNum = normStr === '' ? null : Number(normStr)
    if (normNum !== null && !(Number.isFinite(normNum) && normNum > 0)) {
      toast.error('Норма на изделие — число больше нуля или пусто')
      return
    }
    if (showInOrder && !orderField) {
      toast.error('Выберите поле в заказе')
      return
    }
    if (showInOrder && orderField === 'extra' && !consumeStage) {
      toast.error('Выберите этап списания')
      return
    }
    setSaving(true)
    try {
      const patch = {
        show_in_order: showInOrder,
        order_field: showInOrder ? orderField : null,
        consume_stage: showInOrder ? (consumeStage || ORDER_FIELDS[orderField]?.defaultStage || null) : null,
        norm_per_item: normNum,
        count_in_costs: countInCosts,
      }
      const { error } = await supabase.from(table).update(patch).eq('id', row.id)
      if (error) throw error
      toast.success('Отметки сохранены')
      await onSaved()
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setSaving(false)
    }
  }

  const selectClass = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm min-h-[44px]'
  return (
    <div className="basis-full space-y-3 rounded-lg border border-border bg-surface-2/40 p-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showInOrder} onChange={(e) => setShowInOrder(e.target.checked)} className="w-5 h-5" />
        Показывать при заведении заказа
      </label>
      {showInOrder && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="block text-xs text-text-muted mb-1">Поле в заказе</span>
            <select value={orderField} onChange={(e) => changeField(e.target.value)} className={selectClass}>
              <option value="">— выбрать —</option>
              {Object.entries(ORDER_FIELDS).map(([k, f]) => (
                <option key={k} value={k}>{f.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="block text-xs text-text-muted mb-1">Этап списания</span>
            <select value={consumeStage} onChange={(e) => setConsumeStage(e.target.value)} className={selectClass}>
              <option value="">— по умолчанию —</option>
              {CONSUME_STAGE_OPTIONS.map(([k, st]) => (
                <option key={k} value={k}>{st.label}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      <Input
        id={`cat-norm-${row.id}`}
        label="Норма на 1 изделие (для дополнительного материала)"
        type="text"
        inputMode="decimal"
        value={norm}
        onChange={(e) => setNorm(e.target.value)}
        placeholder="Пусто — без прогноза"
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={countInCosts} onChange={(e) => setCountInCosts(e.target.checked)} className="w-5 h-5" />
        Учитывать в расходах заказа
      </label>
      <p className="text-xs text-text-muted">
        «Учитывать в расходах» действует на списания дополнительных материалов после сохранения.
        Расчёт плёнки, ламинации, смолы и коробок в отчётах не меняется.
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} loading={saving}>Сохранить</Button>
        <Button size="sm" variant="ghost" onClick={onClose}>Отмена</Button>
      </div>
    </div>
  )
}
