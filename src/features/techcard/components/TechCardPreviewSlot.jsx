import { useRef, useState } from 'react'
import {
  uploadAttachment, deleteAttachment, getAttachmentUrl,
  findPreviewAttachment, validatePreviewFile,
} from '@/features/orders/lib/order-attachments'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import Spinner from '@/shared/components/Spinner'

/**
 * Плашка «Превью макета» на странице заказа.
 * Drag-and-drop / клик-загрузка изображения в attachments заказа.
 * Файл попадает в общие attachments → автоматически рендерится на тех-карте.
 */
export function TechCardPreviewSlot({ order, onUpdated }) {
  const { profile } = useAuth()
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const canEdit = profile?.role === 'admin' || profile?.role === 'manager'
  const previewAttachment = findPreviewAttachment(order?.attachments)
  const previewUrl = previewAttachment ? getAttachmentUrl(previewAttachment.file_path) : null

  async function handleFile(file) {
    if (!file || !order) return
    const err = validatePreviewFile(file)
    if (err) { toast.error(err); return }
    setUploading(true)
    try {
      if (previewAttachment) {
        try { await deleteAttachment(previewAttachment) } catch { /* не блокируем */ }
      }
      await uploadAttachment(order.id, file, profile?.id, { pathPrefix: 'tech-preview' })
      toast.success('Превью добавлено')
      onUpdated?.()
    } catch (e) {
      toast.error(translateError(e).message)
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(e) {
    e?.stopPropagation?.()
    if (!previewAttachment) return
    setUploading(true)
    try {
      await deleteAttachment(previewAttachment)
      toast.success('Превью удалено')
      onUpdated?.()
    } catch (e2) {
      toast.error(translateError(e2).message)
    } finally {
      setUploading(false)
    }
  }

  function onDrop(e) {
    e.preventDefault()
    setDragOver(false)
    if (!canEdit || uploading) return
    handleFile(e.dataTransfer?.files?.[0])
  }
  function onDragOver(e) {
    if (!canEdit) return
    e.preventDefault()
    setDragOver(true)
  }
  function onDragLeave() { setDragOver(false) }
  function onPick(e) {
    handleFile(e.target.files?.[0])
    e.target.value = ''
  }
  function onClick() {
    if (!canEdit || uploading || previewUrl) return
    fileInputRef.current?.click()
  }

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-card p-4">
      <p className="text-xs text-text-muted uppercase mb-2">Превью макета</p>
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={onClick}
        className={`relative rounded-xl flex items-center justify-center transition-all overflow-hidden ${
          previewUrl
            ? 'bg-surface-dim border border-border'
            : `border-2 border-dashed ${dragOver ? 'border-info bg-info/5' : 'border-border bg-surface-dim'} ${canEdit && !uploading ? 'cursor-pointer hover:border-info/60' : ''}`
        }`}
        style={{ minHeight: 240, maxHeight: 420 }}
      >
        {uploading ? (
          <Spinner />
        ) : previewUrl ? (
          <>
            <img
              src={previewUrl}
              alt="Макет"
              loading="lazy"
              className="w-full max-h-[400px] object-contain"
            />
            {canEdit && (
              <div className="absolute top-2 right-2 flex gap-2">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-surface/95 border border-border hover:bg-surface shadow-sm"
                >
                  Заменить
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="text-xs px-3 py-1.5 rounded-lg bg-surface/95 border border-danger/40 text-danger hover:bg-danger/10 shadow-sm"
                >
                  × Удалить
                </button>
              </div>
            )}
          </>
        ) : canEdit ? (
          <div className="flex flex-col items-center justify-center text-text-muted p-8 text-center">
            <div className="text-3xl mb-2">📎</div>
            <div className="text-sm font-medium">Перетащите файл сюда</div>
            <div className="text-xs mt-1">или кликните для выбора</div>
            <div className="text-xs mt-3 opacity-70">JPG / PNG / WEBP · до 2 МБ</div>
            <div className="text-xs mt-1 opacity-60">Появится в тех-карте автоматически</div>
          </div>
        ) : (
          <div className="text-text-muted text-sm">Нет макета</div>
        )}
      </div>
      {canEdit && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onPick}
          className="sr-only"
        />
      )}
      {order?.mockup_path && (
        <a
          href={order.mockup_path}
          target="_blank"
          rel="noopener noreferrer"
          className="block mt-2 text-xs text-text-muted hover:text-accent underline decoration-text-muted/40 break-all"
        >
          Ссылка на оригинал: {order.mockup_path}
        </a>
      )}
    </div>
  )
}
