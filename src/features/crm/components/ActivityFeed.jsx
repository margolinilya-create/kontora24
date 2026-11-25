import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '@/shared/components/Button'
import ConfirmDialog from '@/shared/components/ConfirmDialog'
import { Skeleton } from '@/shared/components/Skeleton'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import { useProfiles } from '@/features/orders/hooks/useOrders'
import { getStatusMeta } from '@/shared/constants'
import { formatDateTime, formatOrderNumber } from '@/shared/lib/utils'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { captureError } from '@/shared/lib/sentry'
import { useAsyncData } from '../hooks/useCrmData'
import {
  listNotes, listTasks, listActivities, listOrderHistory, createNote, updateNote, deleteNote,
  createTask, setTaskDone, deleteTask,
} from '../lib/feed-api'
import { buildFeed, filterFeed, FEED_FILTERS, TASK_KINDS, defaultDueInput, localInputToIso } from '../lib/feed'
import { TaskItem } from './TaskItem'

const INPUT_CLS = 'w-full rounded-xl border border-border px-3.5 py-2.5 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent/60'

async function guarded(fn, source, okText) {
  try {
    await fn()
    if (okText) toast.success(okText)
    return true
  } catch (err) {
    captureError(err, { tags: { source } })
    toast.error(translateError(err).message)
    return false
  }
}

