import { forwardRef } from 'react'
import kontoraLogo from '@/assets/kontora-logo.png'

// 120×75mm sticker. At 72dpi: 1mm = 2.833px → 340×213px
const MM = 2.833
const STICKER_W = 120 * MM
const STICKER_H = 75 * MM

/**
 * "На выдачу" sticker — 120×75mm
 * Same as ProductionSticker but with "Производитель" instead of "Срок сдачи"
 */
export const DeliverySticker = forwardRef(function DeliverySticker({ order }, ref) {
  if (!order) return null

  const clientName = order.client?.name || '—'

  return (
    <div
      ref={ref}
      style={{
        width: STICKER_W,
        height: STICKER_H,
        backgroundColor: '#ffffff',
        fontFamily: "'Inter', sans-serif",
        padding: `${3 * MM}px ${2 * MM}px`,
        position: 'relative',
        overflow: 'hidden',
        border: '1px solid #e5e7eb',
      }}
    >
      {/* Logo */}
      <img
        src={kontoraLogo}
        alt="Контора"
        style={{ width: 118 * MM, height: 'auto', maxHeight: 18 * MM, objectFit: 'contain', objectPosition: 'left' }}
        crossOrigin="anonymous"
      />

      {/* Main content: number + info */}
      <div style={{ display: 'flex', alignItems: 'flex-start', marginTop: 6.5 * MM, gap: 8 }}>
        {/* Order number — large */}
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 72,
          fontWeight: 400,
          lineHeight: 0.85,
          letterSpacing: 2,
          color: '#000000',
          flexShrink: 0,
        }}>
          {String(order.number).padStart(4, '0')}
        </div>

        {/* Right column */}
        <div style={{ fontSize: 11, lineHeight: 1.3, minWidth: 90, paddingTop: 2 }}>
          <div>
            <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 10 }}>Производитель</span>
            <br />
            <span>kontora.su</span>
          </div>
          <div style={{ marginTop: 6 }}>
            <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 10 }}>Заказчик</span>
            <br />
            <span>{clientName}</span>
          </div>
          <div style={{ marginTop: 6 }}>
            <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 10 }}>Тираж</span>
            <br />
            <span>{order.qty}</span>
          </div>
        </div>
      </div>

      {/* Underline */}
      <div style={{
        position: 'absolute',
        bottom: 4 * MM,
        left: 2 * MM,
        width: 116 * MM,
        height: 2,
        backgroundColor: '#000000',
      }} />
    </div>
  )
})
