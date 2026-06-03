// R12.7 — вкладка «Производство» в /settings: нормативы / штат /
// госпраздники. Все три ключа хранятся в k24_settings (jsonb).
// Realtime подписка планировщика (R12.2) подтянет изменения сразу
// без перезагрузки.

import { useState, useEffect } from 'react'
import { useSettings } from '@/features/settings/hooks/useSettings'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import { toast } from '@/shared/stores/toast-store'
import { DEFAULT_NORMS, DEFAULT_CAPACITY } from '../lib/norms'

const NORM_FIELDS = [
  { key: 'design_days', label: 'Дизайн (рабочих дней)', step: '0.5' },
  { key: 'design_multiply_kinds', label: 'Дизайн × кол-во видов', type: 'checkbox' },
  { key: 'verstka_minutes', label: 'Вёрстка образца (мин)', step: '1' },
  { key: 'sample_print_minutes', label: 'Печать образца (мин)', step: '1' },
  { key: 'batch_layout_minutes_per_kind', label: 'Вёрстка тиража (мин на вид)', step: '1' },
  { key: 'prepress_minutes_per_kind', label: 'Препресс (мин на вид)', step: '1' },
  { key: 'print_meters_per_30min', label: 'Печать (пог.м за 30 мин)', step: '0.1' },
  { key: 'lamination_meters_per_20min', label: 'Ламинация (пог.м за 20 мин)', step: '0.1' },
  { key: 'cutting_meters_per_15min', label: 'Резка (пог.м за 15 мин)', step: '0.1' },
  { key: 'weeding_backgrounds_per_8h', label: 'Выборка фонов (шт / 8 ч)', step: '10' },
  { key: 'resin_stickers_per_8h', label: 'Заливка стикеров (шт / 8 ч)', step: '50' },
  { key: 'selection_stickers_per_8h', label: 'Выборка штучных стикеров (шт / 8 ч)', step: '50' },
  { key: 'assembly_packs_per_8h', label: 'Сборка 3D (паков / 8 ч)', step: '10' },
  { key: 'packaging_packs_per_8h', label: 'Упаковка (паков / 8 ч)', step: '10' },
  { key: 'otk_minutes', label: 'ОТК (мин на заказ)', step: '1' },
  { key: 'drying_hours', label: 'Сушка (часов, пассив)', step: '1' },
]

const CAPACITY_FIELDS = [
  { key: 'designers', label: 'Дизайнеры', tip: 'Бакет design' },
  { key: 'prepress', label: 'Препресс', tip: 'Бакет prepress (sample_layout + batch_layout + prepress)' },
  { key: 'printers', label: 'Печатники / печатные машины', tip: 'Бакет oprl_print (печать + ламинация + sample_print)' },
  { key: 'cutters', label: 'Режущие плоттеры', tip: 'Бакет oprl_cut' },
  { key: 'post_print', label: 'Постпечать (бригада)', tip: 'Бакет post_print (заливка + выборка + сборка + упаковка + ОТК)' },
  { key: 'hours_per_day', label: 'Часов в рабочем дне', tip: 'Длина рабочей смены' },
]

function FieldRow({ field, value, onChange }) {
  if (field.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 py-1.5">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4"
        />
        <span className="text-sm">{field.label}</span>
      </label>
    )
  }
  return (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-zinc-700 dark:text-zinc-300">{field.label}</span>
      <input
        type="number"
        value={value ?? ''}
        step={field.step || '1'}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="w-24 px-2 py-1 text-sm text-right tabular-nums rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
      />
    </label>
  )
}

export function PlanningSettings() {
  const canEdit = useCanDo('view:settings') // admin-only по фактическому маппингу
  const { value: normsValue, save: saveNorms, loading: nLoading } = useSettings('planning:norms')
  const { value: capacityValue, save: saveCapacity, loading: cLoading } = useSettings('planning:capacity')
  const { value: holidaysValue, save: saveHolidays, loading: hLoading } = useSettings('planning:holidays_2026')

  const [norms, setNorms] = useState(DEFAULT_NORMS)
  const [capacity, setCapacity] = useState(DEFAULT_CAPACITY)
  const [holidaysText, setHolidaysText] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (normsValue) setNorms({ ...DEFAULT_NORMS, ...normsValue })
  }, [normsValue])
  useEffect(() => {
    if (capacityValue) setCapacity({ ...DEFAULT_CAPACITY, ...capacityValue })
  }, [capacityValue])
  useEffect(() => {
    if (Array.isArray(holidaysValue)) setHolidaysText(holidaysValue.join('\n'))
  }, [holidaysValue])

  if (nLoading || cLoading || hLoading) {
    return <div className="text-sm text-zinc-500">Загрузка настроек…</div>
  }

  async function handleSave() {
    try {
      const list = holidaysText.split('\n').map((s) => s.trim()).filter(Boolean)
      // Простая валидация YYYY-MM-DD
      const bad = list.filter((s) => !/^\d{4}-\d{2}-\d{2}$/.test(s))
      if (bad.length > 0) {
        toast.error(`Неверный формат даты: ${bad.slice(0, 3).join(', ')}. Используйте YYYY-MM-DD.`)
        return
      }
      await Promise.all([
        saveNorms(norms),
        saveCapacity(capacity),
        saveHolidays(list),
      ])
      setDirty(false)
    } catch (err) {
      toast.error(`Не удалось сохранить: ${err.message || err}`)
    }
  }

  function updateNorm(key, value) {
    setNorms((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  function updateCapacity(key, value) {
    setCapacity((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
        Раздел в бете. Изменения сразу применяются у всех открывших страницу «Планирование» — пересчёт через realtime.
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="space-y-1">
          <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300 mb-2">
            Штат и оборудование
          </h3>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 divide-y divide-zinc-100 dark:divide-zinc-800">
            {CAPACITY_FIELDS.map((f) => (
              <div key={f.key} title={f.tip}>
                <FieldRow
                  field={{ label: f.label, step: '1' }}
                  value={capacity[f.key]}
                  onChange={(v) => updateCapacity(f.key, v)}
                />
              </div>
            ))}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">
            Ёмкость бакета = ресурсы × часов в дне. Например, 2 плоттера × 8 ч = 16 ч/день в бакете «Резка».
          </p>
        </section>

        <section className="space-y-1">
          <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300 mb-2">
            Нормативы скорости
          </h3>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 divide-y divide-zinc-100 dark:divide-zinc-800">
            {NORM_FIELDS.map((f) => (
              <FieldRow
                key={f.key}
                field={f}
                value={norms[f.key]}
                onChange={(v) => updateNorm(f.key, v)}
              />
            ))}
          </div>
        </section>
      </div>

      <section className="space-y-1">
        <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300 mb-2">
          Госпраздники РФ (исключаются из рабочих дней)
        </h3>
        <textarea
          value={holidaysText}
          onChange={(e) => { setHolidaysText(e.target.value); setDirty(true) }}
          placeholder="2026-01-01&#10;2026-01-02&#10;..."
          rows={8}
          className="w-full px-3 py-2 text-sm font-mono rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
        />
        <p className="text-[11px] text-zinc-500">
          По одной дате на строку, формат YYYY-MM-DD. Эти дни не появятся в горизонте планирования.
        </p>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || !canEdit}
          className="px-4 py-2 text-sm font-semibold rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Сохранить
        </button>
        {dirty && (
          <span className="text-[12px] text-amber-700">Есть несохранённые изменения</span>
        )}
      </div>
    </div>
  )
}
