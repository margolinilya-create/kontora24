import { useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { ProductionSticker } from './ProductionSticker'
import { DeliverySticker } from './DeliverySticker'
import { toast } from '@/shared/stores/toast-store'
import Button from '@/shared/components/Button'

/**
 * Renders a sticker with export buttons (PNG, PDF, Print).
 * @param {Object} props
 * @param {'production'|'delivery'} props.type - Which sticker to render
 * @param {Object} props.order - Order data
 */
export function StickerActions({ type, order }) {
  const stickerRef = useRef(null)
  const [exporting, setExporting] = useState(false)

  const StickerComponent = type === 'production' ? ProductionSticker : DeliverySticker
  const filename = type === 'production'
    ? `sticker-production-${order.number}`
    : `sticker-delivery-${order.number}`

  async function exportPNG() {
    if (!stickerRef.current) return
    setExporting(true)
    try {
      const canvas = await html2canvas(stickerRef.current, { scale: 3, useCORS: true, backgroundColor: '#ffffff' })
      const link = document.createElement('a')
      link.download = `${filename}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      toast.success('PNG скачан')
    } catch {
      toast.error('Ошибка экспорта PNG')
    } finally {
      setExporting(false)
    }
  }

  async function exportPDF() {
    if (!stickerRef.current) return
    setExporting(true)
    try {
      const canvas = await html2canvas(stickerRef.current, { scale: 3, useCORS: true, backgroundColor: '#ffffff' })
      const imgData = canvas.toDataURL('image/png')
      // 120x75mm sticker
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [75, 120] })
      doc.addImage(imgData, 'PNG', 0, 0, 120, 75)
      doc.save(`${filename}.pdf`)
      toast.success('PDF скачан')
    } catch {
      toast.error('Ошибка экспорта PDF')
    } finally {
      setExporting(false)
    }
  }

  function handlePrint() {
    if (!stickerRef.current) return
    const printWindow = window.open('', '_blank')
    if (!printWindow) { toast.error('Попап заблокирован'); return }

    html2canvas(stickerRef.current, { scale: 3, useCORS: true, backgroundColor: '#ffffff' }).then(canvas => {
      const imgData = canvas.toDataURL('image/png')
      printWindow.document.write(`
        <html><head><title>${filename}</title>
        <style>@page { size: 120mm 75mm; margin: 0; } body { margin: 0; } img { width: 120mm; height: 75mm; }</style>
        </head><body><img src="${imgData}" /><script>setTimeout(() => { window.print(); window.close(); }, 300)</script></body></html>
      `)
      printWindow.document.close()
    })
  }

  return (
    <div>
      {/* Sticker preview */}
      <div className="overflow-x-auto mb-4">
        <StickerComponent ref={stickerRef} order={order} />
      </div>

      {/* Export buttons */}
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={exportPNG} loading={exporting}>PNG</Button>
        <Button variant="secondary" size="sm" onClick={exportPDF} loading={exporting}>PDF</Button>
        <Button variant="secondary" size="sm" onClick={handlePrint}>Печать</Button>
      </div>
    </div>
  )
}
