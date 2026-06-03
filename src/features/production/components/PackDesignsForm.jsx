import { memo, useState, useEffect, useRef } from 'react'
import Button from '@/shared/components/Button'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { computeIncomingPerDesign } from '../lib/production-logs'

/**
 * Виджет ввода по видам стикеров для 3D-стикерпака.
 * Используется на печать / резка / заливка — лейблы и поле зависят от mode.
 *
 *  mode='pouring' (default): «Залить» + «Брак»  → stickers_good
 *  mode='print':   «Напечатано» (без брака)     → stickers_printed
 *  mode='cutting': «Нарезано» + «Брак»          → qty_cut
 *
 * Прогресс по виду считается из production_logs (props.logs), отфильтрованных по
 * (stage, track='stickers', design_index) — единый источник правды с worker_id.
 * Каждый «+» вызывает onSubmitDesign(designIndex, { value, defects }), который
 * создаёт production_log. Поля ввода НЕ закрываются по достижении тиража —
 * сотрудник может довносить количество (фидбэк менеджера 14.05).
 */
const MODE_LABELS = {
  // pouring: поле «Залито» пишется в stickers_poured. Поле stickers_good
  // вычисляется автоматически в OrderProgressTab.handlePackDesignSubmit
  // (фидбэк 28.05). Legacy-логи stickers_good читаются через fallback ниже.
  // R13.2 (бриф 02.06): брак на заливке убран — учёт переехал на drying.
  pouring:  { value: 'Залито', valueAria: 'Залито, шт',     valueField: 'stickers_poured',  legacyField: 'stickers_good', showDefects: false, errorEmpty: 'Введите залито хотя бы по одному виду' },
  print:    { value: 'Напечатано', valueAria: 'Напечатано, шт', valueField: 'stickers_printed', showDefects: false, errorEmpty: 'Введите кол-во напечатанных' },
  cutting:  { value: 'Нарезано', valueAria: 'Нарезано, шт',  valueField: 'qty_cut',          showDefects: true,  errorEmpty: 'Введите нарезано или брак' },
}

