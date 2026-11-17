// R25.5 (ТЗ 5.5): вкладка «Калькулятор» в настройках (право calc:settings).
// Ставки — k24_settings['calculator'], привязка плёнок — k24_materials.calc_*.
// Сохранение атомарно через RPC calc_save_settings; каждое сохранение
// пишет полную копию в k24_calc_settings_history (триггер). Открытые
// калькуляторы получают новые ставки по realtime.

import { useEffect, useMemo, useState } from 'react'
import Button from '@/shared/components/Button'
import ErrorState from '@/shared/components/ErrorState'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'
import { formatDateTime } from '@/shared/lib/utils'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import { useCalculatorSettings } from '../hooks/useCalculatorSettings'
import {
  calculate, costPerCm2, validateCalcSettings, getPath, setPath, normalizeSettings,
  FILM_GROUPS, TIERS_STICKER,
} from '../lib/calc'
import { countUnmappedFilms } from '../lib/films'
import { formatPrice } from '../lib/copy-text'

const SECTIONS = [
  {
    title: 'Общие ставки, ₽/см²',
    fields: [
      ['ink', 'Краска'], ['labor_print', 'Труд — печать'], ['labor_pour', 'Труд — заливка'],
      ['lamination', 'Ламинация'], ['montage', 'Монтажная плёнка'],
    ],
  },
  {
    title: 'Цены групп плёнок, ₽/см²',
    fields: [
      ['film_prices.white', FILM_GROUPS.white.label],
      ['film_prices.holo', FILM_GROUPS.holo.label],
      ['film_prices.metal', FILM_GROUPS.metal.label],
    ],
  },
  {
    title: 'Винил',
    fields: [
      ['vinyl.rent', 'Аренда + электричество, ₽/см²'], ['vinyl.tax', 'Налог, ₽/см²'],
      ['vinyl.markup_sticker_max', 'Наценка стикера, макс ×'], ['vinyl.markup_sticker_min', 'Наценка стикера, мин ×'],
      ['vinyl.markup_pack_max', 'Наценка стикерпака, макс ×'], ['vinyl.markup_pack_min', 'Наценка стикерпака, мин ×'],
    ],
  },
  {
    title: '3D',
    fields: [
      ['resin3d.resin', 'Смола, ₽/см²'], ['resin3d.rent', 'Аренда + электричество, ₽/см²'], ['resin3d.tax', 'Налог, ₽/см²'],
      ['resin3d.markup_sticker_max', 'Наценка стикера, макс ×'], ['resin3d.markup_sticker_min', 'Наценка стикера, мин ×'],
      ['resin3d.markup_pack_max', 'Наценка стикерпака, макс ×'], ['resin3d.markup_pack_min', 'Наценка стикерпака, мин ×'],
    ],
  },
  {
    title: 'Опции',
    fields: [
      ['options.urgent_pct', 'Срочность, %'], ['options.cut_pct', 'Поштучная резка, %'],
      ['options.partner_pct', 'Партнёрская скидка, %'], ['options.bag_rub', 'Упаковка, ₽/шт'],
      ['options.extra_view_rub', 'Доп. вид, ₽'], ['options.design_rub', 'Разработка макета, ₽'],
      ['options.design_edit_rub', 'Правка макета, ₽'],
    ],
  },
]

const PREVIEW_PRODUCTS = [
  { key: 'sticker', label: 'Стикер', input: { product: 'sticker', options: {} } },
  { key: 'pack', label: 'Стикерпак', input: { product: 'pack', options: {} } },
  { key: 'sticker3d', label: '3D стикер', input: { product: 'sticker', options: { resin3d: true } } },
  { key: 'pack3d', label: '3D стикерпак', input: { product: 'pack', options: { resin3d: true } } },
]

const INPUT_CLASS = 'w-full rounded-xl border px-3 py-2 text-sm bg-surface text-text min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent/60'
const fmt4 = (v) => (Math.round(v * 10000) / 10000).toString().replace('.', ',')

function toForm(settings) {
  // Числа → строки для полей ввода (валидация по сырому вводу).
  const n = normalizeSettings(settings)
  let out = n
  for (const s of SECTIONS) for (const [path] of s.fields) out = setPath(out, path, String(getPath(n, path)))
  return out
}

function toValue(form) {
  let out = form
  for (const s of SECTIONS) for (const [path] of s.fields) out = setPath(out, path, Number(String(getPath(form, path)).replace(',', '.')))
  return out
}

