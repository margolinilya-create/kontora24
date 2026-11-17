import { useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import { useReprintSubtasks } from '@/features/orders/hooks/useReprintSubtasks'
import { CreateReprintModal } from '@/features/orders/components/CreateReprintModal'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { captureError } from '@/shared/lib/sentry'
import Button from '@/shared/components/Button'
import {
  otkDefectStagesForRoute, otkDefectLabel, buildOtkLogPayloads, buildOtkReprintPrefill,
  computeOtkSummary, otkTargetQty,
} from '../../lib/production-logs'

const EMPTY_ROW = { defectStage: '', qty: '', view: '' }

const selectClass = 'w-full rounded-lg border border-border px-2 py-2 text-sm bg-surface text-text min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent/50'

/**
 * R25.2 (ТЗ 17.11 Фаза 2.1) — форма брака на этапе ТК.
 * Строки «тип / шт / вид» → логи stage='otk' (defects + defect_stage + item_idx).
 * Сохранять можно несколько раз; записи видны в «Истории записей» и правятся
 * там же. Под формой — итог «Поступило / Брак ТК / Годных» и, при недостаче,
 * кнопка «Создать допечатку» с предзаполнением.
 *
 * Лог пишется прямым insert (не addProductionLogAndCheckAdvance): запись брака
 * не завершает этап и не должна предлагать «завершить этап?».
 */
export function OtkDefectsForm({ order, logs, items = [], route, onSaved }) {
  const canEdit = useCanDo('stage:otk')
  const { createReprint } = useReprintSubtasks(order.id)
  const [rows, setRows] = useState([{ ...EMPTY_ROW }])
  const [saving, setSaving] = useState(false)
  const [reprintPrefill, setReprintPrefill] = useState(null)

  // R25.7D: + свои этапы маршрута с отметкой «Тип брака на ТК».
  const allowedStages = otkDefectStagesForRoute(route)
  // Вид — размерные виды заказа (k24_order_items), только если их больше одного.
  const views = order.order_type !== 'stickerpack3D' && items.length > 1 ? items : []
  const viewRequired = views.length > 0
  const isPack = order.order_type === 'stickerpack' || order.order_type === 'stickerpack3D'
  const unit = isPack ? 'паков' : 'шт'

  const summary = computeOtkSummary(logs, route, otkTargetQty(order, items))

  function updateRow(i, patch) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  async function handleSave() {
    const { payloads, error } = buildOtkLogPayloads(rows, { allowedStages, viewRequired })
    if (error) { toast.error(error); return }
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Не авторизован')
      const { error: insErr } = await supabase.from('k24_production_logs').insert(
        payloads.map((p) => ({ ...p, order_id: order.id, stage: 'otk', worker_id: user.id })),
      )
      if (insErr) throw insErr
      toast.success(payloads.length > 1 ? `Сохранено записей: ${payloads.length}` : 'Брак ТК сохранён')
      setRows([{ ...EMPTY_ROW }])
      onSaved?.()
    } catch (err) {
      captureError(err, { tags: { source: 'OtkDefectsForm.save' }, extra: { orderId: order.id } })
      toast.error(translateError(err).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-card p-5 space-y-4">
      <div>
        <h2 className="font-semibold">Брак на ТК</h2>
        <p className="text-xs text-text-muted mt-1">
          Количество — в {isPack ? 'паках' : 'изделиях заказа'}. Брак вычитается из годных на этапе своего типа и на всех следующих.
        </p>
      </div>

      {canEdit && (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className={`grid gap-2 items-end ${viewRequired ? 'grid-cols-[1fr_5rem_1fr_auto]' : 'grid-cols-[1fr_6rem_auto]'}`}>
              <label className="text-xs text-text-muted block">
                Тип брака
                <select
                  value={r.defectStage}
                  onChange={(e) => updateRow(i, { defectStage: e.target.value })}
                  className={`${selectClass} mt-0.5`}
                >
                  <option value="">— тип —</option>
                  {allowedStages.map((x) => (
                    <option key={x} value={x}>{otkDefectLabel(x)}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-text-muted block">
                {unit}
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  value={r.qty}
                  onChange={(e) => updateRow(i, { qty: e.target.value })}
                  className={`${selectClass} mt-0.5 tabular-nums`}
                  placeholder="0"
                />
              </label>
              {viewRequired && (
                <label className="text-xs text-text-muted block">
                  Вид
                  <select
                    value={r.view}
                    onChange={(e) => updateRow(i, { view: e.target.value })}
                    className={`${selectClass} mt-0.5`}
                  >
                    <option value="">— вид —</option>
                    {views.map((it) => (
                      <option key={it.idx} value={it.idx}>Вид {it.idx}</option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="button"
                onClick={() => setRows((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : [{ ...EMPTY_ROW }]))}
                className="min-h-[44px] min-w-[44px] text-text-muted hover:text-danger text-lg"
                aria-label="Убрать строку"
              >
                ×
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
            <button
              type="button"
              onClick={() => setRows((prev) => [...prev, { ...EMPTY_ROW }])}
              className="text-sm text-accent hover:text-accent-hover font-medium min-h-[44px]"
            >
              + Ещё строка
            </button>
            <Button onClick={handleSave} loading={saving} size="sm">Сохранить</Button>
          </div>
        </div>
      )}

      <div className="rounded-xl bg-surface-2 border border-border p-3 text-sm space-y-2">
        <p className="tabular-nums">
          Поступило на ТК: <b>{summary.incoming ?? '—'}</b>
          {' · '}Брак ТК: <b className={summary.defects > 0 ? 'text-danger' : ''}>{summary.defects}</b>
          {' · '}Годных: <b>{summary.good ?? '—'}</b> из {summary.target}
        </p>
        {summary.shortage > 0 && (
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-danger font-medium">Не хватает {summary.shortage} шт</p>
            {canEdit && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setReprintPrefill(buildOtkReprintPrefill(logs, summary))}
              >
                Создать допечатку
              </Button>
            )}
          </div>
        )}
      </div>

      {reprintPrefill && (
        <CreateReprintModal
          order={order}
          createReprint={createReprint}
          initial={reprintPrefill}
          onClose={() => setReprintPrefill(null)}
        />
      )}
    </div>
  )
}
