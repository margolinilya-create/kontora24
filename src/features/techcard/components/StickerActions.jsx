import { useRef, useState } from 'react'
import { Sticker } from './Sticker'
import { toast } from '@/shared/stores/toast-store'
import Button from '@/shared/components/Button'
import { exportAsPNG, exportAsPDF, printElement } from '@/shared/lib/html-export'

/**
 * Renders a sticker with export buttons (PNG, PDF, Print).
 * @param {'production'|'delivery'} props.type
 * @param {Object} props.order
 */
export function StickerActions({ type, order }) {
  const stickerRef = useRef(null)
  const [exporting, setExporting] = useState(false)

  const filename = `sticker-${type}-${order.number}`

  async function handlePNG() {
    if (!stickerRef.current) return
    setExporting(true)
    try {
      await exportAsPNG(stickerRef.current, filename, { scale: 3 })
      toast.success('PNG скачан')
    } catch {
      toast.error('Ошибка экспорта PNG')
    } finally {
      setExporting(false)
    }
  }

  async function handlePDF() {
    if (!stickerRef.current) return
    setExporting(true)
    try {
      await exportAsPDF(stickerRef.current, filename, { scale: 3, orientation: 'l', format: [75, 120], width: 120, height: 75 })
      toast.success('PDF скачан')
    } catch {
      toast.error('Ошибка экспорта PDF')
    } finally {
      setExporting(false)
    }
  }

  async function handlePrint() {
    if (!stickerRef.current) return
    try {
      await printElement(stickerRef.current, { scale: 3, pageSize: '120mm 75mm', width: '120mm', height: '75mm' })
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div>
      <div className="overflow-x-auto mb-4">
        <Sticker ref={stickerRef} order={order} type={type} />
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={handlePNG} loading={exporting}>PNG</Button>
        <Button variant="secondary" size="sm" onClick={handlePDF} loading={exporting}>PDF</Button>
        <Button variant="secondary" size="sm" onClick={handlePrint}>Печать</Button>
      </div>
    </div>
  )
}
