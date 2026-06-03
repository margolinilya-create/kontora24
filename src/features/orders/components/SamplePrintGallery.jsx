import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'
import { getAttachmentUrl } from '@/features/orders/lib/order-attachments'

/**
 * R14.2: галерея фото образца печати, отображается на вкладке «Обзор».
 * Источник — k24_order_attachments с kind='sample_print'.
 * Если фото нет — компонент возвращает null (не занимает место).
 */
export function SamplePrintGallery({ orderId }) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!orderId) return
    try {
      const { data, error } = await supabase
        .from('k24_order_attachments')
        .select('id, file_name, file_path, mime_type, created_at')
        .eq('order_id', orderId)
        .eq('kind', 'sample_print')
        .order('created_at', { ascending: false })
      if (error) throw error
      setFiles(data || [])
    } catch (err) {
      captureError(err, { tags: { source: 'SamplePrintGallery.fetch' }, extra: { orderId } })
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => { fetch() }, [fetch])

  if (loading || files.length === 0) return null

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-card p-4">
      <h3 className="font-semibold text-sm mb-3">Образец печати ({files.length})</h3>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {files.map((f) => (
          <a key={f.id} href={getAttachmentUrl(f.file_path)} target="_blank" rel="noopener noreferrer">
            <img
              src={getAttachmentUrl(f.file_path)}
              alt={f.file_name}
              loading="lazy"
              className="w-full aspect-square object-cover rounded-lg border border-border hover:border-info/60 transition-colors"
            />
          </a>
        ))}
      </div>
    </div>
  )
}
