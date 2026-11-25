import { Link } from 'react-router-dom'
import { formatDateTime } from '@/shared/lib/utils'
import { TASK_KINDS, taskBucket } from '../lib/feed'

const BUCKET_CLS = {
  overdue: 'text-danger font-medium',
  today: 'text-warning font-medium',
  upcoming: 'text-text-muted',
  nodate: 'text-text-muted',
  done: 'text-text-muted line-through',
}

/**
 * R28.2 — строка задачи: галочка «выполнено», вид, срок (красный — просрочено,
 * оранжевый — сегодня), исполнитель, ссылка на сделку/клиента.
 */
export function TaskItem({ task, profilesById = {}, onToggle, onDelete, showContext = false, now = new Date(), disabled = false }) {
  const bucket = taskBucket(task, now)
  const kind = TASK_KINDS[task.kind] || TASK_KINDS.todo
  const assignee = profilesById[task.assignee_id]
  return (
    <div className="flex items-start gap-3">
      <input
        type="checkbox"
        checked={!!task.done_at}
        disabled={disabled}
        onChange={(e) => onToggle?.(task, e.target.checked)}
        aria-label={task.done_at ? 'Вернуть в работу' : 'Отметить выполненной'}
        className="mt-1 w-5 h-5 shrink-0 accent-[var(--color-accent)]"
      />
      <div className="flex-1 min-w-0">
        <div className={`text-sm ${task.done_at ? 'line-through text-text-muted' : ''}`}>
          <span aria-hidden="true" className="mr-1">{kind.icon}</span>
          <span className="sr-only">{kind.label}: </span>
          {task.title}
        </div>
        <div className="text-xs flex flex-wrap gap-x-2 mt-0.5">
          <span className={BUCKET_CLS[bucket]}>{task.due_at ? formatDateTime(task.due_at) : 'без срока'}</span>
          {assignee && <span className="text-text-muted">· {assignee.display_name}</span>}
          {showContext && task.deal && (
            <Link to={`/crm/deals/${task.deal.id}`} className="text-accent hover:underline">· сделка № {task.deal.number}</Link>
          )}
          {showContext && !task.deal && task.client && (
            <Link to={`/crm/clients/${task.client.id}`} className="text-accent hover:underline">· {task.client.name}</Link>
          )}
        </div>
        {task.notes && <p className="text-xs text-text-muted mt-0.5 whitespace-pre-wrap">{task.notes}</p>}
      </div>
      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(task)}
          aria-label="Удалить задачу"
          className="min-w-[36px] min-h-[36px] rounded-lg text-text-muted hover:text-danger"
        >
          ✕
        </button>
      )}
    </div>
  )
}
