import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'

const BUCKET = 'order-files'

/**
 * Загрузить файл в attachments заказа.
 * Кидает ошибку для перехвата в UI; на стороне UI оборачиваем в try/catch с translateError.
 *
 * @param {string} orderId
 * @param {File} file
 * @param {string} uploadedBy — profile.id
 * @param {{ pathPrefix?: string, kind?: 'attachment'|'preview'|'sample_print' }} [opts]
 *   pathPrefix позволяет различать назначение в имени файла; `kind` пишет в одноимённую
 *   колонку k24_order_attachments (R14.2 — для сортировки по категориям в UI).
 * @returns {Promise<object>} вставленная строка из k24_order_attachments
 */
export async function uploadAttachment(orderId, file, uploadedBy, opts = {}) {
  const ext = file.name.split('.').pop()
  const prefix = opts.pathPrefix ? `${opts.pathPrefix}-` : ''
  const path = `${orderId}/${prefix}${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file)
  if (uploadError) throw uploadError

  const { data, error: dbError } = await supabase
    .from('k24_order_attachments')
    .insert({
      order_id: orderId,
      file_name: file.name,
      file_path: path,
      file_size: file.size,
      mime_type: file.type,
      uploaded_by: uploadedBy,
      kind: opts.kind || 'attachment',
    })
    .select()
    .single()
  if (dbError) throw dbError

  return data
}

/**
 * Удалить attachment (БД-запись + файл в storage).
 * Если storage-удаление падает — оставляем orphan, но в UI запись исчезает.
 */
export async function deleteAttachment(attachment) {
  const { error: dbError } = await supabase
    .from('k24_order_attachments')
    .delete()
    .eq('id', attachment.id)
  if (dbError) throw dbError

  const { error: storageError } = await supabase.storage.from(BUCKET).remove([attachment.file_path])
  if (storageError) {
    captureError(storageError, {
      tags: { source: 'order-attachments.deleteAttachment.storage' },
      extra: { attachmentId: attachment.id, filePath: attachment.file_path },
    })
  }
}

/**
 * Получить public URL для attachment.file_path.
 */
export function getAttachmentUrl(filePath) {
  if (!filePath) return null
  return supabase.storage.from(BUCKET).getPublicUrl(filePath).data?.publicUrl || null
}

/**
 * Найти превью-изображение тех-карты.
 * R14.6: фильтр по kind='preview' — иначе sample_print фото (kind='sample_print')
 * утекает в тех-карту, если оно было загружено раньше превью.
 * Фолбэк на image без kind — для исторических attachments до R14.2.
 */
export function findPreviewAttachment(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return null
  const images = attachments.filter((a) => a.mime_type?.startsWith('image/'))
  if (images.length === 0) return null
  return (
    images.find((a) => a.kind === 'preview') ||
    images.find((a) => !a.kind || a.kind === 'attachment') ||
    null
  )
}

export const ATTACHMENT_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp']
export const ATTACHMENT_IMAGE_MAX_SIZE = 2 * 1024 * 1024 // 2 MB

/**
 * Валидация лёгкого превью для тех-карты.
 * @returns {string|null} текст ошибки или null если ок
 */
export function validatePreviewFile(file) {
  if (!file) return 'Файл не выбран'
  if (!ATTACHMENT_IMAGE_MIMES.includes(file.type)) {
    return 'Только JPG / PNG / WEBP'
  }
  if (file.size > ATTACHMENT_IMAGE_MAX_SIZE) {
    return 'Размер до 2 МБ'
  }
  return null
}
