import { describe, it, expect } from 'vitest'
import { findPreviewAttachment, validatePreviewFile, ATTACHMENT_IMAGE_MAX_SIZE } from './order-attachments'

describe('findPreviewAttachment (R14.6 kind filter)', () => {
  it('returns null for empty / non-array', () => {
    expect(findPreviewAttachment(null)).toBeNull()
    expect(findPreviewAttachment(undefined)).toBeNull()
    expect(findPreviewAttachment([])).toBeNull()
  })

  it('prefers kind=preview over sample_print', () => {
    const sample = { id: 1, mime_type: 'image/jpeg', kind: 'sample_print' }
    const preview = { id: 2, mime_type: 'image/jpeg', kind: 'preview' }
    // порядок: сначала sample, потом preview — должен выбрать preview
    expect(findPreviewAttachment([sample, preview])).toBe(preview)
    expect(findPreviewAttachment([preview, sample])).toBe(preview)
  })

  it('NEVER returns sample_print, даже если он единственный image', () => {
    const sample = { id: 1, mime_type: 'image/jpeg', kind: 'sample_print' }
    expect(findPreviewAttachment([sample])).toBeNull()
  })

  it('возвращает attachment без kind (legacy до R14.2)', () => {
    const legacy = { id: 1, mime_type: 'image/png' } // kind отсутствует
    expect(findPreviewAttachment([legacy])).toBe(legacy)
  })

  it('возвращает kind=attachment (обычное вложение-картинка)', () => {
    const att = { id: 1, mime_type: 'image/jpeg', kind: 'attachment' }
    expect(findPreviewAttachment([att])).toBe(att)
  })

  it('игнорирует не-image attachments', () => {
    const pdf = { id: 1, mime_type: 'application/pdf', kind: 'attachment' }
    expect(findPreviewAttachment([pdf])).toBeNull()
  })

  it('preview побеждает attachment если оба есть', () => {
    const att = { id: 1, mime_type: 'image/jpeg', kind: 'attachment' }
    const preview = { id: 2, mime_type: 'image/jpeg', kind: 'preview' }
    expect(findPreviewAttachment([att, preview])).toBe(preview)
  })
})

describe('validatePreviewFile', () => {
  it('null/undefined → "Файл не выбран"', () => {
    expect(validatePreviewFile(null)).toBe('Файл не выбран')
  })

  it('PDF → ошибка типа', () => {
    expect(validatePreviewFile({ type: 'application/pdf', size: 1024 })).toMatch(/JPG/)
  })

  it('JPG > 2 МБ → ошибка размера', () => {
    expect(validatePreviewFile({ type: 'image/jpeg', size: ATTACHMENT_IMAGE_MAX_SIZE + 1 })).toMatch(/2 МБ/)
  })

  it('JPG ≤ 2 МБ → null (валидно)', () => {
    expect(validatePreviewFile({ type: 'image/jpeg', size: 100 * 1024 })).toBeNull()
    expect(validatePreviewFile({ type: 'image/png', size: 1024 })).toBeNull()
    expect(validatePreviewFile({ type: 'image/webp', size: 1024 })).toBeNull()
  })
})
