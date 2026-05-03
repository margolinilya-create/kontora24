import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

/**
 * Export a DOM element as PNG and trigger download.
 * @param {HTMLElement} element
 * @param {string} filename - without extension
 * @param {{ scale?: number }} options
 */
export async function exportAsPNG(element, filename, { scale = 2 } = {}) {
  const canvas = await html2canvas(element, { scale, useCORS: true, backgroundColor: '#ffffff' })
  const link = document.createElement('a')
  link.download = `${filename}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

/**
 * Export a DOM element as PDF and trigger download.
 * @param {HTMLElement} element
 * @param {string} filename - without extension
 * @param {{ scale?: number, orientation?: string, format?: string|number[], width?: number, height?: number }} options
 */
export async function exportAsPDF(element, filename, { scale = 2, orientation = 'p', format = 'a4', width = 210, height = 297 } = {}) {
  const canvas = await html2canvas(element, { scale, useCORS: true, backgroundColor: '#ffffff' })
  const imgData = canvas.toDataURL('image/png')
  const pdf = new jsPDF({ orientation, unit: 'mm', format })
  pdf.addImage(imgData, 'PNG', 0, 0, width, height)
  pdf.save(`${filename}.pdf`)
}

/**
 * Print a DOM element via a new window.
 * @param {HTMLElement} element
 * @param {{ scale?: number, pageSize?: string, width?: string, height?: string }} options
 */
export async function printElement(element, { scale = 3, pageSize = '120mm 75mm', width = '120mm', height = '75mm' } = {}) {
  const canvas = await html2canvas(element, { scale, useCORS: true, backgroundColor: '#ffffff' })
  const imgData = canvas.toDataURL('image/png')
  const printWindow = window.open('', '_blank')
  if (!printWindow) throw new Error('Попап заблокирован')

  printWindow.document.write(`
    <html><head><title>Print</title>
    <style>@page { size: ${pageSize}; margin: 0; } body { margin: 0; } img { width: ${width}; height: ${height}; }</style>
    </head><body><img src="${imgData}" /><script>setTimeout(() => { window.print(); window.close(); }, 300)</script></body></html>
  `)
  printWindow.document.close()
}
