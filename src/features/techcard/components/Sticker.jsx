import { forwardRef } from 'react'
import kontoraLogo from '@/assets/kontora-logo.png'
import { formatOrderNumberShort } from '@/shared/lib/utils'

// 120×75 мм. 1 мм = 2.833 px при 72dpi → 340×213 px.
const MM = 2.833
const STICKER_W = 120 * MM // 340 px
const STICKER_H = 75 * MM  // 213 px

const SIDE_PAD = 2 * MM
const TOP_PAD = 2 * MM
const LOGO_H = 14 * MM            // высота логотипа (ширина — auto)
const NUMBER_GAP_TOP = 4 * MM
const RIGHT_COL_WIDTH = 48 * MM   // фиксированная ширина правого столбца ~48мм

// Авто-fit размера шрифта номера по длине строки, чтобы вписался в 70мм ширины.
function getNumberFontSize(text) {
  const len = (text || '').length
  if (len <= 4) return 60   // ORD-0001 → крупно
  if (len <= 6) return 46   // 6 цифр
  if (len <= 8) return 36   // «Тест-01» = 7 символов
  if (len <= 12) return 28
  return 22
}

/**
 * Универсальная наклейка 120×75 мм.
 *  - 'delivery'  (на выдачу): логотип сверху + правый столбец Производитель/Заказчик/Тираж
 *  - 'production' (на бокс):  БЕЗ логотипа + правый столбец Срок сдачи/Заказчик/Тираж
 *
 * Шрифт номера — Modulord, авто-fit размера по длине.
 * Правый столбец — Guidy, фиксированная ширина 48мм (чтобы не выдавливался номером).
 * Нижнее подчёркивание — 120мм у самого низа стикера.
 */
export const Sticker = forwardRef(function Sticker({ order, type = 'production' }, ref) {
  if (!order) return null

  const isDelivery = type === 'delivery'
  const clientName = order.client?.name || '—'
  const number = formatOrderNumberShort(order)
  const deadline = order.deadline ? new Date(order.deadline).toLocaleDateString('ru-RU') : '—'
  const fontSize = getNumberFontSize(number)

  const rightCol = isDelivery
    ? [
        { label: 'Производитель', value: 'KONTORA.SU' },
        { label: 'Заказчик', value: clientName },
        { label: 'Тираж', value: `${order.qty || 0}` },
      ]
    : [
        { label: 'Срок сдачи', value: deadline },
        { label: 'Заказчик', value: clientName },
        { label: 'Тираж', value: `${order.qty || 0}` },
      ]

  return (
    <div
      ref={ref}
      style={{
        width: STICKER_W,
        height: STICKER_H,
        backgroundColor: '#ffffff',
        fontFamily: "'Guidy', 'Inter', sans-serif",
        padding: `${TOP_PAD}px ${SIDE_PAD}px`,
        position: 'relative',
        overflow: 'hidden',
        boxSizing: 'border-box',
        color: '#000000',
      }}
    >
      {/* Логотип — только для «На выдачу» */}
      {isDelivery && (
        <img
          src={kontoraLogo}
          alt="Контора"
          style={{
            height: LOGO_H,
            width: 'auto',         // aspect ratio сохраняется
            display: 'block',
          }}
          crossOrigin="anonymous"
        />
      )}

      {/* Номер слева + правый столбец справа.
          Position absolute даёт точный контроль — flex иногда выдавливает столбец. */}
      <div style={{
        position: 'absolute',
        left: SIDE_PAD,
        top: isDelivery ? TOP_PAD + LOGO_H + NUMBER_GAP_TOP : TOP_PAD + 2 * MM,
        right: SIDE_PAD,
        bottom: 6 * MM, // отступ от подчёркивания
        display: 'flex',
        alignItems: 'flex-start',
        gap: 2 * MM,
      }}>
        {/* Номер заказа — занимает оставшееся пространство слева от правого столбца */}
        <div style={{
          flex: 1,
          minWidth: 0,
          fontFamily: "'Modulord', 'Onder', sans-serif",
          fontSize: `${fontSize}pt`,
          fontWeight: 700,
          lineHeight: 0.92,
          letterSpacing: 0,
          color: '#000000',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'clip',
        }}>
          {number}
        </div>

        {/* Правый столбец — фиксированная ширина */}
        <div style={{
          width: RIGHT_COL_WIDTH,
          flexShrink: 0,
          fontFamily: "'Guidy', 'Inter', sans-serif",
          fontSize: '10pt',
          lineHeight: 1.15,
          paddingTop: 1 * MM,
        }}>
          {rightCol.map((row) => (
            <div key={row.label} style={{ marginBottom: 1.5 * MM }}>
              <div style={{
                fontWeight: 700,
                textTransform: 'uppercase',
                fontSize: '8pt',
                letterSpacing: 0.3,
                color: '#000000',
              }}>
                {row.label}
              </div>
              <div style={{ fontSize: '10pt' }}>{row.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Подчёркивание 120 мм у нижнего края */}
      <div style={{
        position: 'absolute',
        left: 0,
        bottom: 3 * MM,
        width: 120 * MM,
        height: 1.5,
        backgroundColor: '#000000',
      }} />
    </div>
  )
})
