import { computeLogPayout } from '@/shared/constants'

/**
 * R25.0: сдельная оплата для отчётов «Сдельная оплата» (useBonusReport) и
 * «Сотрудники» (useEmployeeReport). Ставки и правила — только через
 * computeLogPayout (тот же источник, что calculateWorkerPayout в кабинете).
 */

/**
 * Итоги одного лога в разрезе колонок отчёта.
 * @param {object} log — лог с embed `order` (order_type, stickers_per_pack)
 * @param {object} rates — resolvePayoutRates(settingsToRates(bonus_rates))
 * @param {string} shape — форма стикера (shapeForLog)
 * @returns {{ poured: number, selected: number, assembled: number, packaged: number, payout: number }}
 */
export function logPayoutTotals(log, rates, shape) {
  const t = { poured: 0, selected: 0, assembled: 0, packaged: 0, payout: 0 }
  for (const e of computeLogPayout(log, log?.order || null, rates, { shape })) {
    if (e.shape) t.poured += e.qty
    else if (e.category === 'selection') t.selected += e.qty
    else if (e.category === 'assembly') t.assembled += e.qty
    else if (e.category === 'packaging') t.packaged += e.qty
    t.payout += e.amount
  }
  return t
}

/**
 * Строки отчёта «Сдельная оплата» по имени сотрудника, по убыванию суммы.
 * @param {Array} logs — логи с embed worker.display_name и order
 * @param {object} rates — полные ставки
 * @param {(log) => string} shapeOf — форма стикера лога
 */
export function buildBonusRows(logs, rates, shapeOf) {
  const byWorker = {}
  for (const l of logs || []) {
    const name = l.worker?.display_name || 'Неизвестный'
    if (!byWorker[name]) byWorker[name] = { name, resin: 0, assembly: 0, packaging: 0, selection: 0, total: 0 }
    const w = byWorker[name]
    const t = logPayoutTotals(l, rates, shapeOf(l))
    w.resin += t.poured
    w.selection += t.selected
    w.assembly += t.assembled
    w.packaging += t.packaged
    w.total += t.payout
  }
  return Object.values(byWorker).sort((a, b) => b.total - a.total)
}
