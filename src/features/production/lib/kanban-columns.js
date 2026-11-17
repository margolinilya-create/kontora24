import { ORDER_STATUSES } from '@/shared/constants'
import { insertCustomStageColumns } from '@/shared/lib/department-mapping'

// Встроенные колонки канбана / PipelineSummary — та же формула, что COLS в
// PipelineSummary (рабочие этапы без cancelled/done/batch_layout по .order).
const BUILTIN_COLS = Object.entries(ORDER_STATUSES)
  .filter(([key]) => key !== 'cancelled' && key !== 'done' && key !== 'batch_layout')
  .sort((a, b) => a[1].order - b[1].order)
  .map(([key]) => key)

/**
 * R25.7D: колонки с учётом своих этапов каталога (после последней колонки
 * своего отдела). Вызывать при рендере — каталог грузится после логина.
 * @param {object[]} [stageDefs] — каталог; по умолчанию — реестр (неархивные)
 */
export function getKanbanColumns(stageDefs) {
  return stageDefs ? insertCustomStageColumns(BUILTIN_COLS, stageDefs) : insertCustomStageColumns(BUILTIN_COLS)
}
