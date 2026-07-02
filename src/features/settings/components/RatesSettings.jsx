// R19 (бриф 30.06): вкладка «Ставки» в /settings — сдельная оплата.
// Заливка оплачивается по форме стикера (standard/complex/big/complex_big),
// плюс выборка / сборка / упаковка. Хранится в k24_settings key='bonus_rates'.
// Читают: calculateWorkerPayout (через settingsToRates) + инлайн-хуки отчётов.

import { useState, useEffect } from 'react'
import { useSettings } from '@/features/settings/hooks/useSettings'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import { toast } from '@/shared/stores/toast-store'
import { STICKER_SHAPES, WORKER_RATES } from '@/shared/constants'
import Button from '@/shared/components/Button'

const DEFAULT_RATES = {
  pouring: WORKER_RATES.pouring_per_sticker,
  selection: WORKER_RATES.selection_per_sticker,
  assembly_3d: WORKER_RATES.assembly_per_pack,
  packaging: WORKER_RATES.packaging_per_pack,
  pouring_shapes: { ...WORKER_RATES.pouring_by_shape },
}

const STAGE_FIELDS = [
  { key: 'selection', label: 'Выборка фонов (₽/стикер)', step: '0.1' },
  { key: 'assembly_3d', label: 'Сборка 3D (₽/стикер в паке)', step: '0.1' },
  { key: 'packaging', label: 'Упаковка (₽/пак)', step: '0.1' },
]

function NumberRow({ label, value, step, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-text">{label}</span>
      <input
        type="number"
        min="0"
        step={step || '0.1'}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="w-24 px-2 py-1 text-sm text-right tabular-nums rounded border border-border bg-surface"
      />
    </label>
  )
}

export function RatesSettings() {
  const canEdit = useCanDo('view:settings')
  const { value, save, loading } = useSettings('bonus_rates')
  const [rates, setRates] = useState(DEFAULT_RATES)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (value) {
      setRates({
        ...DEFAULT_RATES,
        ...value,
        pouring_shapes: { ...DEFAULT_RATES.pouring_shapes, ...(value.pouring_shapes || {}) },
      })
    }
  }, [value])

  if (loading) return <div className="text-sm text-text-muted">Загрузка ставок…</div>

  function updateShape(shape, v) {
    setRates((prev) => ({ ...prev, pouring_shapes: { ...prev.pouring_shapes, [shape]: v } }))
    setDirty(true)
  }
  function updateStage(key, v) {
    setRates((prev) => ({ ...prev, [key]: v }))
    setDirty(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      // pouring (скаляр) держим = ставке стандартной формы — legacy-fallback.
      const payload = { ...rates, pouring: Number(rates.pouring_shapes?.standard) || rates.pouring }
      await save(payload)
      setDirty(false)
    } catch (err) {
      toast.error(`Не удалось сохранить: ${err.message || err}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="bg-surface rounded-2xl border border-border shadow-card p-5 space-y-1">
        <h2 className="font-semibold mb-2">Заливка — по форме стикера (₽/шт)</h2>
        {Object.entries(STICKER_SHAPES).map(([key, s]) => (
          <NumberRow
            key={key}
            label={s.label}
            value={rates.pouring_shapes?.[key]}
            step="0.1"
            onChange={(v) => updateShape(key, v)}
          />
        ))}
      </div>

      <div className="bg-surface rounded-2xl border border-border shadow-card p-5 space-y-1">
        <h2 className="font-semibold mb-2">Прочие операции</h2>
        {STAGE_FIELDS.map((f) => (
          <NumberRow
            key={f.key}
            label={f.label}
            value={rates[f.key]}
            step={f.step}
            onChange={(v) => updateStage(f.key, v)}
          />
        ))}
      </div>

      {canEdit ? (
        <Button onClick={handleSave} disabled={!dirty || saving}>
          {saving ? 'Сохранение…' : 'Сохранить ставки'}
        </Button>
      ) : (
        <p className="text-sm text-text-muted">Только просмотр — редактирование доступно администратору.</p>
      )}
    </div>
  )
}
