import { forwardRef, useEffect, useRef, useState, useImperativeHandle } from 'react'
import sampleLogo from '@/assets/sample-logo-dark.png'
import iconNadsechka from '@/assets/sample-nadsechka.png'
import iconSkvoznoy from '@/assets/sample-skvoznoy.png'
import iconGlaza from '@/assets/sample-glaza.png'
import { formatOrderNumberShort, formatOrderType } from '@/shared/lib/utils'
import { findPreviewAttachment, getAttachmentUrl } from '@/features/orders/lib/order-attachments'
import { FILM_TYPES } from '@/shared/constants'
import {
  fitNumberFontSize,
  SAMPLE_NUMBER_FONT_PX,
  SAMPLE_NUMBER_CAPSULE_MAX_PX,
  SAMPLE_NUMBER_CAPSULE_PAD_PX,
  SAMPLE_NUMBER_TEXT_MAX_PX,
} from '../utils'

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
const FONT_STACK = "'Helvetica Neue', Arial, sans-serif"

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

  // R24 (фидбэк 24.07): верхняя капсула показывает дату ГЕНЕРАЦИИ образца
  // (дата нажатия кнопки «Образец»), а не дату создания заказа. Захватываем
  // «сейчас» один раз при монтировании — переэкспорт не сдвинет дату.
  const [genDate] = useState(() => new Date())
  const created = order?.created_at ? new Date(order.created_at) : null
  const fmtDate = (d) => d
    ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`
    : '—'
  const dateStr = fmtDate(genDate)

  const typeLabel = formatOrderType(order)
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

  const font = FONT_STACK

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
      {/* 2. Верхняя зона: крупная капсула номера + под ней капсула даты и
          вордмарк «Контора» справа (по эталону менеджера). Высота капсулы с
          запасом + lineHeight>1 — номер и дата не обрезаются. */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* 2.1 Капсула номера — текст строго по центру (H+V).
            R27.0 (ТЗ №2): в PDF/печати (html2canvas) текст номера съезжал вниз
            под капсулу даты — метрики шрифта в html2canvas отличаются от
            браузерных. Теперь номер рисуется на <canvas> (2×) и вставляется
            картинкой ровно в высоту капсулы — html2canvas переносит её
            пиксель-в-пиксель. Слои не меняем: дата лежит поверх фона капсулы,
            цифры (52px по центру 96px → 22–74px) выше нахлёста (с 74px).
            Капсула 580–760px (border-box), длинный номер уменьшает кегль. */}
        <div
          data-testid="sample-number-capsule"
          style={{
            minWidth: '580px', maxWidth: `${SAMPLE_NUMBER_CAPSULE_MAX_PX}px`,
            boxSizing: 'border-box',
            height: '96px', padding: `0 ${SAMPLE_NUMBER_CAPSULE_PAD_PX}px`,
            background: CARD_BG, borderRadius: '48px',
            textAlign: 'center', overflow: 'hidden',
          }}
        >
          <CanvasText
            text={`#${number}`}
            fontSize={SAMPLE_NUMBER_FONT_PX}
            fontWeight={700}
            color="#000"
            height={96}
            fitWidth={SAMPLE_NUMBER_TEXT_MAX_PX}
            testId="sample-number-img"
          />
        </div>
        {/* 2.2 Дата (тёмная капсула, текст по центру) + вордмарк «Контора» справа */}
        <div style={{ marginTop: '-22px', display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div
            data-testid="sample-date-capsule"
            style={{
              height: '48px', padding: '0 26px',
              background: DATE_BG, borderRadius: '24px',
              textAlign: 'center',
            }}
          >
            <CanvasText
              text={dateStr}
              fontSize={23}
              fontWeight={600}
              color="#fff"
              height={48}
              testId="sample-date-img"
            />
          </div>
          <img src={sampleLogo} alt="" style={{ height: '58px', width: 'auto', display: 'block' }} />
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

// R27.0: текст капсулы, нарисованный на <canvas> в 2× и вставленный как <img>
// того же CSS-размера (ширина = ширина текста, высота = высота капсулы).
// Вертикальный центр задаёт textBaseline 'middle' на height/2 — положение не
// зависит от line-height/метрик шрифта в html2canvas. Пока шрифты не готовы
// или canvas недоступен (jsdom в unit-тестах) — обычный текст как раньше.
const CANVAS_SCALE = 2

function CanvasText({ text, fontSize, fontWeight, color, height, fitWidth, testId }) {
  const [drawn, setDrawn] = useState(null)

  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts?.ready) return undefined
    let cancelled = false
    const draw = () => {
      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const fontStr = (size) => `${fontWeight} ${size}px ${FONT_STACK}`
        const measure = (t, size) => {
          ctx.font = fontStr(size)
          return ctx.measureText(t).width
        }
        const size = fitWidth ? fitNumberFontSize(text, measure, fitWidth, { base: fontSize }) : fontSize
        const width = Math.ceil(measure(text, size)) + 2
        canvas.width = width * CANVAS_SCALE
        canvas.height = height * CANVAS_SCALE
        ctx.scale(CANVAS_SCALE, CANVAS_SCALE)
        ctx.font = fontStr(size)
        ctx.fillStyle = color
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(text, width / 2, height / 2)
        const src = canvas.toDataURL('image/png')
        if (!cancelled) setDrawn({ src, width, key: text })
      } catch { /* фолбэк — текст */ }
    }
    document.fonts.ready.then(draw).catch(() => {})
    return () => { cancelled = true }
  }, [text, fontSize, fontWeight, color, height, fitWidth])

  if (!drawn || drawn.key !== text) {
    return (
      <span style={{ display: 'block', fontSize: `${fontSize}px`, fontWeight, color, lineHeight: `${height}px`, whiteSpace: 'nowrap' }}>
        {text}
      </span>
    )
  }
  return (
    <img
      src={drawn.src}
      alt={text}
      data-testid={testId}
      style={{ display: 'block', width: `${drawn.width}px`, height: `${height}px`, margin: '0 auto' }}
    />
  )
}

// Легенда реза: фирменная иконка (PNG менеджера, фон убран) + « — подпись».
function Legend({ src, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <img src={src} alt="" style={{ height: '34px', width: 'auto', display: 'block' }} />
      <span style={{ fontSize: '18px', fontWeight: 700, color: '#000', whiteSpace: 'nowrap' }}>— {label}</span>
    </div>
  )
}
