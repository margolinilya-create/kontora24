import { useRef, useState } from 'react'
import Modal from '@/shared/components/Modal'
import Button from '@/shared/components/Button'
import { TechCard } from './TechCard'
import { Sticker } from './Sticker'
import { exportAsPNG, exportAsPDF, printElement } from '@/shared/lib/html-export'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'

const CONFIG = {
  techcard: {
    title: 'Тех. карта',
    pdf: { scale: 2, orientation: 'p', format: 'a4', width: 210, height: 297 },
    print: { scale: 2, pageSize: 'A4', width: '210mm', height: '297mm' },
    filenamePrefix: 'techcard',
    maxWidth: 'max-w-3xl',
  },
  production: {
    title: 'Стикер «В производство»',
    pdf: { scale: 3, orientation: 'l', format: [75, 120], width: 120, height: 75 },
    print: { scale: 3, pageSize: '120mm 75mm', width: '120mm', height: '75mm' },
    filenamePrefix: 'sticker-production',
    maxWidth: 'max-w-md',
  },
  delivery: {
    title: 'Стикер «На выдачу»',
    pdf: { scale: 3, orientation: 'l', format: [75, 120], width: 120, height: 75 },
    print: { scale: 3, pageSize: '120mm 75mm', width: '120mm', height: '75mm' },
    filenamePrefix: 'sticker-delivery',
    maxWidth: 'max-w-md',
  },
}

/**
 * Universal print preview modal for tech card and stickers.
 * Renders preview at native size (scrollable on mobile) + PNG/PDF/Print actions.
 */
export function PrintPreviewModal({ isOpen, onClose, type, order }) {
  const ref = useRef(null)
  const [exporting, setExporting] = useState(false)
  const cfg = CONFIG[type]
  if (!cfg || !order) return null

  const filename = `${cfg.filenamePrefix}-${order.number}`

  async function handlePNG() {
    if (!ref.current) return
    setExporting(true)
    try {
      await exportAsPNG(ref.current, filename, { scale: cfg.pdf.scale })
      toast.success('PNG скачан')
    } catch (err) { toast.error(translateError(err).message) }
    finally { setExporting(false) }
  }

  async function handlePDF() {
    if (!ref.current) return
    setExporting(true)
    try {
      await exportAsPDF(ref.current, filename, cfg.pdf)
      toast.success('PDF скачан')
    } catch (err) { toast.error(translateError(err).message) }
    finally { setExporting(false) }
  }

  async function handlePrint() {
    if (!ref.current) return
    try {
      await printElement(ref.current, cfg.print)
    } catch (err) { toast.error(translateError(err).message) }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={cfg.title} maxWidth={cfg.maxWidth}>
      <div className="overflow-auto bg-surface-dim rounded-xl p-3 mb-4">
        <div className="mx-auto" style={{ width: 'fit-content' }}>
          {type === 'techcard'
            ? <TechCard ref={ref} order={order} />
            : <Sticker ref={ref} order={order} type={type} />}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={handlePNG} loading={exporting}>PNG</Button>
        <Button variant="secondary" size="sm" onClick={handlePDF} loading={exporting}>PDF</Button>
        <Button variant="primary" size="sm" onClick={handlePrint}>Печать</Button>
      </div>
    </Modal>
  )
}
