import { useState, useEffect } from 'react'
import {
  ORDER_SOURCES, PAYMENT_STATUSES, FILM_TYPES, LAMINATION_TYPES,
  calculateWorkerPayout, settingsToRates,
} from '@/shared/constants'
import { supabase } from '@/shared/lib/supabase'
import { fetchShapeByDesign } from '@/shared/lib/payout-context'
import { formatPrice } from '@/shared/lib/utils'
import { useProductionLogs } from '@/features/production/hooks/useProductionLogs'
import { InfoField } from './InfoField'
import { CalcSnapshotCard } from './CalcSnapshotCard'
import { useOrderItems } from '../hooks/useOrderItems'
import { fetchExtraMaterialsByOrder } from '@/features/reports/hooks/useReports'
import {
  aggregateMaterialUsage, buildCostMap, costForOrder, withMaterialUnitCosts,
} from '@/features/reports/lib/materials-cost'
import { captureError } from '@/shared/lib/sentry'

/**
 * Финансы заказа: 3 крупных плитки (Итого / Себестоимость / Маржинальность),
 * детали ниже. Себестоимость материалов считается автоматически из production logs
 * по средней цене склада (WAC, k24_materials_full.unit_cost) — та же модель, что
 * в отчётах (aggregateMaterialUsage + costForOrder). Раньше — жёсткий прайс
 * MATERIAL_COSTS, и цифры расходились с Unit Economics / P&L. Стоимость труда
 * считается через calculateWorkerPayout — только пост-печатные операции (заливка,
 * выборка, сборка, упаковка). На печать/ламинацию/резку — ручной cost_labor fallback.
 * Доступ — только для admin/manager.
 */
