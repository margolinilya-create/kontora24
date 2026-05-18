import Button from '@/shared/components/Button'
import { compute3DPouringReport } from '@/features/production/lib/production-logs'
import { usePackDesigns } from '@/features/production/hooks/usePackDesigns'
import { exportCSV } from '@/shared/lib/export'
import { formatOrderNumber, orderFileSlug } from '@/shared/lib/utils'
import { IS_3D_STICKERPACK } from '@/shared/constants'

/**
 * Кнопка скачивания сводки по 3D-заливке для одного завершённого 3D-стикерпак заказа.
 * Появляется только при order_type='stickerpack3D' И status='done'.
 */
const COLUMNS = [
  { key: 'orderNumber',  label: '№ заказа' },
  { key: 'qtyTarget',    label: 'Тираж' },
  { key: 'designLabel',  label: 'Вид стикера' },
  { key: 'printed',      label: 'Напечатано стикеров' },
  { key: 'target15',     label: 'С учётом запаса 15%' },
  { key: 'pouredRaw',    label: 'Итого зал. без учёта брака' },
  { key: 'defects',      label: 'Забраковано' },
  { key: 'good',         label: 'Итого хороших 3D' },
  { key: 'surplus',      label: 'Излишки 3D' },
  { key: 'defectsPct',   label: '% брака' },
  { key: 'surplusPct',   label: '% излишков' },
]

export function ThreeDPouringExportButton({ order, logs }) {
  const { designs } = usePackDesigns(order?.id || null)
  if (!order || !IS_3D_STICKERPACK(order.order_type) || order.status !== 'done') return null
  if (!designs?.length) return null

  function handleExport() {
    const rows = compute3DPouringReport(order, logs, designs)
    const num = formatOrderNumber(order)
    const csvRows = rows.map((r) => ({
      orderNumber: num,
      qtyTarget: r.qtyTarget,
      designLabel: r.designName ? `${r.designIndex} · ${r.designName}` : String(r.designIndex),
      printed: r.printed,
      target15: r.target15,
      pouredRaw: r.pouredRaw,
      defects: r.defects,
      good: r.good,
      surplus: r.surplus,
      defectsPct: `${r.defectsPct.toFixed(2)}%`,
      surplusPct: `${r.surplusPct.toFixed(2)}%`,
    }))
    exportCSV(csvRows, COLUMNS, `3d-pouring-${orderFileSlug(order)}.csv`)
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleExport}>
      Скачать сводку 3D-заливки
    </Button>
  )
}
