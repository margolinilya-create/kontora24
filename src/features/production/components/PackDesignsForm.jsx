import { useState } from 'react'
import Button from '@/shared/components/Button'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'

/**
 * Виджет ввода по видам стикеров для 3D-стикерпака.
 * Используется на печать / резка / заливка — лейблы зависят от mode.
 *
 *  mode='pouring' (default): «Залить» + «Брак»
 *  mode='print':   «Напечатано» (без брака — печать не учитывает дефекты)
 *  mode='cutting': «Нарезано» + «Брак»
 */
const MODE_LABELS = {
  pouring:  { value: 'Залить', valueAria: 'Залить, шт', showDefects: true,  errorEmpty: 'Введите залито или брак' },
  print:    { value: 'Напечатано', valueAria: 'Напечатано, шт', showDefects: false, errorEmpty: 'Введите кол-во напечатанных' },
  cutting:  { value: 'Нарезано', valueAria: 'Нарезано, шт', showDefects: true,  errorEmpty: 'Введите нарезано или брак' },
}

export function PackDesignsForm({ designs, addProgress, updateName, readOnly = false, mode = 'pouring' }) {
  const labels = MODE_LABELS[mode] || MODE_LABELS.pouring
  const [drafts, setDrafts] = useState({}) // { [designId]: { poured, defects } }
  const [savingId, setSavingId] = useState(null)
  const [editingNameId, setEditingNameId] = useState(null)

  function setField(id, key, value) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }))
  }

  async function handleSubmit(designId) {
    const draft = drafts[designId] || {}
    const poured = Number(draft.poured || 0)
    const defects = labels.showDefects ? Number(draft.defects || 0) : 0
    if (poured === 0 && defects === 0) {
      toast.error(labels.errorEmpty)
      return
    }
    setSavingId(designId)
    try {
      await addProgress(designId, { poured, defects })
      toast.success('Записано')
      setDrafts((prev) => { const n = { ...prev }; delete n[designId]; return n })
    } catch (err) {
      toast.error(translateError(err).message || err.message)
    } finally {
      setSavingId(null)
    }
  }

  if (!designs?.length) {
    return (
      <p className="text-sm text-text-muted">
        Виды не созданы. Проверьте, что у заказа указано «Стикеров в паке».
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {designs.map((d) => {
        const total = d.qty_poured + d.qty_defects
        const remaining = Math.max(0, d.qty_target - total)
        const pct = d.qty_target > 0 ? Math.min(100, Math.round((total / d.qty_target) * 100)) : 0
        const isComplete = total >= d.qty_target
        const isSaving = savingId === d.id
        const isEditingName = editingNameId === d.id

        return (
          <div key={d.id} className={`rounded-xl border p-3 space-y-2 ${isComplete ? 'border-success/30 bg-success/5' : 'border-border'}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-semibold whitespace-nowrap">Вид #{d.design_index}</span>
                {isEditingName ? (
                  <input
                    type="text"
                    autoFocus
                    defaultValue={d.name || ''}
                    placeholder="Название"
                    onBlur={async (e) => {
                      const v = e.target.value.trim()
                      if (v !== (d.name || '')) {
                        try { await updateName(d.id, v) } catch (err) { toast.error(translateError(err).message) }
                      }
                      setEditingNameId(null)
                    }}
                    className="flex-1 min-w-0 rounded-md border border-border px-2 py-1 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                ) : (
                  <button
                    onClick={() => !readOnly && setEditingNameId(d.id)}
                    className="text-sm text-text-muted hover:text-text truncate"
                    disabled={readOnly}
                    title="Изменить название"
                  >
                    {d.name || '— добавить название —'}
                  </button>
                )}
              </div>
              <span className={`text-xs ${isComplete ? 'text-success font-medium' : 'text-text-muted'}`}>
                {d.qty_poured + d.qty_defects} / {d.qty_target} ({pct}%)
              </span>
            </div>

            {/* Progress */}
            <div className="h-1.5 bg-surface-dim rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${isComplete ? 'bg-success' : 'bg-accent'}`}
                style={{ width: `${pct}%` }}
              />
            </div>

            {/* Inputs */}
            {!readOnly && !isComplete && (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-text-muted mb-0.5">{labels.valueAria}</label>
                  <input
                    type="number"
                    min="0"
                    value={drafts[d.id]?.poured ?? ''}
                    onChange={(e) => setField(d.id, 'poured', e.target.value)}
                    placeholder="0"
                    className="w-full rounded-md border border-border px-2 py-1.5 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>
                {labels.showDefects && (
                  <div className="flex-1">
                    <label className="block text-xs text-text-muted mb-0.5">Брак, шт</label>
                    <input
                      type="number"
                      min="0"
                      value={drafts[d.id]?.defects ?? ''}
                      onChange={(e) => setField(d.id, 'defects', e.target.value)}
                      placeholder="0"
                      className="w-full rounded-md border border-border px-2 py-1.5 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/50"
                    />
                  </div>
                )}
                <Button size="sm" loading={isSaving} onClick={() => handleSubmit(d.id)}>+</Button>
                <span className="text-xs text-text-muted whitespace-nowrap pb-1.5">осталось {remaining}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
