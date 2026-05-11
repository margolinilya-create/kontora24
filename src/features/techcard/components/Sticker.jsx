import { forwardRef } from 'react'
import kontoraLogo from '@/assets/kontora-logo.png'
import { formatOrderNumberShort } from '@/shared/lib/utils'

// 120×75 мм. 1 мм = 2.833 px при 72dpi → 340×213 px.
const MM = 2.833
const STICKER_W = 120 * MM
const STICKER_H = 75 * MM

const LOGO_W = 118 * MM
const LOGO_H = 16 * MM
const SIDE_PAD = 1 * MM
const TOP_PAD = 2 * MM
const NUMBER_GAP_TOP = 6.5 * MM    // отступ от логотипа до номера
const NUMBER_FONT_SIZE = 95 // pt — подобрано под высоту 75мм с учётом логотипа сверху

/**
 * Универсальная наклейка 120×75 мм.
 * Структура (по ТЗ):
 *   1. Логотип Kontora (118 мм по ширине, сверху)
 *   2. Номер заказа (Modulord, выровнен по левому краю, отступ 6.5 мм от логотипа)
 *   3. Горизонтальное подчёркивание 120 мм, отступ 3 мм от номера
 *   4. Правый столбец (Guidy 16pt), выровнен по верху номера:
 *      - 'production' (на бокс):  Срок сдачи / Заказчик / Тираж
 *      - 'delivery'   (на выдачу): Производитель: KONTORA.SU / Заказчик / Тираж
 */
export const Sticker = forwardRef(function Sticker({ order, type = 'production' }, ref) {
  if (!order) return null

  const clientName = order.client?.name || '—'
  const number = formatOrderNumberShort(order)
  const deadline = order.deadline ? new Date(order.deadline).toLocaleDateString('ru-RU') : '—'

  const rightCol = type === 'delivery'
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
      {/* Логотип */}
      <img
        src={kontoraLogo}
        alt="Контора"
        style={{
          width: LOGO_W,
          maxHeight: LOGO_H,
          height: 'auto',
          objectFit: 'contain',
          objectPosition: 'left',
          display: 'block',
        }}
        crossOrigin="anonymous"
      />

      {/* Номер + правый столбец */}
      <div style={{
        marginTop: NUMBER_GAP_TOP,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 3 * MM,
      }}>
        <div style={{
          fontFamily: "'Modulord', 'Onder', sans-serif",
          fontSize: `${NUMBER_FONT_SIZE}pt`,
          fontWeight: 700,
          lineHeight: 0.82,
          letterSpacing: 0,
          color: '#000000',
          flexShrink: 0,
        }}>
          {number}
        </div>

        <div style={{
          flex: 1,
          fontFamily: "'Guidy', 'Inter', sans-serif",
          fontSize: '11pt',
          lineHeight: 1.15,
          paddingTop: 1 * MM,
        }}>
          {rightCol.map((row) => (
            <div key={row.label} style={{ marginBottom: 1.5 * MM }}>
              <div style={{
                fontWeight: 700,
                textTransform: 'uppercase',
                fontSize: '9pt',
                letterSpacing: 0.3,
              }}>
                {row.label}
              </div>
              <div style={{ fontSize: '11pt' }}>{row.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Подчёркивание 120 мм, отступ 3 мм от номера */}
      <div style={{
        position: 'absolute',
        left: 0,
        bottom: 4 * MM,
        width: 120 * MM,
        height: 1.5,
        backgroundColor: '#000000',
      }} />
    </div>
  )
})
