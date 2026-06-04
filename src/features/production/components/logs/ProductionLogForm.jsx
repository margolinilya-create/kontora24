import { useState } from 'react'
import { STAGE_FIELDS, validateLogEntry } from '../../lib/production-logs'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'
import { isDualTrack, IS_3D_STICKERPACK, FILM_TYPES } from '@/shared/constants'
import { usePackagingMaterials } from '../../hooks/usePackagingMaterials'

function ProgressBar({ p }) {
  if (!p) return null
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between text-xs text-text-muted mb-1">
        <span>{p.total} / {p.target} шт</span>
        <span className={p.isComplete ? 'text-success font-medium' : ''}>{p.percentage}%</span>
      </div>
      <div className="h-2 bg-surface-dim rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${p.isComplete ? 'bg-success' : 'bg-accent'}`}
          style={{ width: `${p.percentage}%` }}
        />
      </div>
    </div>
  )
}

/**
 * Универсальная форма логирования производства.
 *
 * Архитектура:
 * — Single-track этапы (lamination, pouring, assembly_3d, packaging) — одна форма.
 * — Dual-track этапы (print/cutting/selection_pouring для stickerpack3D) —
 *   две группы полей бок-о-бок (без radio). Submit отправляет до 2 логов
 *   (один на трек, если в трек заполнили хоть одно поле).
 * — Этап selection_pouring имеет дополнительный «расход смолы» отдельным треком
 *   (без track-привязки) — submit отправит 3-й лог с resin_grams.
 * — Лейбл «Плёнка» автоматически берётся из заказа (film_type / film_type_stickers).
 * — omitFields — { [trackKey]: [fieldKey, ...] } — поля, которые форма НЕ рендерит.
 *   Используется для 3D-стикерпака: количество стикеров вводится поэвидово
 *   (PackDesignsForm), поэтому трек «Стикеры» теряет количественные поля
 *   (а если у трека не осталось полей — он скрывается целиком).
 */