// sessionStorage-bridge: drafts переживают unmount/remount компонента,
// чтобы при сохранении одного вида другие введённые числа не пропадали
// (фидбэк менеджера 17.05).
function draftsStorageKey(orderId, stage) {
  return `pack-drafts:${orderId || 'noid'}:${stage || 'nostage'}`
}
function readDrafts(orderId, stage) {
  try {
    const raw = sessionStorage.getItem(draftsStorageKey(orderId, stage))
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function PackDesignsFormImpl({ designs, logs = [], stage, incoming: _incoming, route, onSubmitDesign, updateName, readOnly = false, mode = 'pouring' }) {
  const labels = MODE_LABELS[mode] || MODE_LABELS.pouring
  const orderId = designs?.[0]?.order_id || null
  const [drafts, setDrafts] = useState(() => readDrafts(orderId, stage))
  // R13.2 (бриф 02.06): вместо per-row «+» — одна кнопка «Сохранить» в конце,
  // которая записывает все непустые ряды одной транзакцией.
  const [savingAll, setSavingAll] = useState(false)
  const [editingNameId, setEditingNameId] = useState(null)

  // Persist drafts to sessionStorage по (orderId, stage). При смене заказа/этапа
  // — другой ключ, старые drafts остаются в storage (изолированно) до закрытия вкладки.
  const storageKeyRef = useRef(draftsStorageKey(orderId, stage))
  useEffect(() => { storageKeyRef.current = draftsStorageKey(orderId, stage) }, [orderId, stage])
  useEffect(() => {
    try { sessionStorage.setItem(storageKeyRef.current, JSON.stringify(drafts)) } catch { /* quota */ }
  }, [drafts])

  function setField(idx, key, value) {
    setDrafts((prev) => ({ ...prev, [idx]: { ...prev[idx], [key]: value } }))
  }

  function designStats(designIndex) {
    const dlogs = (logs || []).filter(
      (l) => l.stage === stage && l.track === 'stickers' && l.design_index === designIndex && !l.deleted_at,
    )
    const value = dlogs.reduce((s, l) => {
      const primary = Number(l[labels.valueField]) || 0
      if (primary > 0 || !labels.legacyField) return s + primary
      return s + (Number(l[labels.legacyField]) || 0)
    }, 0)
    const defects = dlogs.reduce((s, l) => s + (Number(l.defects) || 0), 0)
    return { value, defects }
  }

  async function handleSubmitAll() {
    // Собираем все непустые ряды → пишем их batch. Если часть ушла успешно,
    // а часть упала — toast.error со списком неуспешных, остальные drafts
    // очищаются.
    const pending = []
    for (const d of designs) {
      const draft = drafts[d.design_index] || {}
      const value = Number(draft.value || 0)
      const defects = labels.showDefects ? Number(draft.defects || 0) : 0
      if (value === 0 && defects === 0) continue
      pending.push({ designIndex: d.design_index, payload: { value, defects } })
    }
    if (pending.length === 0) {
      toast.error(labels.errorEmpty)
      return
    }
    setSavingAll(true)
    const failed = []
    const succeeded = []
    for (const p of pending) {
      try {
        await onSubmitDesign(p.designIndex, p.payload)
        succeeded.push(p.designIndex)
      } catch (err) {
        failed.push({ designIndex: p.designIndex, message: translateError(err).message || err.message })
      }
    }
    if (succeeded.length > 0) {
      setDrafts((prev) => {
        const next = { ...prev }
        for (const idx of succeeded) delete next[idx]
        return next
      })
    }
    if (failed.length === 0) {
      toast.success(`Сохранено по ${succeeded.length} ${succeeded.length === 1 ? 'виду' : 'видам'}`)
    } else if (succeeded.length === 0) {
      toast.error(`Не удалось сохранить: ${failed.map((f) => `#${f.designIndex}`).join(', ')}`)
    } else {
      toast.error(`Сохранено ${succeeded.length}, ошибки на ${failed.map((f) => `#${f.designIndex}`).join(', ')}`)
    }
    setSavingAll(false)
  }

  if (!designs?.length) {
    return (
      <p className="text-sm text-text-muted">
        Виды не созданы. Проверьте, что у заказа указано «Стикеров в паке».
      </p>
    )
  }

  const grandTotal = designs.reduce((s, d) => s + designStats(d.design_index).value, 0)

  return (
    <div className="space-y-3">
      {designs.map((d) => {
        const { value, defects } = designStats(d.design_index)
        const perDesignIncoming = route
          ? computeIncomingPerDesign(logs, route, stage, d.design_index)
          : null
        const showPerIncoming = perDesignIncoming && !perDesignIncoming.isStart && perDesignIncoming.total != null
        const total = value + defects
        const pct = d.qty_target > 0 ? Math.min(100, Math.round((total / d.qty_target) * 100)) : 0
        const isComplete = total >= d.qty_target
        const isEditingName = editingNameId === d.id

        return (
          <div key={d.id} className={`rounded-xl border p-3 space-y-2 ${isComplete ? 'border-success/30 bg-success/5' : 'border-border'}`}>
            {showPerIncoming && (
              <p className="text-[10px] text-text-muted">
                Поступило на этап: {perDesignIncoming.total} шт
                {value >= perDesignIncoming.total && (
                  <span className="ml-2 text-warning">· достигнут лимит, можно вносить брак</span>
                )}
              </p>
            )}
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
                {total} / {d.qty_target} ({pct}%)
              </span>
            </div>

            {/* Progress */}
            <div className="h-1.5 bg-surface-dim rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${isComplete ? 'bg-success' : 'bg-accent'}`}
                style={{ width: `${pct}%` }}
              />
            </div>

            {/* Inputs — остаются видимыми даже после достижения тиража.
                R13.2: «+» убран, общая кнопка «Сохранить» рендерится в конце списка. */}
            {!readOnly && (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-text-muted mb-0.5">{labels.valueAria}</label>
                  <input
                    type="number"
                    min="0"
                    value={drafts[d.design_index]?.value ?? ''}
                    onChange={(e) => setField(d.design_index, 'value', e.target.value)}
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
                      value={drafts[d.design_index]?.defects ?? ''}
                      onChange={(e) => setField(d.design_index, 'defects', e.target.value)}
                      placeholder="0"
                      className="w-full rounded-md border border-border px-2 py-1.5 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/50"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {!readOnly && (
        <Button
          onClick={handleSubmitAll}
          loading={savingAll}
          className="w-full"
        >
          Сохранить
        </Button>
      )}

      <p className="text-xs text-text-muted pt-1 border-t border-border">
        Итого по стикерам: <span className="font-medium text-text tabular-nums">{grandTotal} шт</span>
      </p>
    </div>
  )
}

export const PackDesignsForm = memo(PackDesignsFormImpl)
