import { forwardRef, useRef, useImperativeHandle } from 'react'
import sampleLogo from '@/assets/sample-logo-white.png'
import iconNadsechka from '@/assets/sample-nadsechka.png'
import iconSkvoznoy from '@/assets/sample-skvoznoy.png'
import iconGlaza from '@/assets/sample-glaza.png'
import { formatOrderNumberShort } from '@/shared/lib/utils'
import { findPreviewAttachment, getAttachmentUrl } from '@/features/orders/lib/order-attachments'
import { ORDER_TYPES, FILM_TYPES } from '@/shared/constants'

// R23.7 (детальный спек 24.07) — производственная цветопроба A5 Portrait.
// Спек задаёт холст 1748×2480 px (300 DPI, 148×210 мм). Рендерим DOM в
// половинном масштабе (874×1240 CSS) и экспортируем со scale 2 → ровно
// 1748×2480 (≈4.3 Mpx, безопасно на телефонах). Все размеры из спека — ÷2.
// Фирменные иконки (лого/надсечка/сквозной/глаза) — присланные менеджером
// PNG (обработаны: белый фон убран флуд-заливкой, лого перекрашен в белый).
// См. PrintPreviewModal CONFIG.sample.
const W = 874
const H = 1240

const CARD_BG = '#ECECEC'
const DATE_BG = '#5C5C5C'
const LABEL_COLOR = '#000000'
const VALUE_COLOR = '#000000'

/**
 * Программная A5-цветопроба (без PNG-шаблона всей страницы): рамка, капсула
 * номера, перекрывающая тёмная капсула даты+лого, центральное превью изделия,
 * нижняя карточка с легендой реза (Надсечка/Сквозной рез), инфо-таблицей из
 * 7 полей и фирменной иконкой «глаза». Данные из карточки заказа; отсутствующие
 * показываем как «—».
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
    ['Размер', sizeLabel],
    ['Количество', qtyLabel],
    ['Заказчик', clientLabel],
    ['Дата создания', createdLabel],
    ['Исполнитель', assigneeLabel],
  ]

  const font = "'Helvetica Neue', Arial, sans-serif"

  return (
    <div
      ref={rootRef}
      style={{
        position: 'relative',
        width: `${W}px`, height: `${H}px`,
        background: '#fff',
        border: '2px solid #000',
        borderRadius: '15px', // спек 30px ÷2
        boxSizing: 'border-box',
        fontFamily: font,
        display: 'flex', flexDirection: 'column',
        padding: '40px', // безопасная зона 80px ÷2
        overflow: 'hidden',
      }}
    >
      {/* 2. Верхняя зона: капсула номера + перекрывающая капсула даты/лого */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* 2.1 Большая капсула номера — 900×120 ÷2, радиус 60 ÷2 */}
        <div style={{
          width: '450px', height: '60px',
          background: CARD_BG, borderRadius: '30px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: '40px', fontWeight: 700, color: '#000', lineHeight: 1 }}>
            #{number}
          </span>
        </div>
        {/* 2.2 Капсула даты + лого — 650×80 ÷2, радиус 40 ÷2, перекрывает низ */}
        <div style={{
          marginTop: '-16px',
          width: '325px', height: '40px',
          background: DATE_BG, borderRadius: '20px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px',
        }}>
          <span style={{ color: '#fff', fontWeight: 600, fontSize: '19px', lineHeight: 1 }}>
            {dateStr}
          </span>
          <img src={sampleLogo} alt="" style={{ height: '20px', width: 'auto', display: 'block' }} />
        </div>
      </div>

      {/* 3. Центральная зона: превью изделия (75% ширины, 55% высоты) */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, padding: '20px 0' }}>
        {previewUrl ? (
          <img
            src={previewUrl}
            alt=""
            crossOrigin="anonymous"
            style={{ maxWidth: '75%', maxHeight: '100%', objectFit: 'contain' }}
          />
        ) : (
          <div style={{ color: '#c4c4c4', fontSize: '16px' }}>Изображение отсутствует</div>
        )}
      </div>

      {/* 4. Нижняя карточка — #ECECEC, радиус 35 ÷2, поля 40 ÷2 */}
      <div style={{ background: CARD_BG, borderRadius: '17px', padding: '20px' }}>
        {/* 4.2 Легенда типов резки — фирменные иконки менеджера */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px', marginBottom: '16px' }}>
          <Legend src={iconNadsechka} label="НАДСЕЧКА" />
          <Legend src={iconSkvoznoy} label="СКВОЗНОЙ РЕЗ" />
        </div>

        {/* 4.3 таблица (слева) + 4.4 фирменная иконка «глаза» (справа снизу) */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px' }}>
          <table style={{ borderCollapse: 'collapse' }}>
            <tbody>
              {rows.map(([label, value]) => (
                <tr key={label}>
                  <td style={{ color: LABEL_COLOR, fontSize: '13px', fontWeight: 700, padding: '2px 16px 2px 0', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                    {label}
                  </td>
                  <td style={{ color: VALUE_COLOR, fontSize: '13px', fontWeight: 400, padding: '2px 0' }}>
                    {value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <img src={iconGlaza} alt="" style={{ height: '54px', width: 'auto', display: 'block', flexShrink: 0, marginRight: '15px', marginBottom: '15px' }} />
        </div>
      </div>
    </div>
  )
})

// Легенда реза: фирменная иконка (PNG менеджера, фон убран) + подпись.
function Legend({ src, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <img src={src} alt="" style={{ height: '30px', width: 'auto', display: 'block' }} />
      <span style={{ fontSize: '15px', fontWeight: 700, color: '#000' }}>{label}</span>
    </div>
  )
}