export function ProductionLogForm({ stage, order, progress, incoming, onSubmit, omitFields }) {
  const config = STAGE_FIELDS[stage]
  const isPack3D = !!order && IS_3D_STICKERPACK(order.order_type)
  const useTracks = !!config?.tracks && isPack3D && isDualTrack(stage, order)
  const isPackaging = stage === 'packaging'
  const { bags: packagingBags, boxes: packagingBoxes } = usePackagingMaterials()
  const activeTracks = useTracks
    ? config.tracks
        .map((t) => {
          const omit = omitFields?.[t.key]
          return omit ? { ...t, fields: t.fields.filter((f) => !omit.includes(f.key)) } : t
        })
        .filter((t) => t.fields.length > 0)
    : []
  // Single-track форма поддерживает omitFields.single — например, sticker3D
  // multi-variant pouring: основные поля вводятся поэвидово, остаётся только смола.
  const singleFields = (!useTracks && Array.isArray(omitFields?.single) && omitFields.single.length)
    ? config.fields.filter((f) => !omitFields.single.includes(f.key))
    : (config.fields || [])

  const [saving, setSaving] = useState(false)
  // Состояние формы — { [trackKey || 'single']: { fieldKey: value }, notes, resin }
  const [forms, setForms] = useState({})

  if (!config) return null

  function getForm(key) {
    return forms[key] || {}
  }
  function updateField(key, fieldKey, value) {
    setForms((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), [fieldKey]: value } }))
  }
  function updateRoot(fieldKey, value) {
    setForms((prev) => ({ ...prev, _root: { ...(prev._root || {}), [fieldKey]: value } }))
  }
  function clearAll() { setForms({}) }

  function fieldLabel(field, _trackKey) {
    function resolveFilmLabel(source) {
      const filmType = source === 'stickers'
        ? (order?.film_type_stickers || order?.film_type)
        : order?.film_type
      return FILM_TYPES[filmType]?.label || filmType || ''
    }
    if (field.filmFrom && order) {
      const filmLabel = resolveFilmLabel(field.filmFrom)
      return filmLabel ? `Плёнка ${filmLabel}` : field.label
    }
    if (field.appendFilm && order) {
      const filmLabel = resolveFilmLabel(field.appendFilm)
      return filmLabel ? `${field.label} · ${filmLabel}` : field.label
    }
    return field.label
  }

  function isFormEmpty(data) {
    return !data || Object.entries(data).every(([k, v]) => k === 'notes' || v === '' || v == null || Number(v) === 0)
  }

  // «Хорошо залитых» (stickers_good) автоматически = stickers_poured − defects.
  // Поле убрано из формы (фидбэк 28.05), но в БД сохраняем для совместимости
  // с агрегациями (payout, reports, OrderProgressTab).
  function attachComputedGood(stage, data, track) {
    const isPour = stage === 'pouring' || (stage === 'selection_pouring' && track === 'stickers')
    if (!isPour) return data
    const poured = Number(data.stickers_poured ?? 0)
    if (!Number.isFinite(poured) || poured <= 0) return data
    const defects = Number(data.defects ?? 0) || 0
    return { ...data, stickers_good: Math.max(0, poured - defects) }
  }

  // R15.1 (бриф 04.06 #3/#7): validateLogEntry теперь возвращает
  // { severity, message } | null. error блокирует submit, warning — напоминание,
  // submit идёт дальше. Возвращает true если можно продолжать.
  function applyValidation(res, labelPrefix) {
    if (!res) return true
    const msg = labelPrefix ? `${labelPrefix}: ${res.message}` : res.message
    if (res.severity === 'error') {
      toast.error(msg)
      return false
    }
    // warning — submit разрешён, показываем напоминание (toast.info без Sentry)
    toast.info(msg)
    return true
  }

  async function handleSubmit(e) {
    e.preventDefault()

    const root = getForm('_root')
    const allowOvershoot = stage === 'packaging' // ТЗ: упаковка может превышать тираж

    if (useTracks) {
      // Собираем логи по трекам
      const trackEntries = []
      for (const t of activeTracks) {
        const data = getForm(t.key)
        if (isFormEmpty(data)) continue
        const validationRes = validateLogEntry(stage, data, {
          progress: progress?.[t.key],
          incoming: incoming?.[t.key],
          allowOvershoot,
        })
        if (!applyValidation(validationRes, t.label)) return
        trackEntries.push({ track: t.key, data: { ...data, notes: root.notes || null } })
      }
      // Доп. resin-лог для selection_pouring
      const resinValue = Number(root.resin_grams || 0)
      if (resinValue > 0) {
        trackEntries.push({ track: null, data: { resin_grams: resinValue, notes: root.notes || null } })
      }
      if (trackEntries.length === 0) {
        toast.error('Заполните хотя бы одно поле')
        return
      }
      setSaving(true)
      try {
        for (const entry of trackEntries) {
          const payload = attachComputedGood(stage, entry.data, entry.track)
          await onSubmit(stage, { ...payload, track: entry.track })
        }
        toast.success(`Записано (${trackEntries.length})`)
        clearAll()
      } catch (err) {
        toast.error(translateError(err).message)
      } finally {
        setSaving(false)
      }
      return
    }

    // Single-track
    const data = { ...getForm('single'), notes: root.notes || null }
    if (isFormEmpty(data)) { toast.error('Заполните хотя бы одно поле'); return }
    const validationRes = validateLogEntry(stage, data, { progress, incoming, allowOvershoot })
    if (!applyValidation(validationRes, null)) return

    setSaving(true)
    try {
      await onSubmit(stage, attachComputedGood(stage, data, null))
      // Доп. resin-лог если есть
      const resinValue = Number(root.resin_grams || 0)
      if (resinValue > 0 && config.resinExtra) {
        await onSubmit(stage, { resin_grams: resinValue, notes: null })
      }
      toast.success('Записано')
      clearAll()
    } catch (err2) {
      toast.error(translateError(err2).message)
    } finally {
      setSaving(false)
    }
  }

  function renderField(field, trackKey) {
    const formKey = trackKey || 'single'
    const value = getForm(formKey)[field.key] ?? ''
    // Десятичные поля (с step содержащим точку) — текстовый input с поддержкой запятой
    // и numeric-клавиатурой на мобильнике (фидбэк менеджера 17.05).
    const isDecimal = !!field.step && /\./.test(field.step)
    return (
      <Input
        key={`${formKey}-${field.key}`}
        id={`log-${formKey}-${field.key}`}
        label={`${fieldLabel(field, trackKey)}${field.unit ? ` (${field.unit})` : ''}`}
        type={isDecimal ? 'text' : 'number'}
        inputMode={isDecimal ? 'decimal' : 'numeric'}
        value={value}
        onChange={(e) => {
          const raw = e.target.value
          if (isDecimal) {
            if (raw !== '' && !/^[\d.,]*$/.test(raw)) return
            updateField(formKey, field.key, raw.replace(',', '.'))
          } else {
            updateField(formKey, field.key, raw)
          }
        }}
        {...(isDecimal ? {} : { min: '0', step: field.step || '1' })}
        placeholder="0"
      />
    )
  }

  // «Поступило на этап» показываем только если это не стартовый этап (isStart) и есть число.
  const singleIncoming = !useTracks && incoming && !incoming.isStart && incoming.total != null
    ? incoming : null

  // R13.2 (бриф 02.06): drying — показываем running «Пригодных» = incoming − Σdefects.
  // На этой стадии единственное поле — брак, который вычитается из суммы залитых.
  const dryingNetGood = (() => {
    if (stage !== 'drying' || !singleIncoming) return null
    const draftDefects = Number(getForm('_root').defects || 0) || 0
    return Math.max(0, singleIncoming.total - draftDefects)
  })()

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <h3 className="font-semibold mb-2">{config.label}</h3>

      {!useTracks && <ProgressBar p={progress} />}
      {singleIncoming && (
        <p className="text-xs text-text-muted mb-3">
          Поступило на этап: {singleIncoming.total} шт
          {dryingNetGood != null && (
            <span className="ml-2 text-success">
              · Пригодных после сушки: {dryingNetGood} шт
            </span>
          )}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        {useTracks ? (
          <div className={`grid grid-cols-1 gap-3 ${activeTracks.length > 1 ? 'lg:grid-cols-2' : ''}`}>
            {activeTracks.map((t) => {
              const trackIncoming = incoming?.[t.key] && !incoming[t.key].isStart && incoming[t.key].total != null
                ? incoming[t.key] : null
              return (
                <div key={t.key} className={`rounded-xl border p-3 ${t.accent || 'border-border'}`}>
                  <div className="text-xs font-semibold uppercase tracking-wide mb-2">{t.label}</div>
                  {trackIncoming && (
                    <p className="text-xs text-text-muted mb-2">
                      Поступило на этап: {trackIncoming.total} шт
                    </p>
                  )}
                  {progress?.[t.key] && t.fields.some((f) => f.unit === 'шт') && (
                    <ProgressBar p={progress[t.key]} />
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {t.fields.map((f) => renderField(f, t.key))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          singleFields.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {singleFields.map((f) => renderField(f, null))}
            </div>
          )
        )}

        {isPackaging && (
          <div className="rounded-xl border border-border bg-surface-2/40 p-3 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Расход упаковки
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="block text-xs text-text-muted mb-1">БОПП-пакет</span>
                <select
                  value={getForm('single').packaging_bag_material_id ?? ''}
                  onChange={(e) => updateField('single', 'packaging_bag_material_id', e.target.value || null)}
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
                  value={getForm('single').box_material_id ?? ''}
                  onChange={(e) => updateField('single', 'box_material_id', e.target.value || null)}
                  className="w-full rounded-lg border border-border px-3 py-2.5 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/50"
                >
                  <option value="">— без коробки —</option>
                  {packagingBoxes.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </label>
            </div>
            {getForm('single').box_material_id && (() => {
              const selectedBox = packagingBoxes.find((b) => b.id === getForm('single').box_material_id)
              const packs = Number(getForm('single').packs_packaged) || 0
              const capacity = Number(selectedBox?.capacity_per_box) || 0
              const suggested = capacity > 0 && packs > 0 ? Math.ceil(packs / capacity) : null
              const currentValue = getForm('single').boxes_used ?? ''
              const showSuggestion = suggested !== null && String(suggested) !== String(currentValue)
              return (
                <div>
                  <Input
                    id="log-boxes-used"
                    label="Использовано коробок (шт)"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    value={currentValue}
                    onChange={(e) => updateField('single', 'boxes_used', e.target.value)}
                    placeholder={suggested ? String(suggested) : '1'}
                  />
                  {showSuggestion && (
                    <button
                      type="button"
                      onClick={() => updateField('single', 'boxes_used', String(suggested))}
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

        {/* Отдельный лог расхода смолы (для selection_pouring) */}
        {config.resinExtra && (
          <div className="rounded-xl border border-warning/40 bg-warning/5 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide mb-2 text-warning">
              Расход смолы (общий)
            </div>
            <Input
              id="log-resin"
              label={`${config.resinExtra.label} (${config.resinExtra.unit})`}
              type="text"
              inputMode="decimal"
              value={getForm('_root').resin_grams ?? ''}
              onChange={(e) => {
                const raw = e.target.value
                if (raw !== '' && !/^[\d.,]*$/.test(raw)) return
                updateRoot('resin_grams', raw.replace(',', '.'))
              }}
              placeholder="0"
            />
          </div>
        )}

        <Input
          id="log-notes"
          label="Комментарий"
          value={getForm('_root').notes ?? ''}
          onChange={(e) => updateRoot('notes', e.target.value)}
          placeholder="Необязательно"
        />

        <Button type="submit" loading={saving} className="w-full sm:w-auto">
          Записать
        </Button>
      </form>
    </div>
  )
}
