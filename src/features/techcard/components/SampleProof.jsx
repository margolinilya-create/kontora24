import { forwardRef, useRef, useImperativeHandle } from 'react'
import logoWhite from '@/assets/kontora-logo-white.png'
import logoDark from '@/assets/kontora-logo.png'
import { formatOrderNumberShort } from '@/shared/lib/utils'
import { findPreviewAttachment, getAttachmentUrl } from '@/features/orders/lib/order-attachments'
import { ORDER_TYPES, FILM_TYPES } from '@/shared/constants'

// A4 210×297 мм. CSS-холст 826×1169 px; при экспорте scale≈3 → ~2480×3508
// (300 DPI, ≈8.7 Mpx). НЕ ставить pixelWidth 2480 + scale 3 (даст 78 Mpx → OOM
// на телефонах). См. PrintPreviewModal CONFIG.sample.
const W = 826
const H = 1169

const LABEL_COLOR = '#8a8a8a'
const VALUE_COLOR = '#3a3a3a'

/**
 * R23.2 (ТЗ 23.07 Фаза 3) — «Образец» (цветопроба) A4, программная вёрстка.
 *
 * Всё строится DOM'ом (без PNG-шаблона): рамка, капсула номера, тёмная капсула
 * даты+лого, центральное превью изделия, нижняя карточка с легендой
 * (Надсечка/Сквозной рез — статичные иконки, геометрии реза в БД нет),
 * инфо-таблицей (7 полей) и фирменной иконкой. Все данные — из карточки заказа.
 */
export const SampleProof = forwardRef(function SampleProof({ order }, ref) {
  const rootRef = useRef(null)
  useImperativeHandle(ref, () => rootRef.current, [])

  const number = order ? formatOrderNumberShort(order) : ''

  const created = order?.created_at ? new Date(order.created_at) : null
  const fmtDate = (d) => d
    ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`
    : '—'
  const dateStr = fmtDate(created)

  const typeLabel = ORDER_TYPES[order?.order_type]?.label || order?.order_type || '—'
  const materialLabel = order?.film_material?.name
    || FILM_TYPES[order?.film_type]?.label || order?.film_type || '—'
  const sizeLabel = order?.width_mm && order?.height_mm
    ? `${order.width_mm}×${order.height_mm} мм` : '—'
  const qtyLabel = order?.qty ? `${order.qty} шт` : '—'
  const clientLabel = order?.client?.name || '—'
  const createdLabel = created ? created.toLocaleDateString('ru-RU') : '—'
  const assigneeLabel = order?.assignee?.display_name || '—'

  const previewAtt = findPreviewAttachment(order?.attachments)
  const previewUrl = previewAtt ? getAttachmentUrl(previewAtt.file_path) : null

  const rows = [
    ['Тип изделия', typeLabel],
    ['Материал', materialLabel],
    ['Размер изделия', sizeLabel],
    ['Количество', qtyLabel],
    ['Заказчик', clientLabel],
    ['Дата создания', createdLabel],
    ['Исполнитель', assigneeLabel],
  ]

  const font = "'Akt', 'Helvetica Neue', Arial, sans-serif"

  return (
    <div
      ref={rootRef}
      style={{
        position: 'relative',
        width: `${W}px`, height: `${H}px`,
        background: '#fff',
        border: '2px solid #000',
        borderRadius: '14px',
        boxSizing: 'border-box',
        fontFamily: font,
        display: 'flex', flexDirection: 'column',
        padding: '46px 46px 40px',
        overflow: 'hidden',
      }}
    >
      {/* Верхняя зона: капсула номера + перекрывающая капсула даты/лого */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{
          width: '62%', height: '62px',
          background: '#ECECEC', borderRadius: '31px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: '40px', fontWeight: 800, color: '#000', letterSpacing: '-1px' }}>
            #{number}
          </span>
        </div>
        {/* Тёмная капсула: дата + лого, перекрывает низ капсулы номера */}
        <div style={{
          marginTop: '-16px',
          background: '#5C5C5C', borderRadius: '22px',
          height: '44px', padding: '0 16px',
          display: 'flex', alignItems: 'center', gap: '14px',
        }}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: '19px', letterSpacing: '0.5px' }}>
            {dateStr}
          </span>
          <img src={logoWhite} alt="" crossOrigin="anonymous" style={{ height: '28px', width: 'auto', display: 'block' }} />
        </div>
      </div>

      {/* Центральная зона: превью изделия */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
        {previewUrl ? (
          <img
            src={previewUrl}
            alt=""
            crossOrigin="anonymous"
            style={{ maxWidth: '80%', maxHeight: '100%', objectFit: 'contain' }}
          />
        ) : (
          <div style={{ color: '#c4c4c4', fontSize: '18px' }}>Нет изображения изделия</div>
        )}
      </div>

      {/* Нижняя карточка */}
      <div style={{ background: '#ECECEC', borderRadius: '18px', padding: '24px 28px' }}>
        {/* Легенда */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '36px', marginBottom: '18px' }}>
          <Legend color="#5566D6" label="НАДСЕЧКА" notch />
          <Legend color="#63B32F" label="СКВОЗНОЙ РЕЗ" />
        </div>

        {/* Таблица + иконка */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '20px' }}>
          <table style={{ borderCollapse: 'collapse' }}>
            <tbody>
              {rows.map(([label, value]) => (
                <tr key={label}>
                  <td style={{ color: LABEL_COLOR, fontSize: '15px', fontWeight: 700, padding: '2px 18px 2px 0', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                    {label}:
                  </td>
                  <td style={{ color: VALUE_COLOR, fontSize: '15px', padding: '2px 0' }}>
                    {value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <img src={logoDark} alt="" crossOrigin="anonymous" style={{ height: '68px', width: 'auto', display: 'block', flexShrink: 0 }} />
        </div>
      </div>
    </div>
  )
})

// Статичная иконка легенды: скруглённый контур изделия. Надсечка — с диагональю
// «надреза» внутри; сквозной рез — только контур.
function Legend({ color, label, notch }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <svg width="58" height="34" viewBox="0 0 58 34" fill="none" aria-hidden="true">
        <rect x="2" y="2" width="54" height="30" rx="15" stroke={color} strokeWidth="2.5" fill="none" />
        {notch && <line x1="40" y1="6" x2="52" y2="18" stroke={color} strokeWidth="2.5" />}
      </svg>
      <span style={{ fontSize: '18px', fontWeight: 800, color: '#111' }}>{label}</span>
    </div>
  )
}
