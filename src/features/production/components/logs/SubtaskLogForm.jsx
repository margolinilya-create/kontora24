import { useState } from 'react'
import { reprintStageFields, computeSubtaskStageProgress } from '../../lib/production-logs'
import { usePackagingMaterials } from '../../hooks/usePackagingMaterials'
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

  // R24 (фидбэк 24.07): на упаковке подзадачи — учёт БОПП/коробок как на упаковке
  // заказа. Списание со склада делает триггер deduct_materials_from_log (миграция
  // 092) по packaging_bag_material_id (шт = packs_packaged) и boxes_used.
  const isPackaging = stage === 'packaging'
  const { bags: packagingBags, boxes: packagingBoxes } = usePackagingMaterials()
  const [bagId, setBagId] = useState('')
  const [boxId, setBoxId] = useState('')
  const [boxesUsed, setBoxesUsed] = useState('')

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
    // Упаковка: домержим позиции склада (UUID-строки — вне числового цикла).
    if (isPackaging) {
      if (bagId) data.packaging_bag_material_id = bagId
      if (boxId) {
        data.box_material_id = boxId
        data.boxes_used = Number(boxesUsed) || 0
      }
    }
    if (notes) data.notes = notes

    setSaving(true)
    try {
      const res = await onSubmit(stage, data)
      setValues({})
      setNotes('')
      setBagId(''); setBoxId(''); setBoxesUsed('')
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

      {isPackaging && (
        <div className="rounded-xl border border-border bg-surface-2/40 p-3 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Расход упаковки
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="block text-xs text-text-muted mb-1">БОПП-пакет</span>
              <select
                value={bagId}
                onChange={(e) => setBagId(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/50"
              >
                <option value="">— без БОПП —</option>
                {packagingBags.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="block text-xs text-text-muted mb-1">Коробка</span>
              <select
                value={boxId}
                onChange={(e) => setBoxId(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/50"
              >
                <option value="">— без коробки —</option>
                {packagingBoxes.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
          </div>
          {boxId && (() => {
            const selectedBox = packagingBoxes.find((b) => b.id === boxId)
            const packs = Number(values.packs_packaged) || 0
            const capacity = Number(selectedBox?.capacity_per_box) || 0
            const suggested = capacity > 0 && packs > 0 ? Math.ceil(packs / capacity) : null
            const showSuggestion = suggested !== null && String(suggested) !== String(boxesUsed)
            return (
              <div>
                <Input
                  id="subtask-boxes-used"
                  label="Использовано коробок (шт)"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={boxesUsed}
                  onChange={(e) => setBoxesUsed(e.target.value)}
                  placeholder={suggested ? String(suggested) : '1'}
                />
                {showSuggestion && (
                  <button
                    type="button"
                    onClick={() => setBoxesUsed(String(suggested))}
                    className="mt-1 text-[11px] text-accent hover:underline"
                  >
                    Рекомендуется {suggested} шт ({packs} ÷ {capacity}) — применить
                  </button>
                )}
              </div>
            )
          })()}
          <p className="text-[11px] text-text-muted">
            БОПП-пакеты списываются по количеству упакованного. Коробки — по введённому числу.
          </p>
        </div>
      )}

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
