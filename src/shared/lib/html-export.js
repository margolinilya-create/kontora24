// Захватываем элемент с полным scrollHeight (даже если контейнер обрезает overflow)
// + imageTimeout 15s для медленной загрузки превью из Supabase Storage.
// pixelWidth/pixelHeight (R9.4, бриф 26.05): для стикеров 120x75мм mobile-viewport
// сжимает body, html2canvas видит scrollWidth = ширина viewport вместо настоящих
// 340px. Передаём explicit размеры, чтобы не обрезался текст по горизонтали.
async function renderCanvas(element, { scale, pixelWidth, pixelHeight }) {
  const { default: html2canvas } = await import('html2canvas')
  // R10.1: ждём загрузки @font-face (Modulord, Guidy, Bebas) — иначе html2canvas
  // снимет с fallback-шрифтом и метрики не совпадут с тем, что видит пользователь.
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try { await document.fonts.ready } catch { /* noop */ }
  }
  const w = pixelWidth || element.scrollWidth
  const h = pixelHeight || element.scrollHeight
  return html2canvas(element, {
    scale,
    useCORS: true,
    allowTaint: false,
    backgroundColor: '#ffffff',
    imageTimeout: 15000,
    windowWidth: w,
    windowHeight: h,
    width: w,
    height: h,
    ignoreElements: (el) => el.classList?.contains('print-hide'),
  })
}

/**
 * Export a DOM element as PNG and trigger download.
 */
export async function exportAsPNG(element, filename, { scale = 2, pixelWidth, pixelHeight } = {}) {
  const canvas = await renderCanvas(element, { scale, pixelWidth, pixelHeight })
  const link = document.createElement('a')
  link.download = `${filename}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

/**
 * Export a DOM element as PDF и trigger download.
 * Размеры canvas нормализуются под формат страницы PDF, чтобы текст не обрезался.
 * pixelWidth/pixelHeight — explicit DOM-размеры для html2canvas; width/height —
 * размеры страницы PDF в миллиметрах.
 */
export async function exportAsPDF(element, filename, { scale = 2, orientation = 'p', format = 'a4', pixelWidth, pixelHeight } = {}) {
  const [{ jsPDF }, canvas] = await Promise.all([
    import('jspdf'),
    renderCanvas(element, { scale, pixelWidth, pixelHeight }),
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
export async function printElement(element, { scale = 3, pageSize = '120mm 75mm', width = '120mm', height = '75mm', pixelWidth, pixelHeight } = {}) {
  const canvas = await renderCanvas(element, { scale, pixelWidth, pixelHeight })
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
