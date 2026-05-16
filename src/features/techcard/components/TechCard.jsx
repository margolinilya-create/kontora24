import { forwardRef, memo, useRef, useState } from 'react'
import { formatOrderType } from '../utils'
import { formatOrderNumber } from '@/shared/lib/utils'
import { getFilmMaterialName, IS_3D_TYPE, IS_3D_STICKERPACK } from '@/shared/constants'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import {
  uploadAttachment, deleteAttachment, getAttachmentUrl,
  findPreviewAttachment, validatePreviewFile,
} from '@/features/orders/lib/order-attachments'

// A4 at 72dpi: 595×842 px. 1мм = 2.833 px.
const MM = 2.833
const PAGE_W = 595
const PAGE_H = 842
const MARGIN = 5 * MM
const HEADER_H = 20 * MM
const BLOCK1_H = 64 * MM
const BLOCK2_H = 42 * MM
const RADIUS = 3 * MM

const DAYS_RU = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']

const PRINT_HIDE = 'print-hide'

const TechCardInner = forwardRef(function TechCardInner({ order, editable = false, onUpdated }, ref) {
  const { profile } = useAuth()
  if (!order) return null

  const canEdit = editable && (profile?.role === 'admin' || profile?.role === 'manager')

  const is3D = IS_3D_TYPE(order.order_type)
  const isPack3D = IS_3D_STICKERPACK(order.order_type)
  const deadlineDate = order.deadline ? new Date(order.deadline) : null
  const dayOfWeek = deadlineDate ? DAYS_RU[deadlineDate.getDay()] : ''

  const previewAttachment = findPreviewAttachment(order.attachments)
  const previewUrl = previewAttachment ? getAttachmentUrl(previewAttachment.file_path) : null

  const designVariants = Math.max(1, Math.min(8, Number(order.design_variants) || 1))

  const lamLabel = order.need_lam ? (order.lam_type === 'matte' ? 'Матовая' : order.lam_type === 'glossy' ? 'Глянцевая' : 'Да') : 'Нет'

  // Автоматически уменьшаем размер шрифта если номер длинный
  const numberText = formatOrderNumber(order)
  const numberFontSize = numberText.length <= 8 ? 42
    : numberText.length <= 12 ? 32
    : numberText.length <= 16 ? 26
    : 22

  const block3H = PAGE_H - HEADER_H - BLOCK1_H - BLOCK2_H - (5 * MM)

  return (
    <div
      ref={ref}
      className="bg-white text-black"
      style={{
        width: PAGE_W,
        height: PAGE_H,
        fontFamily: "'Guidy', 'Inter', sans-serif",
        fontSize: 12,
        position: 'relative',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* Header — чёрная заливка 210×20 мм впритык к верху, номер шрифтом Onder */}
      <div style={{
        width: PAGE_W,
        height: HEADER_H,
        backgroundColor: '#000000',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 8 * MM,
        paddingRight: 8 * MM,
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}>
        <span style={{
          color: '#ffffff',
          fontFamily: "'Onder', sans-serif",
          fontWeight: 700,
          fontSize: numberFontSize,
          lineHeight: 1,
          letterSpacing: 1,
          whiteSpace: 'nowrap',
        }}>
          {numberText}
        </span>
      </div>

      {/* BLOCK 1 — основная информация о заказе, 64 мм */}
      <div style={{
        margin: `${2 * MM}px ${MARGIN}px 0`,
        height: BLOCK1_H,
        display: 'grid',
        gridTemplateColumns: '1fr 130px',
        gap: 2 * MM,
        boxSizing: 'border-box',
      }}>
        {/* Левая часть — 3 ряда полей */}
        <div style={{
          border: '1px solid #d1d5db',
          borderRadius: RADIUS,
          padding: `${3 * MM}px ${4 * MM}px`,
          display: 'grid',
          gridTemplateRows: '1fr 1fr 1fr',
          rowGap: 4,
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 3 * MM, minHeight: 0 }}>
            <Field label="Комментарий заказчика" value={order.client_brief || order.notes || '—'} valueFontSize={9} />
            <Field label="Заказчик" value={order.client?.name || '—'} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3 * MM, minHeight: 0 }}>
            <Field label="Тираж" value={`${order.qty || 0} шт`} />
            <Field label="Формат" value={`${order.width_mm || 0}×${order.height_mm || 0} мм`} />
            <Field label="Кол-во видов" value={order.design_variants || 1} />
            <Field label="Вид сдачи" value={formatOrderType(order.order_type)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3 * MM, minHeight: 0 }}>
            {isPack3D ? (
              <>
                <Field label="Плёнка фонов" value={getFilmMaterialName(order.film_type)} />
                <Field label="Плёнка стикеров" value={getFilmMaterialName(order.film_type_stickers || order.film_type)} />
                <Field label="Ламинация" value={lamLabel} />
                <Field label="БОПП пакет" value={order.bopp_bag ? 'Да' : 'Нет'} />
              </>
            ) : (
              <>
                <Field label="Материал" value={getFilmMaterialName(order.film_type)} />
                <Field label="Ламинация" value={lamLabel} />
                <Field label="3D смола" value={is3D ? 'Да' : 'Нет'} />
                <Field label="БОПП пакет" value={order.bopp_bag ? 'Да' : 'Нет'} />
              </>
            )}
          </div>
        </div>

        {/* Правая колонка — Срок сдачи (шрифт Guidy + перенос) */}
        <div style={{
          border: '1px solid #d1d5db',
          borderRadius: RADIUS,
          padding: `${3 * MM}px ${3 * MM}px`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-end',
          textAlign: 'right',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}>
          <div style={{
            fontSize: 10,
            color: '#e94560',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            fontFamily: "'Guidy', 'Inter', sans-serif",
            lineHeight: 1.1,
          }}>
            Срок сдачи
          </div>
          <div style={{
            fontSize: 16,
            fontWeight: 700,
            color: '#e94560',
            marginTop: 4,
            textDecoration: 'underline',
            fontFamily: "'Guidy', 'Inter', sans-serif",
            lineHeight: 1.1,
            wordBreak: 'break-word',
          }}>
            {deadlineDate ? deadlineDate.toLocaleDateString('ru-RU') : '—'}
          </div>
          {dayOfWeek && (
            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3, fontFamily: "'Guidy', 'Inter', sans-serif" }}>
              {dayOfWeek}
            </div>
          )}
        </div>
      </div>

      {/* BLOCK 2 — производственная информация, 42 мм */}
      <div style={{
        margin: `${MM}px ${MARGIN}px 0`,
        height: BLOCK2_H,
        border: '1px solid #d1d5db',
        borderRadius: RADIUS,
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `${30 * MM}px repeat(8, 1fr)`,
          height: isPack3D ? '50%' : '100%',
          borderBottom: isPack3D ? '1px solid #d1d5db' : 'none',
        }}>
          <div style={{
            backgroundColor: '#f3f4f6',
            padding: `${1.5 * MM}px ${2 * MM}px`,
            fontSize: 9,
            fontWeight: 600,
            color: '#374151',
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            borderRight: '1px solid #d1d5db',
            lineHeight: 1.15,
          }}>
            Напечатано<br/>листов стик.
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{
              borderRight: i < 7 ? '1px solid #e5e7eb' : 'none',
              position: 'relative',
              backgroundColor: i < designVariants ? '#ffffff' : '#f9fafb',
            }}>
              <span style={{ position: 'absolute', top: 2, left: 4, fontSize: 7, color: '#9ca3af' }}>
                {i + 1}
              </span>
            </div>
          ))}
        </div>
        {isPack3D && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: `${30 * MM}px 1fr ${30 * MM}px 1fr`,
            height: '50%',
            borderTop: '1px solid #d1d5db',
          }}>
            <div style={{
              backgroundColor: '#f3f4f6',
              padding: `${1.5 * MM}px ${2 * MM}px`,
              fontSize: 9,
              fontWeight: 600,
              color: '#374151',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              borderRight: '1px solid #d1d5db',
              lineHeight: 1.15,
            }}>
              Напечатано<br/>фонов
            </div>
            <div style={{ borderRight: '1px solid #d1d5db' }} />
            <div style={{
              backgroundColor: '#f3f4f6',
              padding: `${1.5 * MM}px ${2 * MM}px`,
              fontSize: 9,
              fontWeight: 600,
              color: '#374151',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              borderRight: '1px solid #d1d5db',
              lineHeight: 1.15,
            }}>
              Выбрано<br/>фонов
            </div>
            <div />
          </div>
        )}
      </div>

      {/* BLOCK 3 — Превью + Производственные комментарии */}
      <div style={{
        margin: `${MM}px ${MARGIN}px 0`,
        height: block3H,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 2 * MM,
        boxSizing: 'border-box',
      }}>
        <PreviewBox
          order={order}
          previewUrl={previewUrl}
          previewAttachment={previewAttachment}
          canEdit={canEdit}
          uploadedBy={profile?.id}
          onUpdated={onUpdated}
        />
        <div style={{
          border: '1px solid #d1d5db',
          borderRadius: RADIUS,
          padding: `${3 * MM}px ${4 * MM}px`,
        }}>
          <div style={{
            fontSize: 9,
            color: '#9ca3af',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}>
            Производственные комментарии
          </div>
        </div>
      </div>
    </div>
  )
})

