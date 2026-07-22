import { forwardRef, useRef, useImperativeHandle } from 'react'
import proofTemplate from '@/assets/sample-proof-template.png'
import { formatOrderNumberShort } from '@/shared/lib/utils'
import { ORDER_TYPES, FILM_TYPES } from '@/shared/constants'

// A5 148×210 мм. Канва в px с сохранением пропорции (419 × 593).
const W = 419
const H = 593

/**
 * R22.3 (ТЗ 20.07 Фаза 3) — «Образец» (цветопроба) A5.
 *
 * Неизменные элементы (рамка, плашка номера, легенда «Надсечка/Сквозной рез»,
 * подписи, лого-глаза) берутся из шаблона-подложки sample-proof-template.png,
 * присланного менеджером. Динамика накладывается поверх по калиброванным
 * позициям (сверено с эталоном менеджера):
 *   • номер заказа — в плашке сверху
 *   • плашка даты (ДД/ММ/ГГ) — тёмная, под номером слева
 *   • тип / материал / размер — справа от подписей внизу
 *
 * Шрифт — Akt (когда будут файлы шрифтов, @font-face подхватится автоматически);
 * до этого — жирный системный фолбэк, визуально совпадающий с эталоном.
 */
export const SampleProof = forwardRef(function SampleProof({ order }, ref) {
  const rootRef = useRef(null)
  useImperativeHandle(ref, () => rootRef.current, [])

  const number = order ? formatOrderNumberShort(order) : ''
  const today = new Date()
  const dd = String(today.getDate()).padStart(2, '0')
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const yy = String(today.getFullYear()).slice(-2)
  const dateStr = `${dd}/${mm}/${yy}`

  const typeLabel = ORDER_TYPES[order?.order_type]?.label || order?.order_type || '—'
  const materialLabel = order?.film_material?.name
    || FILM_TYPES[order?.film_type]?.label || order?.film_type || '—'
  const sizeLabel = order?.width_mm && order?.height_mm
    ? `${order.width_mm}×${order.height_mm} мм` : '—'

  const aktStack = "'Akt', Arial, sans-serif"

  return (
    <div
      ref={rootRef}
      style={{
        position: 'relative',
        width: `${W}px`,
        height: `${H}px`,
        background: `url(${proofTemplate}) center / 100% 100% no-repeat`,
        fontFamily: aktStack,
      }}
    >
      {/* Номер заказа */}
      <div style={{
        position: 'absolute', top: '3.2%', left: 0, right: 0,
        textAlign: 'center', fontWeight: 800, fontSize: '30px',
        color: '#000', letterSpacing: '-1px', fontFamily: aktStack,
      }}>
        #{number}
      </div>

      {/* Плашка даты */}
      <div style={{
        position: 'absolute', top: '11.4%', left: '13.2%',
        width: '24%', height: '4.1%',
        background: '#4a4a4a', borderRadius: '99px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: '11px', letterSpacing: '0.5px' }}>
          {dateStr}
        </span>
      </div>

      {/* Тип / материал / размер */}
      <div style={{
        position: 'absolute', left: '35%', top: '87.4%',
        lineHeight: 1.7, fontSize: '9px', color: '#9a9a9a', fontFamily: aktStack,
      }}>
        {typeLabel}<br />
        {materialLabel}<br />
        {sizeLabel}
      </div>
    </div>
  )
})
