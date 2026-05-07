import { forwardRef } from 'react'
import { formatOrderType } from '../utils'
import { formatDate } from '@/shared/lib/utils'
import { supabase } from '@/shared/lib/supabase'

// A4 at 72dpi: 595×842px. 1mm = 595/210 = 2.833px
const MM = 2.833
const PAGE_W = 595
const PAGE_H = 842
const MARGIN = 5 * MM // 5mm side margins
const HEADER_H = 20 * MM // 57px
const BLOCK1_H = 64 * MM // 181px
const BLOCK2_H = 42 * MM // 119px
const RADIUS = 3 * MM // 8.5px

const DAYS_RU = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']

/**
 * Redesigned A4 Tech Card per TZ spec.
 * Black header bar, 3 blocks, two-column bottom section.
 */
export const TechCard = forwardRef(function TechCard({ order }, ref) {
  if (!order) return null

  const is3D = order.order_type === 'sticker3D' || order.order_type === 'stickerpack3D'
  const deadlineDate = order.deadline ? new Date(order.deadline) : null
  const dayOfWeek = deadlineDate ? DAYS_RU[deadlineDate.getDay()] : ''

  // Get preview image URL from attachments
  const previewAttachment = order.attachments?.find(a => a.mime_type?.startsWith('image/'))
  const previewUrl = previewAttachment
    ? supabase.storage.from('order-files').getPublicUrl(previewAttachment.file_path).data?.publicUrl
    : null

  // Production info cells (9 numbered)
  const prodCells = [
    { n: 1, label: 'Тип', value: formatOrderType(order.order_type) },
    { n: 2, label: 'Размер', value: `${order.width_mm} x ${order.height_mm} мм` },
    { n: 3, label: 'Тираж', value: `${order.qty} шт` },
    { n: 4, label: 'Ламинация', value: order.need_lam ? (order.lam_type || 'Да') : 'Нет' },
    { n: 5, label: '3D', value: is3D ? 'Да' : 'Нет' },
    { n: 6, label: 'БОПП пакет', value: order.bopp_bag ? 'Да' : 'Нет' },
    { n: 7, label: 'Кол-во видов', value: order.design_variants || 1 },
    { n: 8, label: 'Срочность', value: order.prod_days ? `${order.prod_days} дн.` : '—' },
    { n: 9, label: 'Приоритет', value: order.priority || 'Обычный' },
  ]

  // Remaining height for block 3
  const block3H = PAGE_H - HEADER_H - BLOCK1_H - BLOCK2_H - (4 * MM) // gaps

  return (
    <div
      ref={ref}
      className="bg-white text-black"
      style={{ width: PAGE_W, height: PAGE_H, fontFamily: 'Inter, sans-serif', fontSize: 11, position: 'relative', overflow: 'hidden' }}
    >
      {/* Black header bar — 210x20mm */}
      <div style={{
        width: PAGE_W,
        height: HEADER_H,
        backgroundColor: '#000000',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 8 * MM,
        borderRadius: `0 0 ${RADIUS}px ${RADIUS}px`,
      }}>
        <span style={{
          color: '#ffffff',
          fontFamily: "'Oswald', sans-serif",
          fontWeight: 700,
          fontSize: 34,
          letterSpacing: 1,
        }}>
          ORD-{String(order.number).padStart(4, '0')}
        </span>
      </div>

      {/* Block 1 — Main order info (64mm) */}
      <div style={{
        margin: `${MM}px ${MARGIN}px 0`,
        height: BLOCK1_H,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        borderBottom: '1px solid #d1d5db',
        paddingTop: 3 * MM,
        paddingBottom: 2 * MM,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
            <Field label="Клиент" value={order.client?.name || '—'} />
            <Field label="Телефон" value={order.client?.phone || '—'} />
            <Field label="Оформлен" value={formatDate(order.created_at)} />
            <Field label="Менеджер" value={order.creator?.display_name || '—'} />
            <Field label="Тип продукции" value={formatOrderType(order.order_type)} />
            <Field label="Тираж" value={`${order.qty} шт`} />
            <Field label="Размер" value={`${order.width_mm} x ${order.height_mm} мм`} />
            <Field label="Ламинация" value={order.need_lam ? (order.lam_type || 'Да') : 'Нет'} />
          </div>
        </div>
        <div style={{ textAlign: 'right', minWidth: 120, paddingLeft: 12 }}>
          <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Дата сдачи</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#e94560', marginTop: 4 }}>
            {deadlineDate ? deadlineDate.toLocaleDateString('ru-RU') : '—'}
          </div>
          {dayOfWeek && (
            <div style={{ fontSize: 12, color: '#9ca3af', opacity: 0.6, marginTop: 2 }}>
              {dayOfWeek}
            </div>
          )}
        </div>
      </div>

      {/* Block 2 — Production info (42mm), 9 cells */}
      <div style={{
        margin: `0 ${MARGIN}px`,
        height: BLOCK2_H,
        borderBottom: '1px solid #d1d5db',
        paddingTop: 2 * MM,
        paddingBottom: 2 * MM,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {prodCells.map((cell) => (
            <div key={cell.n} style={{
              border: '1px solid #e5e7eb',
              borderRadius: RADIUS,
              padding: '4px 8px',
              ...(cell.label === '3D' && is3D ? { border: '2px solid #e94560' } : {}),
            }}>
              <div style={{ fontSize: 8, color: '#9ca3af', fontWeight: 500 }}>{cell.n}. {cell.label}</div>
              <div style={{ fontWeight: 600, fontSize: 11 }}>{cell.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Block 3 — Preview + Comments (remaining space) */}
      <div style={{
        margin: `0 ${MARGIN}px`,
        minHeight: block3H,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
        paddingTop: 2 * MM,
      }}>
        {/* Left: preview */}
        <div>
          <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>
            Превью макета
          </div>
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Макет"
              style={{ maxWidth: '100%', maxHeight: block3H - 30, objectFit: 'contain', borderRadius: RADIUS, border: '1px solid #e5e7eb' }}
              crossOrigin="anonymous"
            />
          ) : (
            <div style={{ height: 120, backgroundColor: '#f3f4f6', borderRadius: RADIUS, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 11 }}>
              Нет макета
            </div>
          )}
        </div>

        {/* Right: comments */}
        <div>
          <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>
            Производственные комментарии
          </div>
          <div style={{ whiteSpace: 'pre-wrap', color: '#374151', fontSize: 10, lineHeight: 1.5 }}>
            {order.notes || 'Нет комментариев'}
          </div>
        </div>
      </div>
    </div>
  )
})

function Field({ label, value }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 9, color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontWeight: 600, marginTop: 1, fontSize: 12 }}>{value}</div>
    </div>
  )
}
