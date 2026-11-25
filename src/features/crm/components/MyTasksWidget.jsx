import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import { useProfiles } from '@/features/orders/hooks/useOrders'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { captureError } from '@/shared/lib/sentry'
import { formatDateTime } from '@/shared/lib/utils'
import { useAsyncData } from '../hooks/useCrmData'
import { listMyOpenTasks, listMentions, listOpenTaskDealIds, setTaskDone } from '../lib/feed-api'
import { listDeals, listPipelines } from '../lib/deals-api'
import { sortOpenTasks, taskBucket, dealsWithoutNextStep } from '../lib/feed'
import { TaskItem } from './TaskItem'

function Inner({ userId }) {
  const { profiles } = useProfiles()
  const profilesById = Object.fromEntries(profiles.map((p) => [p.id, p]))

  const { data, loading, refetch } = useAsyncData(
    async () => {
      const [tasks, mentions, deals, pipelines] = await Promise.all([
        listMyOpenTasks(userId), listMentions(userId), listDeals({}), listPipelines(),
      ])
      const stagesById = Object.fromEntries(pipelines.flatMap((p) => p.stages).map((s) => [s.id, s]))
      const openDeals = deals.filter((d) => stagesById[d.stage_id]?.kind === 'open')
      const withTask = await listOpenTaskDealIds(openDeals.map((d) => d.id))
      return { tasks, mentions, noStep: dealsWithoutNextStep(openDeals, withTask, stagesById) }
    },
    userId,
    'crm.MyTasksWidget',
  )

  if (loading || !data) return null
  const now = new Date()
  const tasks = sortOpenTasks(data.tasks, now)
  const overdue = tasks.filter((t) => taskBucket(t, now) === 'overdue').length
  const today = tasks.filter((t) => taskBucket(t, now) === 'today').length

  async function toggle(task, done) {
    try {
      await setTaskDone(task.id, done)
      refetch()
    } catch (err) {
      captureError(err, { tags: { source: 'crm.MyTasksWidget.toggle' } })
      toast.error(translateError(err).message)
    }
  }

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-card p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="font-semibold">Мои задачи</h2>
        <span className="text-xs">
          {overdue > 0 && <span className="text-danger font-medium">просрочено {overdue} · </span>}
          {today > 0 && <span className="text-warning font-medium">сегодня {today} · </span>}
          <span className="text-text-muted">всего {tasks.length}</span>
        </span>
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-text-muted">Открытых задач нет</p>
      ) : (
        <ul className="space-y-2.5">
          {tasks.slice(0, 8).map((t) => (
            <li key={t.id}><TaskItem task={t} profilesById={profilesById} now={now} showContext onToggle={toggle} /></li>
          ))}
          {tasks.length > 8 && <li className="text-xs text-text-muted">…и ещё {tasks.length - 8}</li>}
        </ul>
      )}

      {data.noStep.length > 0 && (
        <div className="border-t border-border pt-3">
          <h3 className="text-sm font-medium mb-1.5">Сделки без следующего шага <span className="text-text-muted font-normal">{data.noStep.length}</span></h3>
          <ul className="flex flex-wrap gap-1.5">
            {data.noStep.slice(0, 10).map((d) => (
              <li key={d.id}>
                <Link to={`/crm/deals/${d.id}`} className="inline-block px-2.5 py-1 rounded-full border border-warning/50 text-xs hover:bg-surface-2">
                  № {d.number} {d.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.mentions.length > 0 && (
        <div className="border-t border-border pt-3">
          <h3 className="text-sm font-medium mb-1.5">Вас упомянули</h3>
          <ul className="space-y-1.5">
            {data.mentions.slice(0, 5).map((n) => (
              <li key={n.id} className="text-sm">
                <span className="text-xs text-text-muted">{profilesById[n.author_id]?.display_name || '—'} · {formatDateTime(n.created_at)} · </span>
                {n.deal ? (
                  <Link to={`/crm/deals/${n.deal.id}`} className="text-accent hover:underline text-xs">сделка № {n.deal.number}</Link>
                ) : n.client ? (
                  <Link to={`/crm/clients/${n.client.id}`} className="text-accent hover:underline text-xs">{n.client.name}</Link>
                ) : null}
                <p className="line-clamp-2">{n.body}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * R28.2 — виджет главной: мои задачи (просрочено/сегодня/дальше),
 * сделки без следующего шага, упоминания. Только с правом view:crm.
 */
export function MyTasksWidget() {
  const canCrm = useCanDo('view:crm')
  const { user } = useAuth()
  if (!canCrm || !user?.id) return null
  return <Inner userId={user.id} />
}