function Field({ label, value, valueFontSize = 11 }) {
  return (
    <div style={{ minWidth: 0, overflow: 'hidden' }}>
      <div style={{
        fontSize: 8,
        color: '#9ca3af',
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: 0.3,
        lineHeight: 1.1,
      }}>
        {label}
      </div>
      <div style={{
        fontWeight: 600,
        fontSize: valueFontSize,
        marginTop: 2,
        lineHeight: 1.2,
        overflow: 'hidden',
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
        whiteSpace: 'normal',
      }}>
        {value}
      </div>
    </div>
  )
}

/**
 * Плашка «Превью макета» — общий компонент, экспортируется отдельно для
 * использования на странице заказа (TechCardPreviewBox).
 */
export function PreviewBox({ order, previewUrl, previewAttachment, canEdit, uploadedBy, onUpdated, height = null }) {
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  async function handleFile(file) {
    if (!file) return
    const err = validatePreviewFile(file)
    if (err) { toast.error(err); return }
    setUploading(true)
    try {
      if (previewAttachment) {
        try { await deleteAttachment(previewAttachment) } catch { /* не блокируем */ }
      }
      await uploadAttachment(order.id, file, uploadedBy, { pathPrefix: 'tech-preview' })
      toast.success('Превью обновлено')
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
  function onClick() {
    if (!canEdit || uploading) return
    fileInputRef.current?.click()
  }
  function onPick(e) {
    handleFile(e.target.files?.[0])
    e.target.value = ''
  }

  const borderStyle = canEdit && !previewUrl
    ? { border: `2px dashed ${dragOver ? '#0A84FF' : '#d1d5db'}`, borderRadius: RADIUS }
    : { border: '1px solid #d1d5db', borderRadius: RADIUS }

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={onClick}
      style={{
        ...borderStyle,
        padding: `${3 * MM}px ${4 * MM}px`,
        position: 'relative',
        cursor: canEdit ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: dragOver ? 'rgba(10,132,255,0.05)' : 'transparent',
        height: height || 'auto',
        boxSizing: 'border-box',
      }}
    >
      <div style={{
        fontSize: 9,
        color: '#9ca3af',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 2 * MM,
      }}>
        Превью макета
      </div>

      {previewUrl ? (
        <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <img
            src={previewUrl}
            alt="Превью макета"
            crossOrigin="anonymous"
            loading="lazy"
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
          {canEdit && (
            <div className={PRINT_HIDE} style={{
              position: 'absolute',
              top: 4,
              right: 4,
              display: 'flex',
              gap: 4,
            }}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                disabled={uploading}
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  backgroundColor: 'rgba(255,255,255,0.9)',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Заменить
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={uploading}
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  backgroundColor: 'rgba(255,255,255,0.9)',
                  border: '1px solid #ef4444',
                  color: '#ef4444',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                × Удалить
              </button>
            </div>
          )}
        </div>
      ) : canEdit ? (
        <div className={PRINT_HIDE} style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: dragOver ? '#0A84FF' : '#9ca3af',
          textAlign: 'center',
        }}>
          {uploading ? (
            <div style={{ fontSize: 12 }}>Загрузка…</div>
          ) : (
            <>
              <div style={{ fontSize: 24, marginBottom: 4 }}>📎</div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Перетащите файл сюда</div>
              <div style={{ fontSize: 11, marginTop: 2 }}>или кликните</div>
              <div style={{ fontSize: 10, marginTop: 6, opacity: 0.7 }}>JPG / PNG / WEBP · до 2 МБ</div>
            </>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 11 }}>
          Нет макета
        </div>
      )}

      {canEdit && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onPick}
          style={{ display: 'none' }}
        />
      )}
    </div>
  )
}

export const TechCard = memo(TechCardInner)
