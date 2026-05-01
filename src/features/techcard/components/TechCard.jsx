import { forwardRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { formatOrderType } from '../utils'
import { formatDate, formatPrice } from '@/shared/lib/utils'

/**
 * A4 Tech Card for print — 595×842px at 72dpi.
 * Rendered in a fixed container, captured by html2canvas or printed via CSS @media print.
 */
export const TechCard = forwardRef(function TechCard({ order }, ref) {
  if (!order) return null

  const is3D = order.order_type === 'sticker3D' || order.order_type === 'stickerpack3D'

  return (
    <div
      ref={ref}
      className="bg-white text-black"
      style={{ width: 595, minHeight: 842, fontFamily: 'Inter, sans-serif', fontSize: 11, padding: 32 }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, borderBottom: '2px solid #1a1a2e', paddingBottom: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', letterSpacing: -0.5 }}>KONTORA24</div>
          <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>Стикерное производство</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>ТЕХ КАРТА</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#e94560' }}>#{order.number}</div>
        </div>
      </div>

      {/* Order info grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <Field label="Тип продукции" value={formatOrderType(order.order_type)} />
        <Field label="Статус" value={order.status?.toUpperCase()} />
        <Field label="Размер" value={`${order.width_mm} × ${order.height_mm} мм`} />
        <Field label="Тираж" value={`${order.qty} шт`} />
        <Field label="Кол-во видов" value={order.design_variants || 1} />
        <Field label="Ламинация" value={order.need_lam ? (order.lam_type || 'Да') : 'Нет'} />
        {order.deadline && <Field label="Дедлайн" value={formatDate(order.deadline)} />}
        <Field label="Дата создания" value={formatDate(order.created_at)} />
      </div>

      {/* Client */}
      {order.client && (
        <div style={{ marginBottom: 20, padding: 12, backgroundColor: '#f8f9fa', borderRadius: 6 }}>
          <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Клиент</div>
          <div style={{ fontWeight: 600 }}>{order.client.name}</div>
          {order.client.phone && <div style={{ color: '#6b7280' }}>{order.client.phone}</div>}
        </div>
      )}

      {/* Production params */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#1a1a2e', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb', paddingBottom: 4 }}>
          Производственные данные
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <Field label="Материалы" value={formatPrice(order.cost_materials)} />
          <Field label="Труд" value={formatPrice(order.cost_labor)} />
          <Field label="Себестоимость" value={formatPrice(order.cost_total)} />
          <Field label="Наценка" value={`×${order.markup || '—'}`} />
          <Field label="Скидка" value={order.discount_pct ? `${(order.discount_pct * 100).toFixed(0)}%` : '—'} />
          <Field label="Срок" value={`${order.prod_days || '—'} дн.`} />
        </div>
      </div>

      {/* Price block */}
      <div style={{ padding: 16, backgroundColor: '#1a1a2e', color: 'white', borderRadius: 8, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10, opacity: 0.7 }}>ИТОГО</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{formatPrice(order.price_final)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, opacity: 0.7 }}>ЗА ШТУКУ</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{formatPrice(order.price_per_unit)}</div>
          </div>
        </div>
      </div>

      {/* Layout preview */}
      <LayoutPreviewOnCard order={order} />

      {/* Notes */}
      {order.notes && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 4, fontWeight: 600 }}>ЗАМЕТКИ</div>
          <div style={{ whiteSpace: 'pre-wrap', color: '#374151' }}>{order.notes}</div>
        </div>
      )}

      {/* Production checklist */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#1a1a2e', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb', paddingBottom: 4 }}>
          Чек-лист
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {[
            'Дизайн подготовлен',
            'Макет утверждён',
            'Плёнка нарезана',
            'Печать выполнена',
            order.need_lam ? 'Ламинация выполнена' : null,
            'Резка выполнена',
            is3D ? 'Смола залита' : null,
            is3D ? 'Смола высохла' : null,
            'Сборка завершена',
            'Контроль качества',
          ].filter(Boolean).map((item) => (
            <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 12, border: '1.5px solid #d1d5db', borderRadius: 2 }} />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer with QR code */}
      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ color: '#9ca3af', fontSize: 9 }}>
          <div>Kontora24 · Тех карта #{order.number}</div>
          <div style={{ marginTop: 2 }}>{new Date().toLocaleDateString('ru-RU')}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <QRCodeSVG
            value={`https://kontora24.vercel.app/orders/${order.id}`}
            size={80}
            level="M"
            bgColor="#ffffff"
            fgColor="#1a1a2e"
          />
          <div style={{ fontSize: 8, color: '#9ca3af', marginTop: 4 }}>Сканируйте для просмотра</div>
        </div>
      </div>
    </div>
  )
})

function LayoutPreviewOnCard({ order }) {
  const printWidth = 300
  const gap = 2
  const scale = printWidth / 1230
  const itemW = Math.round(order.width_mm * scale)
  const itemH = Math.round(order.height_mm * scale)
  const itemsPerRow = Math.floor(printWidth / (itemW + gap))
  const rows = Math.min(Math.ceil(order.qty / Math.max(itemsPerRow, 1)), 5)

  if (itemW < 3 || itemH < 3) return null

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#1a1a2e', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb', paddingBottom: 4 }}>
        Раскладка на листе
      </div>
      <div style={{ width: printWidth, background: '#f0f0f0', padding: 4, borderRadius: 4 }}>
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} style={{ display: 'flex', gap, marginBottom: gap }}>
            {Array.from({ length: itemsPerRow }).map((_, col) => (
              <div key={col} style={{ width: itemW, height: itemH, background: '#e94560', borderRadius: 2, opacity: 0.7 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontWeight: 600, marginTop: 1 }}>{value}</div>
    </div>
  )
}
