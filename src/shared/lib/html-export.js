// Захватываем элемент с полным scrollHeight (даже если контейнер обрезает overflow)
// + imageTimeout 15s для медленной загрузки превью из Supabase Storage.
async function renderCanvas(element, { scale }) {
  const { default: html2canvas } = await import('html2canvas')
  return html2canvas(element, {
    scale,
    useCORS: true,
    allowTaint: false,
    backgroundColor: '#ffffff',
    imageTimeout: 15000,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
    width: element.scrollWidth,
    height: element.scrollHeight,
    ignoreElements: (el) => el.classList?.contains('print-hide'),
  })
}

/**
 * Export a DOM element as PNG and trigger download.
 */
export async function exportAsPNG(element, filename, { scale = 2 } = {}) {
  const canvas = await renderCanvas(element, { scale })
  const link = document.createElement('a')
  link.download = `${filename}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

/**
 * Export a DOM element as PDF и trigger download.
 * Размеры canvas нормализуются под формат страницы PDF, чтобы текст не обрезался.
 */
export async function exportAsPDF(element, filename, { scale = 2, orientation = 'p', format = 'a4' } = {}) {
  const [{ jsPDF }, canvas] = await Promise.all([
    import('jspdf'),
    renderCanvas(element, { scale }),
  ])
  const imgData = canvas.toDataURL('image/png')
  const pdf = new jsPDF({ orientation, unit: 'mm', format })
  // Вписываем по самой ограниченной стороне, сохраняя пропорции canvas.
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const ratio = Math.min(pageW / canvas.width, pageH / canvas.height)
  const renderW = canvas.width * ratio
  const renderH = canvas.height * ratio
  const offsetX = (pageW - renderW) / 2
  const offsetY = (pageH - renderH) / 2
  pdf.addImage(imgData, 'PNG', offsetX, offsetY, renderW, renderH)
  pdf.save(`${filename}.pdf`)
}

/**
 * Print a DOM element via a new window.
 * @param {HTMLElement} element
 * @param {{ scale?: number, pageSize?: string, width?: string, height?: string }} options
 */
export async function printElement(element, { scale = 3, pageSize = '120mm 75mm', width = '120mm', height = '75mm' } = {}) {
  const { default: html2canvas } = await import('html2canvas')
  const canvas = await html2canvas(element, { scale, useCORS: true, backgroundColor: '#ffffff', ignoreElements: (el) => el.classList?.contains('print-hide') })
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
