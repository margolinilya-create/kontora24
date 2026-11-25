import { useState } from 'react'
import Modal from '@/shared/components/Modal'
import Button from '@/shared/components/Button'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { captureError } from '@/shared/lib/sentry'
import { mapHeaders, parseRows, planImport } from '../lib/import-clients'
import { listAllClientsBrief, applyImport } from '../lib/crm-ops'

const ACTION_LABELS = {
  create: 'новый клиент',
  attach: 'к существующему',
  attach_new: 'к новому из файла',
  contact_only: 'контакт без клиента',
  skip: 'пропуск',
}

/**
 * R28.3 — импорт клиентов и контактов из Excel/CSV: файл → предпросмотр с
 * дублями → загрузка. Существующие клиенты не меняются — к ним добавляются контакты.
 */
export function ImportClientsModal({ isOpen, onClose, onDone }) {
  const [plan, setPlan] = useState(null)
  const [unknownHeaders, setUnknownHeaders] = useState(false)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [reading, setReading] = useState(false)

  function reset() {
    setPlan(null)
    setUnknownHeaders(false)
    setProgress(null)
    setResult(null)
  }

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    reset()
    setReading(true)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' })
      const map = mapHeaders(rows[0])
      if (map.company === undefined && map.contact === undefined) {
        setUnknownHeaders(true)
        return
      }
      setPlan(planImport(parseRows(rows.slice(1), map), await listAllClientsBrief()))
    } catch (err) {
      captureError(err, { tags: { source: 'crm.ImportClientsModal.read' } })
      toast.error(translateError(err).message)
    } finally {
      setReading(false)
    }
  }

  async function run() {
    setProgress({ done: 0, total: plan.items.length })
    const res = await applyImport(plan.items, (done, total) => setProgress({ done, total }))
    setResult(res)
    setProgress(null)
    if (res.createdClients || res.createdContacts) onDone?.()
  }

  const close = () => { reset(); onClose() }

  return (
    <Modal isOpen={isOpen} onClose={close} title="Импорт клиентов" maxWidth="max-w-3xl">
      <div className="space-y-4">
        {!plan && !result && (
          <>
            <p className="text-sm text-text-muted">
              Файл Excel или CSV, первая строка — заголовки. Понимаем колонки: Компания, Тип, ИНН, Сайт, Источник,
              Комментарий, Контакт (ФИО), Должность, Телефон, Email, Telegram. Совпадения — по ИНН и точному названию.
            </p>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} disabled={reading} aria-label="Файл для импорта" />
            {reading && <p className="text-sm text-text-muted">Читаю файл…</p>}
            {unknownHeaders && <p className="text-sm text-danger">Не нашли колонки «Компания» или «Контакт» в первой строке.</p>}
          </>
        )}

        {plan && !result && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              {[['Строк', plan.summary.total], ['Новых клиентов', plan.summary.newClients], ['Уже есть в базе', plan.summary.matched], ['Контактов', plan.summary.contacts]].map(([l, v]) => (
                <div key={l} className="rounded-xl bg-surface-2 p-3"><div className="text-text-muted text-xs">{l}</div><b>{v}</b></div>
              ))}
            </div>
            {plan.summary.withErrors > 0 && (
              <p className="text-sm text-warning">В {plan.summary.withErrors} строках есть нераспознанные телефоны/email — они пропустятся, остальное загрузится.</p>
            )}
            <div className="max-h-72 overflow-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead className="bg-surface-2 sticky top-0">
                  <tr><th className="text-left p-2">Стр.</th><th className="text-left p-2">Клиент</th><th className="text-left p-2">Контакт</th><th className="text-left p-2">Действие</th></tr>
                </thead>
                <tbody>
                  {plan.items.slice(0, 300).map((it) => (
                    <tr key={it.line} className="border-t border-border align-top">
                      <td className="p-2 text-text-muted">{it.line}</td>
                      <td className="p-2">{it.company?.name || '—'}</td>
                      <td className="p-2">{it.contact ? [it.contact.last_name, it.contact.first_name].filter(Boolean).join(' ') : '—'}</td>
                      <td className="p-2">
                        {ACTION_LABELS[it.action]}{it.existingName ? ` «${it.existingName}»` : ''}
                        {it.errors.length > 0 && <div className="text-warning">{it.errors.join('; ')}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {progress && <p className="text-sm">Загружаю: {progress.done} из {progress.total}…</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={reset} disabled={!!progress}>Другой файл</Button>
              <Button onClick={run} loading={!!progress}>Загрузить</Button>
            </div>
          </>
        )}

        {result && (
          <div className="space-y-2 text-sm">
            <p>Готово: новых клиентов — <b>{result.createdClients}</b>, контактов — <b>{result.createdContacts}</b>.</p>
            {result.failed.length > 0 && (
              <p className="text-danger">Не загрузились строки: {result.failed.map((f) => `${f.line} (${f.message})`).join('; ')}</p>
            )}
            <div className="flex justify-end"><Button onClick={close}>Закрыть</Button></div>
          </div>
        )}
      </div>
    </Modal>
  )
}
