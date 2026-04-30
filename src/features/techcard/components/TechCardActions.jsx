import { useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { TechCard } from './TechCard'
import { toast } from '@/shared/stores/toast-store'

export function TechCardActions({ order }) {
  const cardRef = useRef(null)
  const [showPreview, setShowPreview] = useState(false)
  const [exporting, setExporting] = useState(false)

  async function exportPNG() {
    if (!cardRef.current) return
    setExporting(true)
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      })
      const link = document.createElement('a')
      link.download = `techcard-${order.number}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (err) {
      toast.error('Ошибка экспорта: ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  async function exportPDF() {
    if (!cardRef.current) return
    setExporting(true)
    try {
      const canvas = await html2canvas(cardRef.current, { scale: 2, backgroundColor: '#ffffff' })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      pdf.addImage(imgData, 'PNG', 0, 0, 210, 297)
      pdf.save(`techcard-${order.number}.pdf`)
    } catch (err) {
      toast.error('Ошибка PDF: ' + err.message)
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
              onClick={exportPNG}
              disabled={exporting}
              className="border border-border text-text hover:bg-surface-dim font-medium rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-50"
            >
              {exporting ? '...' : 'PNG'}
            </button>
            <button
              onClick={exportPDF}
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
