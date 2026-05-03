import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { toast } from '@/shared/stores/toast-store'
import { formatRelative } from '@/shared/lib/utils'
import Button from '@/shared/components/Button'
import Spinner from '@/shared/components/Spinner'
import ConfirmDialog from '@/shared/components/ConfirmDialog'

export function OrderAttachments({ orderId }) {
  const { profile } = useAuth()
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const fetchFiles = useCallback(async () => {
    const { data } = await supabase
      .from('k24_order_attachments')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
    setFiles(data || [])
    setLoading(false)
  }, [orderId])

  useEffect(() => { fetchFiles() }, [fetchFiles])

  const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !profile) return

    if (file.size > MAX_FILE_SIZE) {
      toast.error('Файл слишком большой. Максимум 50 МБ.')
      e.target.value = ''
      return
    }

    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${orderId}/${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('order-files')
        .upload(path, file)
      if (uploadError) throw uploadError

      const { error: dbError } = await supabase.from('k24_order_attachments').insert({
        order_id: orderId,
        file_name: file.name,
        file_path: path,
        file_size: file.size,
        mime_type: file.type,
        uploaded_by: profile.id,
      })
      if (dbError) throw dbError

      toast.success('Файл загружен')
      fetchFiles()
    } catch (err) {
      toast.error('Ошибка загрузки: ' + err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleDelete(attachment) {
    try {
      await supabase.storage.from('order-files').remove([attachment.file_path])
      await supabase.from('k24_order_attachments').delete().eq('id', attachment.id)
      toast.success('Файл удалён')
      fetchFiles()
    } catch (err) {
      toast.error('Ошибка: ' + err.message)
    } finally {
      setDeleteTarget(null)
    }
  }

  // Memoize file URLs to avoid recalculating on each render
  const fileUrls = useMemo(() => {
    const urls = {}
    files.forEach(f => {
      const { data } = supabase.storage.from('order-files').getPublicUrl(f.file_path)
      urls[f.id] = data?.publicUrl
    })
    return urls
  }, [files])

  function formatSize(bytes) {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const isImage = (mime) => mime?.startsWith('image/')

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Файлы ({files.length})</h2>
        <label className="bg-accent hover:bg-accent-hover text-white font-medium rounded-lg px-3 py-1.5 text-sm transition-colors cursor-pointer disabled:opacity-50">
          {uploading ? 'Загрузка...' : '+ Загрузить'}
          <input
            type="file"
            onChange={handleUpload}
            disabled={uploading}
            className="sr-only"
            accept="image/*,.pdf,.ai,.psd,.svg,.eps"
          />
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Spinner size="sm" />
        </div>
      ) : files.length === 0 ? (
        <p className="text-text-muted text-sm text-center py-6">
          Нет файлов. Загрузите макет или дизайн.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {files.map((f) => (
            <div key={f.id} className="border border-border rounded-lg p-3 flex gap-3">
              {/* Preview */}
              {isImage(f.mime_type) ? (
                <a href={fileUrls[f.id]} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                  <img
                    src={fileUrls[f.id]}
                    alt={f.file_name}
                    width={64}
                    height={64}
                    className="w-16 h-16 rounded-lg object-cover border border-border"
                  />
                </a>
              ) : (
                <div className="w-16 h-16 rounded-lg bg-surface-dim flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-text-muted" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <a
                  href={fileUrls[f.id]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-accent hover:underline truncate block"
                >
                  {f.file_name}
                </a>
                <p className="text-xs text-text-muted mt-0.5">
                  {formatSize(f.file_size)} · {formatRelative(f.created_at)}
                </p>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setDeleteTarget(f)}
                  aria-label={`Удалить файл ${f.file_name}`}
                  className="mt-1 !px-2 !py-0.5 !text-xs"
                >
                  Удалить
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => handleDelete(deleteTarget)}
        title="Удалить файл?"
        message={`Файл «${deleteTarget?.file_name}» будет удалён без возможности восстановления.`}
        confirmText="Удалить"
      />
    </div>
  )
}
