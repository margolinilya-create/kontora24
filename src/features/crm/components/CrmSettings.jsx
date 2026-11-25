import { useCallback, useEffect, useState } from 'react'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'
import Modal from '@/shared/components/Modal'
import Spinner from '@/shared/components/Spinner'
import ErrorState from '@/shared/components/ErrorState'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { captureError } from '@/shared/lib/sentry'
import { useCrmDirectory } from '../hooks/useCrmData'
import {
  createPipeline, renamePipeline, saveStage, setStageArchived, saveLostReason, setLostReasonArchived, listLostReasons,
} from '../lib/deals-api'

const KIND_LABELS = { open: 'В работе', won: 'Выиграна', lost: 'Проиграна' }
const SELECT_CLS = 'w-full rounded-xl border border-border px-3.5 py-2.5 text-sm bg-surface text-text min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent/60'

async function guarded(fn, okText, source, after) {
  try {
    await fn()
    if (okText) toast.success(okText)
    after?.()
  } catch (err) {
    captureError(err, { tags: { source } })
    toast.error(translateError(err).message)
  }
}

/**
 * R28.1 — «Настройки → CRM»: воронки, этапы, причины проигрыша.
 * Удаления нет — только архив (на этапах/причинах висят сделки).
 */
export function CrmSettings() {
  const canManage = useCanDo('crm:manage')
  const { pipelines, loading, error, refetch } = useCrmDirectory()
  const [pipelineId, setPipelineId] = useState(null)
  const [stageEdit, setStageEdit] = useState(null)
  const [pipelineEdit, setPipelineEdit] = useState(null) // { id|null, name }
  const [reasons, setReasons] = useState([])
  const [reasonEdit, setReasonEdit] = useState(null)

  const loadReasons = useCallback(() => listLostReasons({ includeArchived: true })
    .then(setReasons)
    .catch((err) => {
      captureError(err, { tags: { source: 'crm.CrmSettings.reasons' } })
      toast.error(translateError(err).message)
    }), [])
  useEffect(() => { loadReasons() }, [loadReasons])

  if (loading) return <Spinner />
  if (error) return <ErrorState error={error} onRetry={refetch} hideHomeButton />

  const pipeline = pipelines.find((p) => p.id === pipelineId) || pipelines.find((p) => p.is_default) || pipelines[0]

  async function submitStage(e) {
    e.preventDefault()
    if (!stageEdit.name?.trim()) { toast.error('Укажите название этапа'); return }
    await guarded(() => saveStage(stageEdit), 'Этап сохранён', 'crm.CrmSettings.stage', () => { setStageEdit(null); refetch() })
  }

  async function submitPipeline(e) {
    e.preventDefault()
    if (!pipelineEdit.name?.trim()) { toast.error('Укажите название воронки'); return }
    await guarded(
      async () => {
        if (pipelineEdit.id) await renamePipeline(pipelineEdit.id, pipelineEdit.name)
        else {
          const created = await createPipeline(pipelineEdit.name, pipelines.length + 1)
          setPipelineId(created.id)
        }
      },
      'Воронка сохранена', 'crm.CrmSettings.pipeline', () => { setPipelineEdit(null); refetch() },
    )
  }

  async function submitReason(e) {
    e.preventDefault()
    if (!reasonEdit.name?.trim()) { toast.error('Укажите причину'); return }
    await guarded(() => saveLostReason(reasonEdit), 'Причина сохранена', 'crm.CrmSettings.reason', () => { setReasonEdit(null); loadReasons() })
  }

  return (
    <div className="space-y-8">
      {!canManage && <p className="text-sm text-text-muted">Изменять настройки CRM может пользователь с правом «Удалять и объединять записи CRM».</p>}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold mr-2">Воронки</h2>
          {pipelines.map((p) => (
            <button
              key={p.id}
              onClick={() => setPipelineId(p.id)}
              aria-pressed={pipeline?.id === p.id}
              className={`px-3 py-1.5 min-h-[36px] rounded-full text-sm border ${pipeline?.id === p.id ? 'border-accent bg-accent/10' : 'border-border text-text-muted'}`}
            >
              {p.name}
            </button>
          ))}
          {canManage && <Button size="sm" variant="ghost" onClick={() => setPipelineEdit({ id: null, name: '' })}>+ Воронка</Button>}
          {canManage && pipeline && <Button size="sm" variant="ghost" onClick={() => setPipelineEdit({ id: pipeline.id, name: pipeline.name })}>Переименовать</Button>}
        </div>

        {pipeline && (
          <ul className="bg-surface rounded-xl border border-border divide-y divide-border">
            {pipeline.stages.map((s) => (
              <li key={s.id} className={`px-4 py-3 flex flex-wrap items-center gap-3 ${s.archived_at ? 'opacity-50' : ''}`}>
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} aria-hidden="true" />
                <span className="font-medium flex-1 min-w-[140px]">{s.name}</span>
                <span className="text-xs text-text-muted">{KIND_LABELS[s.kind]} · {s.probability}%{s.rot_days ? ` · залежалась через ${s.rot_days} дн.` : ''}</span>
                {canManage && (
                  <span className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setStageEdit({ ...s })}>Изменить</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => guarded(() => setStageArchived(s.id, !s.archived_at), s.archived_at ? 'Этап возвращён' : 'Этап в архиве', 'crm.CrmSettings.archiveStage', refetch)}
                    >
                      {s.archived_at ? 'Вернуть' : 'В архив'}
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {canManage && pipeline && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setStageEdit({
              pipeline_id: pipeline.id, name: '', color: '#9CA3AF', kind: 'open', probability: 50, rot_days: 3,
              sort: Math.max(0, ...pipeline.stages.filter((s) => s.kind === 'open').map((s) => s.sort)) + 1,
            })}
          >
            + Этап
          </Button>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Причины проигрыша</h2>
          {canManage && <Button size="sm" variant="ghost" onClick={() => setReasonEdit({ name: '', sort: reasons.length + 1 })}>+ Причина</Button>}
        </div>
        <ul className="bg-surface rounded-xl border border-border divide-y divide-border">
          {reasons.map((r) => (
            <li key={r.id} className={`px-4 py-2.5 flex items-center gap-3 ${r.archived_at ? 'opacity-50' : ''}`}>
              <span className="flex-1">{r.name}</span>
              {canManage && (
                <span className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setReasonEdit({ ...r })}>Изменить</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => guarded(() => setLostReasonArchived(r.id, !r.archived_at), null, 'crm.CrmSettings.archiveReason', loadReasons)}
                  >
                    {r.archived_at ? 'Вернуть' : 'В архив'}
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <Modal isOpen={!!stageEdit} onClose={() => setStageEdit(null)} title={stageEdit?.id ? 'Этап' : 'Новый этап'}>
        {stageEdit && (
          <form onSubmit={submitStage} className="space-y-3">
            <Input label="Название" value={stageEdit.name} onChange={(e) => setStageEdit({ ...stageEdit, name: e.target.value })} autoFocus />
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="block font-medium mb-1.5">Тип</span>
                <select value={stageEdit.kind} onChange={(e) => setStageEdit({ ...stageEdit, kind: e.target.value })} className={SELECT_CLS}>
                  {Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              <label className="block text-sm">
                <span className="block font-medium mb-1.5">Цвет</span>
                <input type="color" value={stageEdit.color} onChange={(e) => setStageEdit({ ...stageEdit, color: e.target.value })} className="w-full h-[44px] rounded-xl border border-border bg-surface" />
              </label>
              <Input label="Вероятность, %" type="number" min="0" max="100" value={stageEdit.probability} onChange={(e) => setStageEdit({ ...stageEdit, probability: e.target.value })} />
              <Input label="Порядок" type="number" value={stageEdit.sort} onChange={(e) => setStageEdit({ ...stageEdit, sort: e.target.value })} />
            </div>
            {stageEdit.kind === 'open' && (
              <Input
                label="Залежалась через, дней (пусто — без контроля)"
                type="number"
                min="1"
                value={stageEdit.rot_days ?? ''}
                onChange={(e) => setStageEdit({ ...stageEdit, rot_days: e.target.value })}
              />
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setStageEdit(null)}>Отмена</Button>
              <Button type="submit">Сохранить</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal isOpen={!!pipelineEdit} onClose={() => setPipelineEdit(null)} title={pipelineEdit?.id ? 'Переименовать воронку' : 'Новая воронка'}>
        {pipelineEdit && (
          <form onSubmit={submitPipeline} className="space-y-3">
            <Input label="Название" value={pipelineEdit.name} onChange={(e) => setPipelineEdit({ ...pipelineEdit, name: e.target.value })} autoFocus />
            {!pipelineEdit.id && <p className="text-xs text-text-muted">Создадутся этапы «Новая», «Выиграна», «Проиграна» — остальные добавьте сами.</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setPipelineEdit(null)}>Отмена</Button>
              <Button type="submit">Сохранить</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal isOpen={!!reasonEdit} onClose={() => setReasonEdit(null)} title={reasonEdit?.id ? 'Причина проигрыша' : 'Новая причина'}>
        {reasonEdit && (
          <form onSubmit={submitReason} className="space-y-3">
            <Input label="Причина" value={reasonEdit.name} onChange={(e) => setReasonEdit({ ...reasonEdit, name: e.target.value })} autoFocus />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setReasonEdit(null)}>Отмена</Button>
              <Button type="submit">Сохранить</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
