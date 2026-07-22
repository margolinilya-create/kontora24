import { useState } from 'react'
import { reprintStageFields, computeSubtaskStageProgress } from '../../lib/production-logs'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'
import { FILM_TYPES, REPRINT_STATUS_LABELS } from '@/shared/constants'

/**
 * R22.1 (ТЗ 20.07 Фаза 1) — форма учёта работ по этапу допечатки.
 *
 * Single-track: состав полей — reprintStageFields(stage). Плавный прогресс-бар,
 * спиннер на кнопке, «Сохранено», очистка полей после успеха, при ошибке
 * данные не теряются. onSubmit(stage, data) → useReprintSubtask.addLogAndAdvance.
 */
export function SubtaskLogForm({ stage, subtask, order, logs, onSubmit }) {
  const fields = reprintStageFields(stage)
  const [values, setValues] = useState({})
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const progress = computeSubtaskStageProgress(logs, stage, subtask?.qty)

  function filmLabel(field) {
    if (!field.filmFrom) return field.label
    const name = order?.film_material?.name
      || FILM_TYPES[order?.film_type]?.label || order?.film_type
    return name ? `${field.label} · ${name}` : field.label
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const data = {}
    let hasValue = false
    for (const f of fields) {
      const raw = values[f.key]
      if (raw === undefined || raw === '') continue
      const num = Number(raw)
      if (!Number.isFinite(num) || num < 0) {
        toast.error(`"${f.label}" — положительное число`)
        return
      }
      data[f.key] = num
      if (num > 0) hasValue = true
    }
    if (!hasValue) { toast.error('Заполните хотя бы одно поле'); return }
    // Заливка: годные = залито − брак (совместимо с order-формой).
    if (stage === 'pouring') {
      data.stickers_good = Math.max(0, Number(data.stickers_poured || 0))
    }
    if (notes) data.notes = notes

    setSaving(true)
    try {
      const res = await onSubmit(stage, data)
      setValues({})
      setNotes('')
      if (res?.advanced) {
        toast.success(`Этап завершён → ${REPRINT_STATUS_LABELS[res.new_status] || res.new_status}`)
      } else {
        toast.success('Сохранено')
      }
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Прогресс этапа */}
      <div>
        <div className="flex items-center justify-between text-xs text-text-muted mb-1">
          <span>{progress.total} / {progress.target} шт</span>
          <span className={progress.isComplete ? 'text-success font-medium' : ''}>{progress.percentage}%</span>
        </div>
        <div className="h-2 bg-surface-dim rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${progress.isComplete ? 'bg-success' : 'bg-accent'}`}
            style={{ width: `${Math.min(100, progress.percentage)}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.map((f) => (
          <Input
            key={f.key}
            id={`subtask-${f.key}`}
            label={`${filmLabel(f)}${f.unit ? ` (${f.unit})` : ''}`}
            type="number"
            inputMode="decimal"
            step={f.step || '1'}
            min="0"
            value={values[f.key] ?? ''}
            onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
            placeholder="0"
          />
        ))}
      </div>

      <Input
        id="subtask-notes"
        label="Комментарий"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Необязательно"
      />

      <Button type="submit" loading={saving} className="w-full">Записать</Button>
    </form>
  )
}