export function FinanceTab({ order }) {
  const { logs } = useProductionLogs(order.id, order.qty)
  // R27.0: виды заказа — сверка с расчётом калькулятора.
  const { items: orderItems } = useOrderItems(order.calc_snapshot ? order.id : null)
  // Средние цены склада (unit_cost маскируется view без view:finance; вкладка
  // и так открыта только с правом). Архивные позиции тоже нужны — заказ мог
  // списывать с позиции, которую потом убрали в архив.
  const [stock, setStock] = useState({ materials: [], error: null })
  useEffect(() => {
    let cancelled = false
    supabase.from('k24_materials_full')
      .select('id, name, type, material_code, unit_cost, archived_at')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          captureError(error, { tags: { source: 'FinanceTab.materials' }, extra: { orderId: order.id } })
          setStock({ materials: [], error })
          return
        }
        setStock({ materials: data || [], error: null })
      })
    return () => { cancelled = true }
  }, [order.id])
  const costMap = buildCostMap(stock.materials)
  const materialsById = Object.fromEntries(stock.materials.map((m) => [m.id, m]))
  const usage = aggregateMaterialUsage(logs, order)
  const actual = costForOrder({ ...withMaterialUnitCosts(order, materialsById), ...usage }, costMap)
  // costForOrder.total без доп. материалов (их добавляем ниже отдельно) и без подрядчика.
  // R19: ставки из настроек + формы стикеров (async) для дифф. оплаты заливки.
  const [payoutExtra, setPayoutExtra] = useState({ rates: undefined, shapeByDesign: {}, orderShape: {} })
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [ratesRes, shapeByDesign] = await Promise.all([
          supabase.from('k24_settings').select('value').eq('key', 'bonus_rates').single(),
          fetchShapeByDesign([order.id]),
        ])
        if (cancelled) return
        const orderShape = order.sticker_shape && order.sticker_shape !== 'standard'
          ? { [order.id]: order.sticker_shape } : {}
        setPayoutExtra({ rates: settingsToRates(ratesRes.data?.value), shapeByDesign, orderShape })
      } catch { /* дифф. ставки — не критично, падаем на standard */ }
    }
    load()
    return () => { cancelled = true }
  }, [order.id, order.sticker_shape])
  const payout = calculateWorkerPayout(logs, { ordersById: { [order.id]: order }, ...payoutExtra })

  // R25.7B (ТЗ 7.5): дополнительные материалы заказа (списания по факту).
  // В себестоимость входят только с отметкой категории «Учитывать в расходах».
  const [extraMaterials, setExtraMaterials] = useState({ cost: 0, items: [] })
  useEffect(() => {
    let cancelled = false
    fetchExtraMaterialsByOrder([order.id])
      .then((byOrder) => { if (!cancelled) setExtraMaterials(byOrder[order.id] || { cost: 0, items: [] }) })
      .catch((err) => captureError(err, { tags: { source: 'FinanceTab.extraMaterials' }, extra: { orderId: order.id } }))
    return () => { cancelled = true }
  }, [order.id, logs])
  const extraCost = extraMaterials.cost || 0

  const total = Number(order.price_final) || 0
  const manualLabor = Number(order.cost_labor) || 0
  const autoLabor = payout.total
  const labor = autoLabor > 0 ? autoLabor : manualLabor
  const manualMaterials = Number(order.cost_materials) || 0
  const materials = (actual.total > 0 ? actual.total : manualMaterials) + extraCost
  // R25.4 (ТЗ 4.2): работа подрядчика — отдельная строка себестоимости.
  const contractor = Number(order.contractor_cost) || 0
  const cost = materials + labor + contractor
  const margin = total - cost
  const marginPct = total > 0 ? (margin / total) * 100 : 0
  const safeQty = order.qty > 0 ? order.qty : 1
  const pricePerUnit = total / safeQty
  const costPerUnit = cost / safeQty

  return (
    <div className="space-y-6">
      {/* Top: 3 large bento tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-accent text-on-accent rounded-2xl shadow-card p-5">
          <p className="text-sm opacity-70">Итоговая стоимость</p>
          <p className="text-[clamp(1.25rem,3.5vw,1.875rem)] font-bold font-display tracking-tight mt-1 break-words">{formatPrice(total)}</p>
          {order.qty > 0 && (
            <p className="text-xs opacity-70 mt-1">{formatPrice(pricePerUnit)} / шт</p>
          )}
        </div>
        <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
          <p className="text-sm text-text-muted">Себестоимость</p>
          <p className="text-[clamp(1.25rem,3.5vw,1.875rem)] font-bold font-display tracking-tight mt-1 break-words">{formatPrice(cost)}</p>
          <p className="text-xs text-text-muted mt-1">
            {formatPrice(costPerUnit)} / шт
          </p>
          <p className="text-xs text-text-muted mt-0.5">
            Материалы {formatPrice(materials)} + труд {formatPrice(labor)}
            {autoLabor > 0 && <span className="ml-1 text-success">(авто)</span>}
            {contractor > 0 && <> + подрядчик {formatPrice(contractor)}</>}
          </p>
        </div>
        <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
          <p className="text-sm text-text-muted">Маржинальность</p>
          <p className={`text-[clamp(1.25rem,3.5vw,1.875rem)] font-bold font-display tracking-tight mt-1 break-words ${margin > 0 ? 'text-success' : margin < 0 ? 'text-danger' : ''}`}>
            {formatPrice(margin)}
          </p>
          {total > 0 && (
            <p className={`text-xs mt-1 ${margin > 0 ? 'text-success' : margin < 0 ? 'text-danger' : 'text-text-muted'}`}>
              {marginPct.toFixed(1)}%
            </p>
          )}
        </div>
      </div>

      {/* R25.6: снимок расчёта калькулятора (если заказ создан из калькулятора) */}
      <CalcSnapshotCard order={order} items={orderItems} />

      {/* Actual materials breakdown (WAC) */}
      {stock.error && (
        <p className="text-xs text-danger">
          Не удалось загрузить средние цены склада — себестоимость материалов может быть неполной.
        </p>
      )}
      {actual.total > 0 && (
        <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
          <h2 className="font-semibold mb-3">Фактический расход материалов</h2>
          <div className="divide-y divide-border text-sm">
            {usage.actual_film > 0 && (
              <CostLine
                label={`${order.film_material?.name || FILM_TYPES[order.film_type]?.label || 'Плёнка'} · ${usage.actual_film.toFixed(1)} м`}
                amount={actual.film}
              />
            )}
            {(usage.actual_lam > 0 || usage.actual_montage > 0) && (
              <CostLine
                label={`${order.lam_material?.name || LAMINATION_TYPES[order.lam_type]?.label || 'Ламинация / монтаж'} · ${(usage.actual_lam + usage.actual_montage).toFixed(1)} м`}
                amount={actual.lam}
              />
            )}
            {usage.actual_resin > 0 && (
              <CostLine label={`Смола · ${usage.actual_resin.toFixed(0)} г`} amount={actual.resin} />
            )}
            {usage.boxes_used > 0 && (
              <CostLine label={`Коробки · ${usage.boxes_used} шт`} amount={actual.box} />
            )}
          </div>
          <p className="text-xs text-text-muted mt-3">По средней цене склада (как в отчётах).</p>
          {manualMaterials > 0 && Math.abs(manualMaterials - actual.total) > 1 && (
            <p className="text-xs text-text-muted mt-1">
              Ручная себестоимость материалов: {formatPrice(manualMaterials)} (используется фактический расход)
            </p>
          )}
        </div>
      )}

      {/* R25.7B: дополнительные материалы заказа */}
      {extraMaterials.items.length > 0 && (
        <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
          <h2 className="font-semibold mb-3">Дополнительные материалы</h2>
          <div className="divide-y divide-border text-sm">
            {extraMaterials.items.map((it) => (
              <div key={`${it.materialId}-${it.inCosts}`} className="py-2 flex items-center justify-between gap-3">
                <span className="text-text-muted">
                  {it.category ? `${it.category}: ` : ''}{it.name} · {it.qty} {it.unit || ''}
                  {!it.inCosts && <span className="ml-1">(общие расходы цеха)</span>}
                </span>
                <span className="font-medium tabular-nums">{it.cost != null ? formatPrice(it.cost) : '—'}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-text-muted mt-3">
            В себестоимость входят категории с отметкой «Учитывать в расходах».
          </p>
        </div>
      )}

      {/* Payout breakdown — только пост-печать */}
      {autoLabor > 0 && (
        <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
          <h2 className="font-semibold mb-3">Сдельная оплата (пост-печать)</h2>
          <div className="divide-y divide-border text-sm">
            {Object.entries(payout.breakdown).filter(([, v]) => v.count > 0).map(([k, v]) => (
              <div key={k} className="py-2 flex items-center justify-between">
                <span className="text-text-muted">
                  {v.label} · {v.count} шт × {v.rate} ₽
                </span>
                <span className="font-medium tabular-nums">{formatPrice(v.amount)}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-text-muted mt-3">
            Печать / ламинация / резка / дизайн — не учитываются в сдельной оплате.
          </p>
        </div>
      )}

      {/* Details */}
      <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
        <h2 className="font-semibold mb-4 text-lg">Детали</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <InfoField label="Материалы" value={formatPrice(materials)} />
          <InfoField label="Труд" value={formatPrice(labor)} />
          {(order.is_subcontract || contractor > 0) && (
            <InfoField label="Подрядчик" value={formatPrice(contractor)} />
          )}
          <InfoField label="Цена / шт" value={formatPrice(pricePerUnit)} />
          <InfoField label="Себестоимость / шт" value={formatPrice(costPerUnit)} />
          <InfoField label="Наценка" value={order.markup ? `x${order.markup}` : '—'} />
          <InfoField label="Скидка" value={order.discount_pct ? `${Math.round(order.discount_pct * 100)}%` : '—'} />
        </div>
      </div>

      {/* Deal */}
      <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
        <h2 className="font-semibold text-lg mb-4">Сделка</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          {order.deal_name && <InfoField label="Название сделки" value={order.deal_name} />}
          {order.bitrix_deal_id && <InfoField label="Bitrix ID" value={order.bitrix_deal_id} />}
          <InfoField label="Партнёрский" value={order.is_partner ? 'Да (-25%)' : 'Нет'} />
          <InfoField label="Источник" value={ORDER_SOURCES[order.source]?.label || '—'} />
          {order.source === 'referrer' && order.source_referrer && (
            <InfoField label="Референт" value={order.source_referrer} />
          )}
          <InfoField label="Оплата" value={PAYMENT_STATUSES[order.payment_status]?.label || '—'} />
        </div>
      </div>
    </div>
  )
}

function CostLine({ label, amount }) {
  return (
    <div className="py-2 flex items-center justify-between gap-3">
      <span className="text-text-muted">{label}</span>
      <span className="font-medium tabular-nums">{formatPrice(Math.round(amount))}</span>
    </div>
  )
}
