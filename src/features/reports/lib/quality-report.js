import { OTK_DEFECT_STAGES } from '@/features/production/lib/production-logs'

/**
 * Отчёт «Качество» по заказам (useQualityReport).
 *
 * Базовые колонки — как до R25.2 (эталон R25.0 не меняется на старых данных):
 *   printed / poured / good — суммы полей по всем логам заказа;
 *   rejected — брак заливки = poured − good; rejectPct — rejected / poured;
 *   surplus — printed − тираж.
 *
 * R25.2 (ТЗ 17.11 Фаза 2.4): брак ТК добавляется к браку этапа своего типа,
 * и рядом — «в т.ч. найдено на ТК»:
 *   defects_print / defects_lamination / defects_cutting = брак этапа + ТК;
 *   rejected (заливка) += ТК типа «Заливка»;
 *   otk_print / otk_lamination / otk_cutting / otk_pouring / otk_total.
 *
 * @param {Array} orders — { id, number, custom_number, qty, order_type }
 * @param {Array} logs — { order_id, stage, defects, defect_stage, stickers_printed, stickers_poured, stickers_good }
 */
export function buildQualityRows(orders, logs) {
  const byOrder = {}
  for (const l of logs || []) {
    const acc = (byOrder[l.order_id] ||= {
      printed: 0, poured: 0, good: 0,
      stage_print: 0, stage_lamination: 0, stage_cutting: 0,
      otk_print: 0, otk_lamination: 0, otk_cutting: 0, otk_pouring: 0, otk_total: 0,
    })
    acc.printed += l.stickers_printed || 0
    acc.poured += l.stickers_poured || 0
    acc.good += l.stickers_good || 0
    const def = Number(l.defects) || 0
    if (l.stage === 'otk') {
      if (OTK_DEFECT_STAGES.includes(l.defect_stage) && def > 0) {
        acc[`otk_${l.defect_stage}`] += def
        acc.otk_total += def
      }
    } else if (l.stage === 'print' || l.stage === 'lamination' || l.stage === 'cutting') {
      acc[`stage_${l.stage}`] += def
    }
  }

  return (orders || [])
    .filter((o) => byOrder[o.id])
    .map((o) => {
      const l = byOrder[o.id]
      const rejected = (l.poured > 0 ? l.poured - l.good : 0) + l.otk_pouring
      const rejectPct = l.poured > 0 ? Math.round((rejected / l.poured) * 100) : 0
      const surplus = l.printed > 0 ? l.printed - o.qty : 0
      const surplusPct = o.qty > 0 ? Math.round((surplus / o.qty) * 100) : 0
      return {
        ...o,
        printed: l.printed, poured: l.poured, good: l.good,
        rejected, rejectPct, surplus, surplusPct,
        defects_print: l.stage_print + l.otk_print,
        defects_lamination: l.stage_lamination + l.otk_lamination,
        defects_cutting: l.stage_cutting + l.otk_cutting,
        otk_print: l.otk_print,
        otk_lamination: l.otk_lamination,
        otk_cutting: l.otk_cutting,
        otk_pouring: l.otk_pouring,
        otk_total: l.otk_total,
      }
    })
}
