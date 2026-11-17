import { useMemo, useState } from 'react'
import { getStatusMeta } from '@/shared/constants'
import { buildRouteSnapshot } from '@/shared/lib/route-registry'
import { OrderStepper } from '@/features/orders/components/OrderStepper'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'
import { RouteBuilder } from './RouteBuilder'
import { validateTypeRoute, rateStagesFor, normalizeRates } from '../lib/validate-type-route'
import { saveOrderType } from '../lib/order-types-api'

const label = (s) => getStatusMeta(s)?.label || s

/**
 * R25.7C (ТЗ 7.1–7.3, 7.6): редактор типа — поля, конструктор маршрута,
 * предпросмотр степпером, ставки (только у своих типов). Сохранение —
 * RPC save_order_type, затем onSaved() (store.reload()).
 */
export function OrderTypeEditor({ initial, stageDefs, onCancel, onSaved }) {
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))

  const routeError = validateTypeRoute({
    production: draft.production, lockedBlocks: draft.locked_blocks, isBuiltin: draft.is_builtin,
    stageExists: (k) => stageDefs.some((d) => d.key === k),
  })

  // Предпросмотр: заказ v2 со снимком черновика (ламинация и доставка включены,
  // чтобы видеть полный маршрут; правила заказа применит getOrderRoute).
  const previewOrder = useMemo(() => ({
    id: 'preview',
    status: 'new',
    route_version: 2,
    order_type: draft.key || '__draft__',
    need_lam: true,
    delivery_type: 'delivery',
    route_snapshot: buildRouteSnapshot({
      key: draft.key || '__draft__', is_builtin: draft.is_builtin, is_set: draft.is_set,
      head: draft.head, production: draft.production, rates: null,
    }),
  }), [draft.key, draft.is_builtin, draft.is_set, draft.head, draft.production])

  function setRate(stage, patch) {
    setDraft((d) => ({ ...d, rates: { ...d.rates, [stage]: { rate: '', base: 'item', ...(d.rates[stage] || {}), ...patch } } }))
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!draft.name.trim()) { toast.error('Укажите название типа'); return }
    if (draft.short_name.length > 16) { toast.error('Короткое название — не длиннее 16 символов'); return }
    if (routeError) { toast.error(routeError); return }
    const payload = {
      name: draft.name.trim(),
      short_name: draft.short_name.trim() || null,
      head: draft.head,
      production: draft.production,
    }
    if (draft.key) payload.key = draft.key
    if (!draft.is_builtin) {
      payload.is_set = draft.is_set
      payload.rates = normalizeRates(draft.rates, draft.production, draft.is_set)
      payload.archived = draft.archived
    }
    setSaving(true)
    try {
      await saveOrderType(payload)
      toast.success(draft.key ? 'Тип сохранён' : 'Тип создан')
      await onSaved?.()
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setSaving(false)
    }
  }

  const canResetRoute = draft.is_builtin && Array.isArray(draft.default_production)
    && JSON.stringify(draft.default_production) !== JSON.stringify(draft.production)

  return (
    <form onSubmit={handleSave} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Название" value={draft.name} onChange={(e) => set({ name: e.target.value })} required />
        <Input label="Короткое название (до 16 символов)" value={draft.short_name} maxLength={16}
          onChange={(e) => set({ short_name: e.target.value })} placeholder="Для канбана и наклейки" />
      </div>
      {!draft.is_builtin && (
        <div className="flex flex-wrap gap-4">
          <label className="inline-flex items-center gap-2 text-sm min-h-[44px]">
            <input type="checkbox" checked={draft.is_set} onChange={(e) => set({ is_set: e.target.checked })} />
            Изделие — набор <span className="text-xs text-text-muted">(«Стикеров в паке», ставки за стикер)</span>
          </label>
          {draft.key && (
            <label className="inline-flex items-center gap-2 text-sm min-h-[44px]">
              <input type="checkbox" checked={draft.archived} onChange={(e) => set({ archived: e.target.checked })} />
              В архиве <span className="text-xs text-text-muted">(не предлагается в новых заказах)</span>
            </label>
          )}
        </div>
      )}

      <div className="rounded-xl border border-border p-4">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h3 className="font-semibold">Маршрут</h3>
          {canResetRoute && (
            <button type="button" className="text-xs text-accent hover:underline min-h-[36px]"
              onClick={() => set({ production: [...draft.default_production] })}>
              Вернуть маршрут по умолчанию
            </button>
          )}
        </div>
        <RouteBuilder
          head={draft.head}
          production={draft.production}
          lockedBlocks={draft.locked_blocks}
          isBuiltin={draft.is_builtin}
          stageDefs={stageDefs}
          onChange={({ head, production }) => set({ head, production })}
        />
      </div>

      <div className="rounded-xl border border-border p-4">
        <h3 className="font-semibold mb-2">Предпросмотр маршрута</h3>
        <p className="text-xs text-text-muted mb-2">С ламинацией и доставкой; у конкретного заказа этапы снимаются по его флагам.</p>
        <OrderStepper order={previewOrder} />
      </div>

      {draft.is_builtin ? (
        <p className="text-xs text-text-muted">
          Сдельная оплата встроенного типа не меняется (заливка, выборка, сборка 3D, упаковка — по ставкам «Настройки → Ставки»).
        </p>
      ) : (
        <div className="rounded-xl border border-border p-4">
          <h3 className="font-semibold mb-1">Сдельные ставки</h3>
          <p className="text-xs text-text-muted mb-3">Пусто — этап без сдельной оплаты. Количество — основное поле этапа (у своего этапа — выполнено − брак).</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-muted border-b border-border">
                  <th className="py-2 pr-3 font-medium">Этап</th>
                  <th className="py-2 pr-3 font-medium">Ставка, ₽</th>
                  <th className="py-2 font-medium">База</th>
                </tr>
              </thead>
              <tbody>
                {rateStagesFor(draft.production).map((stage) => {
                  const r = draft.rates[stage] || { rate: '', base: 'item' }
                  return (
                    <tr key={stage} className="border-b border-border last:border-0">
                      <td className="py-1.5 pr-3">{label(stage)}</td>
                      <td className="py-1.5 pr-3">
                        <input
                          type="text" inputMode="decimal" value={r.rate} placeholder="—"
                          aria-label={`Ставка: ${label(stage)}`}
                          onChange={(e) => { const v = e.target.value; if (v === '' || /^[\d.,]*$/.test(v)) setRate(stage, { rate: v }) }}
                          className="w-24 rounded-lg border border-border px-2 py-1.5 bg-surface min-h-[40px] tabular-nums"
                        />
                      </td>
                      <td className="py-1.5">
                        <select
                          value={draft.is_set ? r.base : 'item'}
                          disabled={!draft.is_set}
                          aria-label={`База ставки: ${label(stage)}`}
                          onChange={(e) => setRate(stage, { base: e.target.value })}
                          className="rounded-lg border border-border px-2 py-1.5 bg-surface min-h-[40px]"
                        >
                          <option value="item">за изделие</option>
                          {draft.is_set && <option value="sticker">за стикер</option>}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Отмена</Button>
        <Button type="submit" loading={saving} disabled={!!routeError}>Сохранить</Button>
      </div>
    </form>
  )
}