function Composer({ target, managers, myId, onSaved }) {
  const [mode, setMode] = useState('note')
  const [body, setBody] = useState('')
  const [mentions, setMentions] = useState([])
  const [task, setTask] = useState(() => ({ title: '', kind: 'call', due: defaultDueInput(), assigneeId: myId || '' }))
  const [saving, setSaving] = useState(false)

  async function save() {
    if (mode === 'note' ? !body.trim() : !task.title.trim()) return
    setSaving(true)
    const ok = mode === 'note'
      ? await guarded(() => createNote({ body, mentions, ...target }), 'crm.ActivityFeed.note')
      : await guarded(() => createTask({
        title: task.title, kind: task.kind, dueAt: localInputToIso(task.due), assigneeId: task.assigneeId || null, ...target,
      }), 'crm.ActivityFeed.task', 'Задача создана')
    setSaving(false)
    if (ok) {
      setBody('')
      setMentions([])
      setTask({ title: '', kind: 'call', due: defaultDueInput(), assigneeId: myId || '' })
      onSaved()
    }
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-3 space-y-2">
      <div className="inline-flex gap-1 bg-surface-2 rounded-xl p-1" role="tablist">
        {[['note', 'Заметка'], ['task', 'Задача']].map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={mode === k}
            onClick={() => setMode(k)}
            className={`px-3 py-1.5 min-h-[36px] rounded-lg text-sm font-medium ${mode === k ? 'bg-accent text-on-accent' : 'text-text-muted hover:text-text'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'note' ? (
        <>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save() }}
            rows={3}
            placeholder="Что важно запомнить о клиенте или сделке…"
            aria-label="Текст заметки"
            className={INPUT_CLS}
          />
          {managers.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-text-muted">Упомянуть:</span>
              {managers.map((p) => {
                const on = mentions.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setMentions((m) => (on ? m.filter((x) => x !== p.id) : [...m, p.id]))}
                    className={`px-2.5 py-1 min-h-[32px] rounded-full border ${on ? 'border-accent bg-accent/10 text-text' : 'border-border text-text-muted'}`}
                  >
                    @{p.display_name || 'без имени'}
                  </button>
                )
              })}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-2">
          <input
            value={task.title}
            onChange={(e) => setTask({ ...task, title: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') save() }}
            placeholder="Что сделать: например, «Перезвонить по макету»"
            aria-label="Задача"
            className={INPUT_CLS}
          />
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(TASK_KINDS).map(([k, kind]) => (
              <button
                key={k}
                type="button"
                aria-pressed={task.kind === k}
                onClick={() => setTask({ ...task, kind: k })}
                className={`px-2.5 py-1 min-h-[32px] rounded-full border text-xs ${task.kind === k ? 'border-accent bg-accent/10' : 'border-border text-text-muted'}`}
              >
                {kind.icon} {kind.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="datetime-local"
              value={task.due}
              onChange={(e) => setTask({ ...task, due: e.target.value })}
              aria-label="Срок"
              className={INPUT_CLS}
            />
            <select
              value={task.assigneeId}
              onChange={(e) => setTask({ ...task, assigneeId: e.target.value })}
              aria-label="Исполнитель"
              className={INPUT_CLS}
            >
              <option value="">Без исполнителя</option>
              {managers.map((p) => <option key={p.id} value={p.id}>{p.display_name || 'Без имени'}</option>)}
            </select>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" loading={saving} onClick={save} disabled={mode === 'note' ? !body.trim() : !task.title.trim()}>
          {mode === 'note' ? 'Добавить заметку' : 'Создать задачу'}
        </Button>
      </div>
    </div>
  )
}

/**
 * R28.2 — единая лента карточки клиента / сделки: заметки, задачи, события
 * сделок, история статусов заказов. Ввод заметок и задач — сверху.
 *
 * @param target — { clientId, dealId }: куда пишутся заметки/задачи (на сделке —
 *   обе связи, чтобы запись была видна и в карточке клиента).
 * @param scopeBy — 'deal' | 'client': что показывать.
 * @param orders — заказы клиента/сделки (для истории статусов).
 */
export function ActivityFeed({ target, scopeBy, orders = [] }) {
  const { user } = useAuth()
  const canEdit = useCanDo('crm:edit')
  const canManage = useCanDo('crm:manage')
  const { profiles } = useProfiles()
  const [filter, setFilter] = useState('all')
  const [confirmDelete, setConfirmDelete] = useState(null) // { type, item }
  const orderIds = orders.map((o) => o.id)
  const scopeTarget = scopeBy === 'deal' ? { dealId: target.dealId } : { clientId: target.clientId }

  const { data, loading, refetch } = useAsyncData(
    async () => {
      const [notes, tasks, activities, statusHistory] = await Promise.all([
        listNotes(scopeTarget), listTasks(scopeTarget), listActivities(scopeTarget), listOrderHistory(orderIds),
      ])
      return { notes, tasks, activities, statusHistory }
    },
    JSON.stringify([scopeTarget, orderIds]),
    'crm.ActivityFeed',
  )

  const profilesById = Object.fromEntries(profiles.map((p) => [p.id, p]))
  const managers = profiles.filter((p) => p.role === 'admin' || p.role === 'manager')
  const ordersById = Object.fromEntries(orders.map((o) => [o.id, o]))
  const items = filterFeed(buildFeed({ ...(data || {}), ordersById }), filter)
  const now = new Date()

  async function togglePin(note) {
    if (await guarded(() => updateNote(note.id, { pinned: !note.pinned }), 'crm.ActivityFeed.pin')) refetch()
  }
  async function toggleTask(task, done) {
    if (await guarded(() => setTaskDone(task.id, done), 'crm.ActivityFeed.taskDone')) refetch()
  }
  async function doDelete() {
    const { type, item } = confirmDelete
    setConfirmDelete(null)
    const fn = type === 'note' ? () => deleteNote(item.id) : () => deleteTask(item.id)
    if (await guarded(fn, 'crm.ActivityFeed.delete')) refetch()
  }

  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Лента</h2>
      {canEdit && <Composer target={target} managers={managers} myId={user?.id} onSaved={refetch} />}

      <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Фильтр ленты">
        {FEED_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`px-3 py-1.5 min-h-[36px] rounded-full text-sm border ${filter === f.key ? 'border-accent bg-accent/10' : 'border-border text-text-muted hover:text-text'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : items.length === 0 ? (
        <p className="text-sm text-text-muted">Пока пусто</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.key} className={`bg-surface rounded-xl border p-3 ${it.pinned ? 'border-accent/50' : 'border-border'}`}>
              {it.type === 'note' && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs text-text-muted">
                    <span>
                      {it.pinned && <span aria-label="Закреплено">📌 </span>}
                      Заметка · {profilesById[it.data.author_id]?.display_name || '—'} · {formatDateTime(it.data.created_at)}
                    </span>
                    {(it.data.author_id === user?.id || canManage) && (
                      <span className="flex gap-1 shrink-0">
                        <button className="hover:text-text min-h-[32px] px-1" onClick={() => togglePin(it.data)}>{it.pinned ? 'Открепить' : 'Закрепить'}</button>
                        <button className="hover:text-danger min-h-[32px] px-1" onClick={() => setConfirmDelete({ type: 'note', item: it.data })}>Удалить</button>
                      </span>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words">{it.data.body}</p>
                  {it.data.mentions?.length > 0 && (
                    <p className="text-xs text-text-muted">→ {it.data.mentions.map((id) => `@${profilesById[id]?.display_name || '—'}`).join(', ')}</p>
                  )}
                </div>
              )}
              {it.type === 'task' && (
                <TaskItem
                  task={it.data}
                  profilesById={profilesById}
                  now={now}
                  showContext={scopeBy === 'client'}
                  disabled={!canEdit}
                  onToggle={toggleTask}
                  onDelete={(it.data.created_by === user?.id || canManage) ? (t) => setConfirmDelete({ type: 'task', item: t }) : undefined}
                />
              )}
              {it.type === 'deal' && (
                <div className="text-sm">
                  <div className="text-xs text-text-muted">
                    Сделка · {profilesById[it.data.actor_id]?.display_name || 'система'} · {formatDateTime(it.data.occurred_at)}
                  </div>
                  <div>
                    {it.data.summary}
                    {scopeBy === 'client' && it.data.deal_id && (
                      <Link to={`/crm/deals/${it.data.deal_id}`} className="text-accent hover:underline ml-2 text-xs">открыть</Link>
                    )}
                  </div>
                </div>
              )}
              {it.type === 'order' && (
                <div className="text-sm">
                  <div className="text-xs text-text-muted">
                    Заказ · {profilesById[it.data.changed_by]?.display_name || '—'} · {formatDateTime(it.data.created_at)}
                  </div>
                  <div>
                    {it.data.order ? (
                      <Link to={`/orders/${it.data.order_id}`} className="text-accent hover:underline">№ {formatOrderNumber(it.data.order)}</Link>
                    ) : 'Заказ'}
                    {': '}
                    {it.data.from_status ? `${getStatusMeta(it.data.from_status)?.label || it.data.from_status} → ` : 'создан, '}
                    {getStatusMeta(it.data.to_status)?.label || it.data.to_status}
                    {it.data.note && <span className="text-text-muted"> — {it.data.note}</span>}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        title={confirmDelete?.type === 'note' ? 'Удалить заметку?' : 'Удалить задачу?'}
        message="Действие нельзя отменить."
        confirmText="Удалить"
      />
    </section>
  )
}
