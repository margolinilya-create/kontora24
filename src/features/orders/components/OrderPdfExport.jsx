import { useState } from 'react'
import { jsPDF } from 'jspdf'
import { ORDER_TYPES, ORDER_STATUSES } from '@/shared/constants'
import { formatPrice, formatDate } from '@/shared/lib/utils'
import { toast } from '@/shared/stores/toast-store'

export function OrderPdfExport({ order }) {
  const [exporting, setExporting] = useState(false)

  async function handleExport() {
    setExporting(true)
    try {
      const doc = new jsPDF('p', 'mm', 'a4')
      const W = 210
      let y = 20

      // Header
      doc.setFontSize(20)
      doc.setFont('helvetica', 'bold')
      doc.text('KONTORA24', 15, y)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'normal')
      doc.text(`Заказ #${order.number}`, W - 15, y, { align: 'right' })
      y += 5
      doc.setDrawColor(200)
      doc.line(15, y, W - 15, y)
      y += 10

      // Status
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text(`Статус: ${ORDER_STATUSES[order.status]?.label || order.status}`, 15, y)
      doc.text(`Дата: ${formatDate(order.created_at)}`, W - 15, y, { align: 'right' })
      y += 10

      // Order params
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.text('Параметры заказа', 15, y)
      y += 7
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)

      const params = [
        ['Тип', ORDER_TYPES[order.order_type]?.label || order.order_type],
        ['Размер', `${order.width_mm} × ${order.height_mm} мм`],
        ['Тираж', `${order.qty} шт`],
        ['Кол-во видов', `${order.design_variants || 1}`],
        ['Ламинация', order.need_lam ? 'Да' : 'Нет'],
        ['Срок', `${order.prod_days || '—'} дней`],
      ]
      params.forEach(([label, value]) => {
        doc.text(label + ':', 15, y)
        doc.text(value, 80, y)
        y += 6
      })
      y += 5

      // Client
      if (order.client) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        doc.text('Клиент', 15, y)
        y += 7
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.text(order.client.name || '—', 15, y)
        y += 5
        if (order.client.phone) { doc.text(order.client.phone, 15, y); y += 5 }
        y += 5
      }

      // Pricing
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.text('Стоимость', 15, y)
      y += 7
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)

      const pricing = [
        ['Материалы', formatPrice(order.cost_materials)],
        ['Труд', formatPrice(order.cost_labor)],
        ['Себестоимость', formatPrice(order.cost_total)],
        ['Наценка', `×${order.markup || '—'}`],
        ['Скидка', order.discount_pct ? `${(order.discount_pct * 100).toFixed(0)}%` : '—'],
      ]
      pricing.forEach(([label, value]) => {
        doc.text(label + ':', 15, y)
        doc.text(value, 80, y)
        y += 6
      })
      y += 3
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.text(`ИТОГО: ${formatPrice(order.price_final)}`, 15, y)
      doc.setFontSize(10)
      doc.text(`(${formatPrice(order.price_per_unit)} за шт)`, 90, y)
      y += 10

      // Notes
      if (order.notes) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        doc.text('Заметки', 15, y)
        y += 7
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        const lines = doc.splitTextToSize(order.notes, W - 30)
        doc.text(lines, 15, y)
        y += lines.length * 4.5
      }

      // Footer
      doc.setFontSize(8)
      doc.setTextColor(150)
      doc.text(`Kontora24 · Заказ #${order.number} · ${new Date().toLocaleDateString('ru-RU')}`, 15, 285)

      doc.save(`order-${order.number}.pdf`)
      toast.success('PDF экспортирован')
    } catch (err) {
      toast.error('Ошибка PDF: ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className="border border-border text-text hover:bg-surface-dim font-medium rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-50"
    >
      {exporting ? '...' : 'PDF'}
    </button>
  )
}
