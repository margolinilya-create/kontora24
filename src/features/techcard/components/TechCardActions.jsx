import { useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { TechCard } from './TechCard'

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
      alert('Ошибка экспорта: ' + err.message)
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
              onClick={handlePrint}
              className="border border-border text-text hover:bg-surface-dim font-medium rounded-lg px-3 py-2 text-sm transition-colors"
            >
              Печать
            </button>
          </>
        )}
      </div>

      {showPreview && (
        <div className="mt-4">
          <div className="bg-gray-100 rounded-xl p-4 flex justify-center overflow-auto">
            <div className="shadow-lg">
              <TechCard ref={cardRef} order={order} />
            </div>
          </div>
        </div>
      )}

      {/* Print-only styles */}
      <style>{`
        @media print {
          body > *:not(#tech-card-print) { display: none !important; }
          @page { size: A4; margin: 0; }
        }
      `}</style>
    </>
  )
}
