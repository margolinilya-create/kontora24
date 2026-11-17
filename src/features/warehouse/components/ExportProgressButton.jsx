import { useState } from 'react'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { captureError } from '@/shared/lib/sentry'
import { formatQty } from '@/shared/lib/utils'

/**
 * R25.8 (ТЗ 8.7): кнопка «Выгрузить в Excel» с прогрессом «3 000 из 12 400».
 * run(onProgress) — забирает данные и пишет файл; ошибки → toast.
 */
export function ExportProgressButton({ run, disabled, className = '' }) {
  const [progress, setProgress] = useState(null) // { loaded, total } | null

  async function handleClick() {
    setProgress({ loaded: 0, total: null })
    try {
      await run((loaded, total) => setProgress({ loaded, total }))
      toast.success('Файл выгружен')
    } catch (err) {
      if (err?.code !== 'EXPORT_TOO_LARGE') {
        captureError(err, { tags: { source: 'warehouse.export' } })
      }
      toast.error(err?.code === 'EXPORT_TOO_LARGE' ? err.message : translateError(err).message)
    } finally {
      setProgress(null)
    }
  }

  const busy = progress !== null
  const label = !busy
    ? 'Выгрузить в Excel'
    : progress.total
      ? `${formatQty(progress.loaded, 0)} из ${formatQty(progress.total, 0)}`
      : progress.loaded > 0 ? `${formatQty(progress.loaded, 0)}…` : 'Готовим…'

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || busy}
      className={`text-sm px-3 py-2 rounded-lg border border-border bg-surface hover:bg-surface-2 transition-colors disabled:opacity-60 whitespace-nowrap tabular-nums ${className}`}
    >
      {label}
    </button>
  )
}