export function CalculatorSettings() {
  const canEdit = useCanDo('calc:settings')
  const { raw, films, loading, error, refetch, save } = useCalculatorSettings()
  const [form, setForm] = useState(null)
  const [filmRows, setFilmRows] = useState([])
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [historyKey, setHistoryKey] = useState(0)

  // Синхронизация с БД (в т.ч. по realtime), пока нет несохранённых правок.
  useEffect(() => {
    if (loading || dirty) return
    setForm(toForm(raw))
    setFilmRows(films.map((f) => ({ ...f })))
  }, [raw, films, loading, dirty])

  const parsed = useMemo(() => (form ? toValue(form) : null), [form])
  const errors = useMemo(() => {
    if (!form) return {}
    // Валидация по сырому вводу (запятая допустима как разделитель).
    let numeric = form
    for (const s of SECTIONS) for (const [path] of s.fields) {
      const v = String(getPath(form, path)).trim().replace(',', '.')
      numeric = setPath(numeric, path, v === '' ? '' : Number(v))
    }
    return validateCalcSettings(numeric)
  }, [form])
  const hasErrors = Object.keys(errors).length > 0

  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (loading || !form) return <Skeleton className="h-96" />

  const unmapped = countUnmappedFilms(filmRows)

  function setField(path, value) {
    setForm((prev) => setPath(prev, path, value))
    setDirty(true)
  }

  function setFilm(id, patch) {
    setFilmRows((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))
    setDirty(true)
  }

  async function handleSave() {
    if (hasErrors) {
      toast.error('Исправьте ошибки в полях')
      return
    }
    setSaving(true)
    try {
      const value = { ...toValue(form) }
      // Плёнку по умолчанию без группы не оставляем — она не видна в калькуляторе.
      const def = filmRows.find((f) => f.id === value.default_film_id)
      if (!def || !def.calc_price_group) value.default_film_id = null
      await save(value, filmRows)
      setDirty(false)
      setHistoryKey((k) => k + 1)
      toast.success('Настройки калькулятора сохранены')
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    setDirty(false)
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-text-muted">
        Ставки общие для всех менеджеров. Каждое сохранение попадает в историю — по ней видно, по каким ставкам посчитан заказ.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {SECTIONS.map((section) => (
          <fieldset key={section.title} className="bg-surface rounded-2xl border border-border p-4" disabled={!canEdit}>
            <legend className="text-sm font-semibold px-1">{section.title}</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              {section.fields.map(([path, label]) => (
                <div key={path}>
                  <label htmlFor={`calc-set-${path}`} className="block text-xs font-medium text-text-muted mb-1">{label}</label>
                  <input
                    id={`calc-set-${path}`}
                    inputMode="decimal"
                    value={getPath(form, path)}
                    onChange={(e) => setField(path, e.target.value)}
                    aria-invalid={!!errors[path]}
                    className={`${INPUT_CLASS} ${errors[path] ? 'border-danger' : 'border-border'}`}
                  />
                  {errors[path] && <p className="mt-1 text-xs text-danger" role="alert">{errors[path]}</p>}
                </div>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <section className="bg-surface rounded-2xl border border-border p-4 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">Плёнки склада</h3>
          {unmapped > 0 && (
            <p className="text-xs text-text bg-warning/25 rounded-lg px-2 py-1">
              Не настроены для калькулятора: {unmapped} {plural(unmapped, 'позиция', 'позиции', 'позиций')}
            </p>
          )}
        </div>
        {filmRows.length === 0 ? (
          <p className="text-sm text-text-muted">На складе нет активных плёнок</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs text-text-muted">
                <tr>
                  <th scope="col" className="text-left font-medium px-3 py-2">Позиция</th>
                  <th scope="col" className="text-left font-medium px-3 py-2">Ценовая группа</th>
                  <th scope="col" className="text-left font-medium px-3 py-2">Название в расчёте</th>
                  <th scope="col" className="text-center font-medium px-3 py-2">По умолчанию</th>
                </tr>
              </thead>
              <tbody>
                {filmRows.map((f) => (
                  <tr key={f.id} className="border-t border-border">
                    <td className="px-3 py-2 min-w-[180px]">{f.name}</td>
                    <td className="px-3 py-2 min-w-[150px]">
                      <select
                        aria-label={`Ценовая группа: ${f.name}`}
                        value={f.calc_price_group || ''}
                        disabled={!canEdit}
                        onChange={(e) => setFilm(f.id, { calc_price_group: e.target.value || null })}
                        className={`${INPUT_CLASS} border-border`}
                      >
                        <option value="">—</option>
                        <option value="white">Белая / прозрачная</option>
                        <option value="holo">Голографическая</option>
                        <option value="metal">Металлизированная</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 min-w-[180px]">
                      <input
                        aria-label={`Название в расчёте: ${f.name}`}
                        value={f.calc_display_name || ''}
                        placeholder={f.calc_price_group ? FILM_GROUPS[f.calc_price_group].defaultName : ''}
                        disabled={!canEdit}
                        maxLength={80}
                        onChange={(e) => setFilm(f.id, { calc_display_name: e.target.value })}
                        className={`${INPUT_CLASS} border-border`}
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="radio"
                        name="calc-default-film"
                        aria-label={`По умолчанию: ${f.name}`}
                        checked={form.default_film_id === f.id}
                        disabled={!canEdit || !f.calc_price_group}
                        onChange={() => setField('default_film_id', f.id)}
                        className="w-5 h-5 accent-[var(--color-accent)]"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {parsed && <SettingsPreview settings={parsed} />}

      <CalcSettingsHistory key={historyKey} />

      {canEdit && (
        <div className="sticky bottom-2 z-10 bg-surface/95 backdrop-blur-md rounded-2xl border border-border shadow-card p-3 flex flex-wrap items-center justify-end gap-2">
          {dirty && <span className="text-xs text-text-muted mr-auto">Есть несохранённые изменения</span>}
          <Button type="button" variant="secondary" onClick={handleReset} disabled={!dirty || saving}>Отменить</Button>
          <Button type="button" onClick={handleSave} loading={saving} disabled={!dirty || hasErrors}>Сохранить</Button>
        </div>
      )}
    </div>
  )
}

/** Предпросмотр: себестоимость 1 см² по статьям для 4 продуктов + цены 105×148 по ступеням. */
function SettingsPreview({ settings }) {
  const breakdowns = PREVIEW_PRODUCTS.map((p) => ({
    ...p,
    cost: costPerCm2({ product: p.input.product, filmGroup: 'white', resin3d: !!p.input.options.resin3d, lamination: false }, settings),
  }))
  const rowKeys = []
  for (const b of breakdowns) for (const i of b.cost.items) if (!rowKeys.find((r) => r.key === i.key)) rowKeys.push(i)

  return (
    <section className="bg-surface rounded-2xl border border-border p-4 space-y-4">
      <h3 className="text-sm font-semibold">Предпросмотр (белая плёнка, без опций)</h3>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">Себестоимость 1 см² по статьям</caption>
          <thead className="bg-surface-2 text-xs text-text-muted">
            <tr>
              <th scope="col" className="text-left font-medium px-3 py-2">Себестоимость 1 см², ₽</th>
              {breakdowns.map((b) => <th key={b.key} scope="col" className="text-right font-medium px-3 py-2 whitespace-nowrap">{b.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rowKeys.map((r) => (
              <tr key={r.key} className="border-t border-border">
                <td className="px-3 py-1.5 text-text-muted whitespace-nowrap">{r.label}</td>
                {breakdowns.map((b) => {
                  const item = b.cost.items.find((i) => i.key === r.key)
                  return <td key={b.key} className="px-3 py-1.5 text-right">{item ? fmt4(item.value) : '—'}</td>
                })}
              </tr>
            ))}
            <tr className="border-t border-border font-semibold">
              <td className="px-3 py-1.5">Итого</td>
              {breakdowns.map((b) => <td key={b.key} className="px-3 py-1.5 text-right">{fmt4(b.cost.total)}</td>)}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">Цена за 1 шт для 105×148 мм по ступеням тиража</caption>
          <thead className="bg-surface-2 text-xs text-text-muted">
            <tr>
              <th scope="col" className="text-left font-medium px-3 py-2">105×148 мм, тираж</th>
              {PREVIEW_PRODUCTS.map((p) => <th key={p.key} scope="col" className="text-right font-medium px-3 py-2 whitespace-nowrap">{p.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {TIERS_STICKER.map(([from]) => (
              <tr key={from} className="border-t border-border">
                <td className="px-3 py-1.5 whitespace-nowrap">{from.toLocaleString('ru-RU')} шт</td>
                {PREVIEW_PRODUCTS.map((p) => {
                  const r = calculate({ ...p.input, filmGroup: 'white', widthMm: 105, heightMm: 148, views: [from] }, settings)
                  return <td key={p.key} className="px-3 py-1.5 text-right whitespace-nowrap">{formatPrice(r.pricePerUnit)}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** Последние сохранения настроек (RLS: calc:settings или view:finance). */
function CalcSettingsHistory() {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let alive = true
    supabase
      .from('k24_calc_settings_history')
      .select('id, changed_at, changed_by_profile:k24_profiles!changed_by(display_name)')
      .order('changed_at', { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (!alive) return
        if (error) {
          captureError(error, { tags: { source: 'CalculatorSettings.history' } })
          setRows([])
          return
        }
        setRows(data || [])
      })
    return () => { alive = false }
  }, [])

  if (!rows || rows.length === 0) return null
  return (
    <section className="bg-surface rounded-2xl border border-border p-4">
      <h3 className="text-sm font-semibold mb-2">История изменений</h3>
      <ul className="text-sm space-y-1">
        {rows.map((r) => (
          <li key={r.id} className="flex justify-between gap-3">
            <span className="text-text-muted">{formatDateTime(r.changed_at)}</span>
            <span className="truncate">{r.changed_by_profile?.display_name || 'Начальные значения'}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function plural(n, one, few, many) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}
