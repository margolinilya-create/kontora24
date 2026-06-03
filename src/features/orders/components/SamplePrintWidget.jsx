import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { captureError } from '@/shared/lib/sentry'
import { uploadAttachment, deleteAttachment, getAttachmentUrl, validatePreviewFile } from '@/features/orders/lib/order-attachments'
import { updateOrderStatus } from '@/features/orders/hooks/useOrders'
import { getOrderRoute } from '@/shared/constants'
import Button from '@/shared/components/Button'
import Spinner from '@/shared/components/Spinner'
import ConfirmDialog from '@/shared/components/ConfirmDialog'

/**
 * R14.2 (бриф 03.06): на этапе sample_print менеджер не вводит учёт расхода,
 * а загружает фото распечатанного образца. Файлы сохраняются с
 * kind='sample_print' и отображаются во вкладке «Обзор» (SamplePrintGallery).
 *
 * Кнопка «Образец одобрен → следующий этап» переводит заказ на следующий
 * статус маршрута (обычно color_approval).
 */
export function SamplePrintWidget({ order, onAdvanced }) {
  const { profile } = useAuth()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [advancing, setAdvancing] = useState(false)
  const inputRef = useRef(null)

  const fetchFiles = useCallback(async () => {
    if (!order?.id) return
    try {
      const { data, error } = await supabase
        .from('k24_order_attachments')
        .select('*')
        .eq('order_id', order.id)
        .eq('kind', 'sample_print')
        .order('created_at', { ascending: false })
      if (error) throw error
      setFiles(data || [])
    } catch (err) {
      captureError(err, { tags: { source: 'SamplePrintWidget.fetchFiles' }, extra: { orderId: order.id } })
    } finally {
      setLoading(false)
    }
  }, [order.id])

  useEffect(() => { fetchFiles() }, [fetchFiles])

  const handleFile = useCallback(async (file) => {
    if (!file || !profile) return
    const validationError = validatePreviewFile(file)
    if (validationError) {
      toast.error(validationError)
      return
    }
    setUploading(true)
    try {
      await uploadAttachment(order.id, file, profile.id, {
        pathPrefix: 'sample-print',
        kind: 'sample_print',
      })
      toast.success('Фото загружено')
      fetchFiles()
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setUploading(false)
    }
  }, [order.id, profile, fetchFiles])

  async function handleDelete(attachment) {
    try {
      await deleteAttachment(attachment)
      toast.success('Фото удалено')
      fetchFiles()
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setDeleteTarget(null)
    }
  }

  const route = getOrderRoute(order)
  const idx = route.indexOf(order.status)
  const nextStatus = idx >= 0 && idx < route.length - 1 ? route[idx + 1] : null
  const canAdvance = files.length > 0 && !!nextStatus

  async function handleAdvance() {
    if (!canAdvance) return
    setAdvancing(true)
    try {
      await updateOrderStatus(order.id, order.status, nextStatus)
      toast.success('Заказ отправлен на следующий этап')
      onAdvanced?.()
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setAdvancing(false)
    }
  }

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <h2 className="font-semibold text-lg">Печать образца</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Загрузите фото распечатанного образца — оно появится во вкладке «Обзор».
          </p>
        </div>
      </div>

      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          handleFile(e.dataTransfer?.files?.[0])
        }}
        className={`rounded-xl border-2 border-dashed cursor-pointer transition-colors flex flex-col items-center justify-center p-6 text-center ${
          dragOver ? 'border-info bg-info/5' : 'border-border bg-surface-dim hover:border-info/60'
        }`}
        style={{ minHeight: 140 }}
      >
        {uploading ? (
          <Spinner size="sm" />
        ) : (
          <>
            <div className="text-3xl mb-2">📷</div>
            <div className="text-sm font-medium">Перетащите фото сюда</div>
            <div className="text-xs mt-1 text-text-muted">или кликните для выбора</div>
            <div className="text-xs mt-2 opacity-70 text-text-muted">JPG / PNG / WEBP · до 2 МБ</div>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {loading ? (
        <div className="flex justify-center py-4">
          <Spinner size="sm" />
        </div>
      ) : files.length > 0 && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {files.map((f) => (
            <div key={f.id} className="relative group">
              <a href={getAttachmentUrl(f.file_path)} target="_blank" rel="noopener noreferrer">
                <img
                  src={getAttachmentUrl(f.file_path)}
                  alt={f.file_name}
                  className="w-full aspect-square object-cover rounded-lg border border-border"
                  loading="lazy"
                />
              </a>
              <button
                onClick={() => setDeleteTarget(f)}
                aria-label="Удалить фото"
                className="absolute top-1 right-1 px-2 py-0.5 rounded-md bg-surface/95 border border-danger/40 text-danger text-xs opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {canAdvance && (
        <Button
          onClick={handleAdvance}
          disabled={advancing}
          className="mt-4 w-full"
        >
          {advancing ? 'Подождите…' : 'Образец одобрен → следующий этап'}
        </Button>
      )}
      {!canAdvance && files.length === 0 && (
        <p className="text-xs text-text-muted text-center mt-3">
          Загрузите хотя бы одно фото, чтобы перейти дальше.
        </p>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => handleDelete(deleteTarget)}
        title="Удалить фото?"
        message={`«${deleteTarget?.file_name}» будет удалено без возможности восстановления.`}
        confirmText="Удалить"
      />
    </div>
  )
}
