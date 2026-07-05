import { memo, useState, useEffect, useRef } from 'react'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { FILM_TYPES } from '@/shared/constants'
import { generateUuid } from '@/shared/lib/uuid'
import { usePackagingMaterials } from '../hooks/usePackagingMaterials'
import { STAGE_FIELDS, computeStageProgressPerItem, computeIncomingPerItem } from '../lib/production-logs'

/**
 * R20.5 (бриф 3.07): поэвидовой учёт работы для multi-variant заказов
 * (несколько размерных видов из k24_order_items). Строка на вид: количество
 * этапа + брак (где есть) + расход материала (плёнка на печати, смола на
 * заливке). Каждая строка пишется отдельным production_log с item_idx.
 *
 * Шаблон — PackDesignsForm (виды стикеров 3D-пака): drafts в sessionStorage,
 * одна кнопка «Сохранить» с частичным фидбэком ошибок. Поля берутся напрямую
 * из STAGE_FIELDS[stage].fields — ключи драфтов совпадают с колонками лога.
 */

const SELECT_CLASS = 'w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm min-h-[40px]'

function draftsStorageKey(orderId, stage) {
  return `variant-drafts:${orderId || 'noid'}:${stage || 'nostage'}`
}
function readDrafts(orderId, stage) {
  try {
    const raw = sessionStorage.getItem(draftsStorageKey(orderId, stage))
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function VariantLogFormImpl({ items, logs = [], stage, route, order, onSubmitItem, readOnly = false }) {
  const fields = STAGE_FIELDS[stage]?.fields || []
  const [drafts, setDrafts] = useState(() => readDrafts(order?.id, stage))
  const [savingAll, setSavingAll] = useState(false)
  const isPackaging = stage === 'packaging'
  const { bags: packagingBags, boxes: packagingBoxes } = usePackagingMaterials()

  // Drafts переживают unmount/remount (паттерн PackDesignsForm, фидбэк 17.05).
  const storageKeyRef = useRef(draftsStorageKey(order?.id, stage))
  useEffect(() => { storageKeyRef.current = draftsStorageKey(order?.id, stage) }, [order?.id, stage])
  useEffect(() => {
    try { sessionStorage.setItem(storageKeyRef.current, JSON.stringify(drafts)) } catch { /* quota */ }
  }, [drafts])

  function setField(itemIdx, key, value) {
    setDrafts((p) => {
      const prev = p[itemIdx] || {}
      const next = { ...prev, [key]: value }
      // Правка значений = новый лог: сбрасываем клиентский PK, иначе повтор
      // после потерянного ответа упрётся в 23505 и молча выбросит новые цифры,
      // показав «Сохранено» со старыми данными в БД (ревью 05.07). Цена —
      // редкий дубль, если insert на самом деле прошёл: он виден в истории
      // и удаляется, тогда как тихая потеря правки невидима.
      delete next._logId
      const out = { ...p, [itemIdx]: next }
      // Если этот вид был носителем коробки — открепляем, чтобы коробка
      // не потерялась при пересборке pending с новым PK.
      if (prev._logId && p._materials?._boxLogId === prev._logId) {
        out._materials = { ...p._materials, _boxLogId: null }
      }
      return out
    })
  }
  function setMaterial(key, value) {
    setDrafts((p) => ({ ...p, _materials: { ...(p._materials || {}), [key]: value } }))
  }
  const materials = drafts._materials || {}

  function fieldLabel(field) {
    // На печати подписываем плёнку конкретной позицией заказа.
    if (field.key === 'film_meters') {
      const name = order?.film_material?.name || FILM_TYPES[order?.film_type]?.label
      return name ? `${field.label} · ${name}` : field.label
    }
    return field.label
  }

  async function handleSubmitAll() {
    // Идемпотентный авторетрай (паттерн PackDesignsForm, ревью 04.07):
    // каждому виду выдаётся клиентский logId (PK лога), который живёт в
    // драфте (sessionStorage) до подтверждённого успеха — переживает вторую
    // волну, ручной повтор по тосту и reload. Повтор с тем же PK упирается
    // в 23505 вместо создания дубля, который завысил бы прогресс, сдельную
    // оплату И задвоил списание коробок/БОПП (триггер 031). generateUuid
    // покрывает и старые WebView (getRandomValues-фолбэк); без crypto вовсе —
    // идём без id, как до фикса.
    const pending = []
    const draftsWithIds = { ...drafts }
    for (const it of items) {
      const d = draftsWithIds[it.idx] || {}
      const values = {}
      let hasValue = false
      for (const f of fields) {
        const raw = d[f.key]
        if (raw === '' || raw == null) continue
        const num = Number(raw)
        if (Number.isNaN(num) || num < 0) {
          toast.error(`Вид ${it.idx}: «${f.label}» — некорректное число`)
          return
        }
        values[f.key] = num
        if (num > 0) hasValue = true
      }
      if (!hasValue) continue
      const logId = d._logId || generateUuid()
      draftsWithIds[it.idx] = { ...d, _logId: logId }
      if (logId) values.id = logId
      pending.push({ idx: it.idx, values })
    }
    if (pending.length === 0) {
      toast.info('Введите данные хотя бы по одному виду')
      return
    }

    // Упаковочные материалы. Пакет — в каждую строку (списание БОПП по
    // packs_packaged той же строки, триггер 031; идемпотентно по logId
    // строки). Коробки — на ОДНУ строку-«носитель», закреплённую по её logId
    // в _materials._boxLogId: при ручном повторе коробка едет на том же logId
    // (23505 гасит дубль), а после успеха строки-носителя больше ни к кому не
    // прикрепляется. Раньше был позиционный i===0 — при пересборке pending
    // после частичного успеха коробка перескакивала на другой вид и списывалась
    // вторично (ревью 05.07).
    if (isPackaging) {
      pending.forEach((p) => {
        if (materials.packaging_bag_material_id) {
          p.values.packaging_bag_material_id = materials.packaging_bag_material_id
        }
      })
      if (materials.box_material_id) {
        let boxLogId = materials._boxLogId || null
        let carrier = boxLogId ? pending.find((p) => p.values.id === boxLogId) : null
        if (!carrier && !boxLogId) {
          carrier = pending[0]
          boxLogId = carrier?.values.id || null
        }
        // boxLogId задан, но носителя нет в pending → он уже сохранён, коробку
        // повторно не прикрепляем (иначе двойное списание).
        if (carrier) {
          carrier.values.box_material_id = materials.box_material_id
          carrier.values.boxes_used = Math.max(0, Number(materials.boxes_used) || 0)
          draftsWithIds._materials = { ...materials, _boxLogId: boxLogId }
        }
      }
    }
    setDrafts(draftsWithIds)

    setSavingAll(true)
    const succeeded = []
    let retriedOk = 0
    let failed = []
    for (const p of pending) {
      try {
        await onSubmitItem(p.idx, p.values)
        succeeded.push(p.idx)
      } catch (err) {
        failed.push({ ...p, message: translateError(err).message })
      }
    }
    // Вторая волна — по упавшим, с теми же id.
    if (failed.length > 0) {
      const stillFailed = []
      for (const p of failed) {
        try {
          await onSubmitItem(p.idx, p.values)
          succeeded.push(p.idx)
          retriedOk++
        } catch (err) {
          if (err?.code === '23505') {
            // Дубликат PK: первый insert прошёл, потерялся только ответ.
            succeeded.push(p.idx)
            retriedOk++
          } else {
            stillFailed.push({ ...p, message: translateError(err).message })
          }
        }
      }
      failed = stillFailed
    }
    setSavingAll(false)

    if (succeeded.length > 0) {
      setDrafts((prev) => {
        const next = { ...prev }
        for (const idx of succeeded) delete next[idx]
        if (failed.length === 0) delete next._materials
        return next
      })
    }
    if (failed.length === 0) {
      const base = `Сохранено: ${succeeded.length} вид(ов)`
      toast.success(retriedOk > 0 ? `${base} (часть — со 2-й попытки)` : base)
    } else {
      toast.error(`Не сохранились виды: ${failed.map((f) => `${f.idx} — ${f.message}`).join('; ')}. Данные не потеряны — проверьте связь и нажмите «Сохранить» ещё раз`)
    }
  }

  if (!items || items.length === 0 || fields.length === 0) return null

  return (
    <div className="space-y-3">
      {items.map((it) => {
        const progress = computeStageProgressPerItem(logs, stage, Number(it.qty) || 0, it.idx)
        const incoming = computeIncomingPerItem(logs, route, stage, it.idx)
        const d = drafts[it.idx] || {}
        return (
          <div key={it.idx} className="rounded-xl border border-border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-semibold whitespace-nowrap">Вид #{it.idx}</span>
                <span className="text-sm text-text-muted tabular-nums">
                  {Number(it.width_mm)}×{Number(it.height_mm)} мм
                </span>
              </div>
              <span className={`text-xs ${progress.isComplete ? 'text-success font-medium' : 'text-text-muted'}`}>
                {progress.total} / {progress.target} ({progress.percentage}%)
              </span>
            </div>

            <div className="h-1.5 bg-surface-dim rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${progress.isComplete ? 'bg-success' : 'bg-accent'}`}
                style={{ width: `${progress.percentage}%` }}
              />
            </div>

            {!incoming.isStart && incoming.total != null && (
              <p className="text-xs text-text-muted">
                Поступило на этап: {incoming.total} шт
                {progress.total >= incoming.total && (
                  <span className="text-warning"> — достигнут лимит поступившего</span>
                )}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              {fields.map((f) => {
                const isDecimal = !!f.step && /\./.test(f.step)
                const value = d[f.key] ?? ''
                return (
                  <Input
                    key={f.key}
                    id={`variant-${it.idx}-${f.key}`}
                    label={`${fieldLabel(f)}${f.unit ? ` (${f.unit})` : ''}`}
                    type={isDecimal ? 'text' : 'number'}
                    inputMode={isDecimal ? 'decimal' : 'numeric'}
                    value={value}
                    disabled={readOnly}
                    onChange={(e) => {
                      const raw = e.target.value
                      if (isDecimal) {
                        if (raw !== '' && !/^[\d.,]*$/.test(raw)) return
                        setField(it.idx, f.key, raw.replace(',', '.'))
                      } else {
                        setField(it.idx, f.key, raw)
                      }
                    }}
                    {...(isDecimal ? {} : { min: '0', step: f.step || '1' })}
                    placeholder="0"
                  />
                )
              })}
            </div>
          </div>
        )
      })}

      {isPackaging && (
        <div className="rounded-xl border border-border p-3 space-y-2">
          <p className="text-sm font-medium">Упаковочные материалы</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-text-muted mb-0.5" htmlFor="variant-bag">БОПП-пакет</label>
              <select
                id="variant-bag"
                value={materials.packaging_bag_material_id ?? ''}
                onChange={(e) => setMaterial('packaging_bag_material_id', e.target.value || null)}
                className={SELECT_CLASS}
                disabled={readOnly}
              >
                <option value="">— не списывать —</option>
                {packagingBags.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-0.5" htmlFor="variant-box">Коробка</label>
              <select
                id="variant-box"
                value={materials.box_material_id ?? ''}
                onChange={(e) => setMaterial('box_material_id', e.target.value || null)}
                className={SELECT_CLASS}
                disabled={readOnly}
              >
                <option value="">— не списывать —</option>
                {packagingBoxes.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>
          {materials.box_material_id && (
            <Input
              label="Коробок использовано (шт)"
              id="variant-boxes-used"
              type="number"
              min="0"
              value={materials.boxes_used ?? ''}
              onChange={(e) => setMaterial('boxes_used', e.target.value)}
            />
          )}
          <p className="text-xs text-text-muted">
            Пакеты списываются по упакованному в каждом виде; коробки — общим числом на заказ.
          </p>
        </div>
      )}

      {!readOnly && (
        <Button onClick={handleSubmitAll} loading={savingAll} className="w-full">
          Сохранить
        </Button>
      )}
    </div>
  )
}

export const VariantLogForm = memo(VariantLogFormImpl)
