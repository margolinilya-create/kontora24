import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'
import { MATERIAL_CATEGORIES, getMaterialCategory, MATERIAL_TYPES } from '@/shared/constants'
import { formatDate } from '@/shared/lib/utils'
import { unarchiveMaterial } from '../hooks/useMaterials'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import Spinner from '@/shared/components/Spinner'
import ErrorState from '@/shared/components/ErrorState'

/**
 * R18.6 (бриф 30.06): отдельная вкладка «Архив» на складе.
 * Показывает позиции с archived_at IS NOT NULL и даёт разархивировать их
 * обратно (право material:archive — admin/manager). Собственный запрос,
 * не смешивается с активным списком.
 */
export function ArchivedMaterialsTab() {
  const canArchive = useCanDo('material:archive')
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [workingId, setWorkingId] = useState(null)

  const fetchArchived = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('k24_materials')
        .select('*')
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false })
      if (err) throw err
      setMaterials(data || [])
    } catch (err) {
      captureError(err, { tags: { source: 'warehouse.ArchivedMaterialsTab' } })
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchArchived() }, [fetchArchived])

  async function handleUnarchive(m) {
    setWorkingId(m.id)
    try {
      await unarchiveMaterial(m.id)
      toast.success('Позиция разархивирована')
      fetchArchived()
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setWorkingId(null)
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>
  if (error) return <ErrorState error={error} onRetry={fetchArchived} />
  if (materials.length === 0) {
    return (
      <div className="bg-surface rounded-2xl border border-border shadow-card p-12 text-center text-text-muted text-sm">
        Архив пуст — здесь появятся позиции, которые вы отправите в архив.
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-text-muted bg-surface-dim/50">
              <th className="px-4 py-2 font-medium">Название</th>
              <th className="px-4 py-2 font-medium">Категория</th>
              <th className="px-4 py-2 font-medium text-right">Остаток</th>
              <th className="px-4 py-2 font-medium">В архиве с</th>
              <th className="px-4 py-2 font-medium w-32"></th>
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => {
              const cat = getMaterialCategory(m)
              const catLabel = (cat && MATERIAL_CATEGORIES[cat]?.label) || '—'
              const unit = MATERIAL_TYPES[m.type]?.unit || m.unit || ''
              return (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-medium text-text-muted">{m.name}</td>
                  <td className="px-4 py-2.5 text-text-muted">{catLabel}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-text-muted">
                    {Number(m.stock_qty).toFixed(1)} <span className="ml-1">{unit}</span>
                  </td>
                  <td className="px-4 py-2.5 text-text-muted">{formatDate(m.archived_at)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {canArchive && (
                      <button
                        onClick={() => handleUnarchive(m)}
                        disabled={workingId === m.id}
                        className="text-xs text-accent hover:text-accent/80 px-2 py-1 rounded hover:bg-surface-dim transition-colors disabled:opacity-50"
                      >
                        {workingId === m.id ? '…' : 'Разархивировать'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
