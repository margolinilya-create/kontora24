import { REPRINT_STATUS_LABELS } from '@/shared/constants'
import { computeSubtaskStageProgress } from '../lib/production-logs'

/**
 * R22.1 (ТЗ 20.07 Фаза 1) — вертикальная цепочка маршрута допечатки.
 * Каждый этап: статус (пройден / текущий / впереди), прогресс, дата завершения.
 * Дата завершения этапа = created_at последнего лога этого этапа (без отдельной
 * history-таблицы).
 */
export function SubtaskRouteChain({ subtask, logs }) {
  const route = Array.isArray(subtask?.route) ? subtask.route : []
  const stages = route.filter((s) => s !== 'done')
  const isDone = subtask?.status === 'done'
  const curIdx = isDone ? stages.length : stages.indexOf(subtask?.status)

  function stageDate(stage) {
    const stageLogs = (logs || []).filter((l) => l.stage === stage && !l.deleted_at)
    if (!stageLogs.length) return null
    const latest = stageLogs.reduce((a, b) => (new Date(a.created_at) > new Date(b.created_at) ? a : b))
    return new Date(latest.created_at).toLocaleDateString('ru-RU')
  }

  return (
    <ol className="space-y-0">
      {stages.map((stage, i) => {
        const done = i < curIdx
        const current = i === curIdx && !isDone
        const prog = computeSubtaskStageProgress(logs, stage, subtask?.qty)
        return (
          <li key={stage} className="flex gap-3">
            {/* Линия + точка */}
            <div className="flex flex-col items-center">
              <div className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${
                done ? 'bg-success border-success'
                  : current ? 'bg-accent border-accent ring-4 ring-accent/20'
                  : 'bg-surface border-border'
              }`} />
              {i < stages.length - 1 && (
                <div className={`w-0.5 flex-1 min-h-[24px] ${done ? 'bg-success/40' : 'bg-border'}`} />
              )}
            </div>
            {/* Контент */}
            <div className={`pb-4 min-w-0 ${current ? 'font-medium' : ''}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={done ? 'text-text-muted' : current ? 'text-text' : 'text-text-muted'}>
                  {REPRINT_STATUS_LABELS[stage] || stage}
                </span>
                {current && (
                  <span className="text-xs text-accent">
                    {prog.total} / {prog.target} шт · {prog.percentage}%
                  </span>
                )}
                {done && stageDate(stage) && (
                  <span className="text-xs text-text-muted">✓ {stageDate(stage)}</span>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
