import { useRef, useState } from 'react'
import { TechCard } from './TechCard'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { exportAsPNG, exportAsPDF } from '@/shared/lib/html-export'

export function TechCardActions({ order, defaultOpen = false }) {
  const cardRef = useRef(null)
  const [showPreview, setShowPreview] = useState(defaultOpen)
  const [exporting, setExporting] = useState(false)

  async function handlePNG() {
    if (!cardRef.current) return
    setExporting(true)
    try {
      await exportAsPNG(cardRef.current, `techcard-${order.number}`, { scale: 2 })
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setExporting(false)
    }
  }

  async function handlePDF() {
    if (!cardRef.current) return
    setExporting(true)
    try {
      await exportAsPDF(cardRef.current, `techcard-${order.number}`, { scale: 2, orientation: 'p', format: 'a4', width: 210, height: 297 })
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setExporting(false)
    }
  }

  function handlePrint() {
    setShowPreview(true)
    setTimeout(() => window.print(), 100)
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="border border-border text-text hover:bg-surface-dim font-medium rounded-lg px-3 py-2 text-sm transition-colors"
        >
          {showPreview ? 'Скрыть тех карту' : 'Тех карта'}
        </button>
        {showPreview && (
          <>
            <button
              onClick={handlePNG}
              disabled={exporting}
              className="border border-border text-text hover:bg-surface-dim font-medium rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-50"
            >
              {exporting ? '...' : 'PNG'}
            </button>
            <button
              onClick={handlePDF}
              disabled={exporting}
              className="border border-border text-text hover:bg-surface-dim font-medium rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-50"
            >
              PDF
            </button>
            <button
              onClick={handlePrint}
              className="border border-border text-text hover:bg-surface-dim font-medium rounded-lg px-3 py-2 text-sm transition-colors"
            >
              Печать
            </button>
          </>
        )}
      </div>

      {showPreview && (
        <div className="mt-4 print:mt-0">
          <div className="bg-surface-dim rounded-xl p-4 flex justify-center overflow-auto print:bg-white print:p-0 print:rounded-none">
            <div className="shadow-lg print:shadow-none" id="tech-card-print">
              <TechCard ref={cardRef} order={order} />
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          body > * { display: none !important; }
          #tech-card-print { display: block !important; position: fixed; top: 0; left: 0; }
          #tech-card-print * { display: revert !important; }
          @page { size: A4; margin: 0; }
        }
      `}</style>
    </>
  )
}
