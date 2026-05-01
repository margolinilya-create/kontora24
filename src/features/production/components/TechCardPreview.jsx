import { useState, useEffect } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { ORDER_TYPES } from '@/shared/constants'
import Modal from '@/shared/components/Modal'
import Spinner from '@/shared/components/Spinner'

export function TechCardPreview({ orderId, isOpen, onClose }) {
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isOpen || !orderId) return
    setLoading(true)
    supabase.from('orders').select('*').eq('id', orderId).single()
      .then(({ data }) => { setOrder(data); setLoading(false) })
  }, [isOpen, orderId])

  if (!isOpen) return null

  return (
    <Modal isOpen onClose={onClose} title="Тех карта" maxWidth="max-w-lg">
      {loading || !order ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : (
        <div className="space-y-4 text-sm">
          {/* Order info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-text-muted">Заказ</p>
              <p className="font-bold text-lg">#{order.number}</p>
            </div>
            <div>
              <p className="text-text-muted">Тип</p>
              <p className="font-medium">{ORDER_TYPES[order.order_type]?.label}</p>
            </div>
          </div>

          {/* Specs */}
          <div className="bg-surface-dim rounded-lg p-3 grid grid-cols-3 gap-3">
            <div>
              <p className="text-text-muted text-xs">Размер</p>
              <p className="font-medium">{order.width_mm} x {order.height_mm} мм</p>
            </div>
            <div>
              <p className="text-text-muted text-xs">Тираж</p>
              <p className="font-medium">{order.qty} шт</p>
            </div>
            <div>
              <p className="text-text-muted text-xs">Варианты</p>
              <p className="font-medium">{order.design_variants || 1}</p>
            </div>
          </div>

          {/* Material info */}
          <div className="bg-surface-dim rounded-lg p-3 space-y-1">
            <p className="text-text-muted text-xs font-medium mb-1">Материалы</p>
            {order.need_lam && <p>Ламинация: {order.lam_type === 'matte' ? 'матовая' : 'глянцевая'}</p>}
            {(order.order_type === 'sticker3D' || order.order_type === 'stickerpack3D') && <p>Заливка смолой: да</p>}
            {!order.need_lam && order.order_type !== 'sticker3D' && order.order_type !== 'stickerpack3D' && <p>Стандартная обработка</p>}
          </div>

          {/* Layout preview (simplified) */}
          <div>
            <p className="text-text-muted text-xs font-medium mb-2">Раскладка на листе</p>
            {(() => {
              const printWidth = 260
              const gap = 2
              const scale = printWidth / 1230
              const itemW = Math.max(3, Math.round(order.width_mm * scale))
              const itemH = Math.max(3, Math.round(order.height_mm * scale))
              const itemsPerRow = Math.floor(printWidth / (itemW + gap))
              const rows = Math.min(Math.ceil(order.qty / Math.max(itemsPerRow, 1)), 4)

              return (
                <div className="bg-surface-dim rounded-lg p-2" style={{ width: printWidth + 8 }}>
                  {Array.from({ length: rows }).map((_, row) => (
                    <div key={row} style={{ display: 'flex', gap, marginBottom: gap }}>
                      {Array.from({ length: itemsPerRow }).map((_, col) => (
                        <div key={col} style={{ width: itemW, height: itemH, borderRadius: 2 }} className="bg-accent/40" />
                      ))}
                    </div>
                  ))}
                  <p className="text-[10px] text-text-muted mt-1">{itemsPerRow} шт/ряд</p>
                </div>
              )
            })()}
          </div>

          {/* Notes */}
          {order.notes && (
            <div>
              <p className="text-text-muted text-xs font-medium mb-1">Заметки</p>
              <p className="text-sm whitespace-pre-wrap">{order.notes}</p>
            </div>
          )}

          {order.deadline && (
            <p className={`text-sm ${new Date(order.deadline) < new Date() ? 'text-danger font-medium' : 'text-text-muted'}`}>
              Дедлайн: {new Date(order.deadline).toLocaleDateString('ru-RU')}
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
