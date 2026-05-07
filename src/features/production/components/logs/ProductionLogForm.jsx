import { useState } from 'react'
import { STAGE_FIELDS, validateLogEntry } from '../../lib/production-logs'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'
import { isDualTrack } from '@/shared/constants'

/**
 * Universal production log form.
 * Renders stage-specific fields based on order.status.
 * Shows progress bar (current / target).
 *
 * For stickerpack3D on dual-track stages, форма требует выбрать дорожку
 * (фоны/стикеры) перед сохранением.
 */
export function ProductionLogForm({ stage, order, progress, onSubmit }) {
  const config = STAGE_FIELDS[stage]
  const showTrackPicker = !!order && isDualTrack(stage, order)
  const [form, setForm] = useState({})
  const [track, setTrack] = useState('')
  const [saving, setSaving] = useState(false)

  if (!config) return null

  function update(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (showTrackPicker && !track) {
      toast.error('Выберите дорожку: фоны или стикеры')
      return
    }
    const error = validateLogEntry(stage, form, { progress })
    if (error) { toast.error(error); return }

    setSaving(true)
    try {
      const payload = showTrackPicker ? { ...form, track } : form
      await onSubmit(stage, payload)
      toast.success('Записано')
      setForm({})
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <h3 className="font-semibold mb-1">{config.label}</h3>

      {/* Progress bar */}
      {progress && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-text-muted mb-1">
            <span>{progress.total} / {progress.target} шт</span>
            <span className={progress.isComplete ? 'text-success font-medium' : ''}>{progress.percentage}%</span>
          </div>
          <div className="h-2 bg-surface-dim rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${progress.isComplete ? 'bg-success' : 'bg-accent'}`}
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        {showTrackPicker && (
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-text">Дорожка:</span>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                name="track"
                value="backgrounds"
                checked={track === 'backgrounds'}
                onChange={(e) => setTrack(e.target.value)}
                className="accent-dept-print"
              />
              Фоны
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                name="track"
                value="stickers"
                checked={track === 'stickers'}
                onChange={(e) => setTrack(e.target.value)}
                className="accent-dept-pouring"
              />
              Стикеры
            </label>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {config.fields.map((field) => {
            if (field.type === 'select') {
              return (
                <div key={field.key}>
                  <label htmlFor={`log-${field.key}`} className="block text-sm font-medium text-text mb-1">
                    {field.label}
                  </label>
                  <select
                    id={`log-${field.key}`}
                    value={form[field.key] || ''}
                    onChange={(e) => update(field.key, e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent/50"
                  >
                    <option value="">Выбрать</option>
                    {field.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )
            }
            return (
              <Input
                key={field.key}
                id={`log-${field.key}`}
                label={`${field.label}${field.unit ? ` (${field.unit})` : ''}`}
                type="number"
                value={form[field.key] ?? ''}
                onChange={(e) => update(field.key, e.target.value)}
                min="0"
                step={field.step || '1'}
                required={field.required}
                placeholder="0"
              />
            )
          })}
        </div>

        <Input
          id="log-notes"
          label="Комментарий"
          value={form.notes || ''}
          onChange={(e) => update('notes', e.target.value)}
          placeholder="Необязательно"
        />

        <Button type="submit" loading={saving} className="w-full sm:w-auto">
          Записать
        </Button>
      </form>
    </div>
  )
}
