import { useProductionLogs } from '@/features/production/hooks/useProductionLogs'
import { usePackagingMaterials } from '@/features/production/hooks/usePackagingMaterials'
import { FILM_TYPES, LAMINATION_TYPES, calculateActualMaterialsCost } from '@/shared/constants'

/**
 * Вкладка «Расход материалов».
 * Только отображение фактического расхода: плёнка по типам в метрах, смола в кг,
 * БОПП-пакеты и коробки на этапе упаковки (из k24_production_logs).
 * Ввод данных перенесён на вкладку «Прогресс» (левый виджет).
 */
export function OrderReportsTab({ order }) {
  const { logs, error: logsError } = useProductionLogs(order.id, order.qty)
  const { bags, boxes } = usePackagingMaterials()

  // Плёнка для печати — суммируем по film_type
  const printFilm = {}
  let lamMeters = 0
  let resinGrams = 0
  const baggedByMaterial = {}  // { material_id: qty_total }
  const boxedByMaterial = {}   // { material_id: boxes_total }
  for (const l of logs) {
    if (l.stage === 'print' && Number(l.film_meters) > 0) {
      const ft = l.film_type || order.film_type
      if (ft) printFilm[ft] = (printFilm[ft] || 0) + Number(l.film_meters)
    }
    if (l.stage === 'lamination' && Number(l.lamination_meters) > 0) {
      lamMeters += Number(l.lamination_meters)
    }
    resinGrams += Number(l.resin_grams) || 0
    if (l.stage === 'packaging') {
      if (l.packaging_bag_material_id && Number(l.packs_packaged) > 0) {
        const key = l.packaging_bag_material_id
        baggedByMaterial[key] = (baggedByMaterial[key] || 0) + Number(l.packs_packaged)
      }
      if (l.box_material_id && Number(l.boxes_used) > 0) {
        const key = l.box_material_id
        boxedByMaterial[key] = (boxedByMaterial[key] || 0) + Number(l.boxes_used)
      }
    }
  }

  const cost = calculateActualMaterialsCost(logs, order.film_type)
  const hasAny = Object.keys(printFilm).length > 0 || lamMeters > 0 || resinGrams > 0
    || Object.keys(baggedByMaterial).length > 0 || Object.keys(boxedByMaterial).length > 0

  return (
    <div className="space-y-4">
      {logsError && (
        <div role="alert" className="bg-danger/10 border border-danger/30 text-danger rounded-lg px-3 py-2 text-sm">
          Не удалось загрузить логи производства
        </div>
      )}

      {/* Плёнка для печати */}
      <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
        <h2 className="font-semibold mb-3">Расход плёнки для печати</h2>
        {Object.keys(printFilm).length === 0 ? (
          <p className="text-sm text-text-muted">Нет данных. Расход появится после ввода на вкладке «Прогресс».</p>
        ) : (
          <div className="divide-y divide-border">
            {Object.entries(printFilm).map(([ft, m]) => (
              <div key={ft} className="py-2 flex items-center justify-between text-sm">
                <span>{FILM_TYPES[ft]?.label || ft}</span>
                <span className="font-medium tabular-nums">{m.toFixed(1)} м</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Плёнка для ламинации / переноса на монтаж */}
      {order.need_lam && (
        <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
          <h2 className="font-semibold mb-3">
            Расход {order.lam_type === 'transfer' ? 'монтажной плёнки' : 'плёнки для ламинации'}
          </h2>
          <div className="flex items-center justify-between text-sm">
            <span>{LAMINATION_TYPES[order.lam_type]?.label || 'Ламинация'}</span>
            <span className="font-medium tabular-nums">{lamMeters.toFixed(1)} м</span>
          </div>
        </div>
      )}

      {/* Смола (только для 3D) */}
      {(order.order_type === 'sticker3D' || order.order_type === 'stickerpack3D') && (
        <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
          <h2 className="font-semibold mb-3">Расход смолы</h2>
          <div className="flex items-center justify-between text-sm">
            <span>Смесь смолы</span>
            <span className="font-medium tabular-nums">
              {(resinGrams / 1000).toFixed(2)} кг
              <span className="text-text-muted ml-2 font-normal">({Math.round(resinGrams)} г)</span>
            </span>
          </div>
        </div>
      )}

      {/* БОПП-пакеты */}
      {Object.keys(baggedByMaterial).length > 0 && (
        <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
          <h2 className="font-semibold mb-3">Расход БОПП-пакетов</h2>
          <div className="divide-y divide-border">
            {Object.entries(baggedByMaterial).map(([id, qty]) => {
              const mat = bags.find((m) => m.id === id)
              return (
                <div key={id} className="py-2 flex items-center justify-between text-sm">
                  <span>{mat?.name || 'Пакет'}</span>
                  <span className="font-medium tabular-nums">{qty} шт</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Коробки */}
      {Object.keys(boxedByMaterial).length > 0 && (
        <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
          <h2 className="font-semibold mb-3">Расход коробок</h2>
          <div className="divide-y divide-border">
            {Object.entries(boxedByMaterial).map(([id, qty]) => {
              const mat = boxes.find((m) => m.id === id)
              return (
                <div key={id} className="py-2 flex items-center justify-between text-sm">
                  <span>{mat?.name || 'Коробка'}</span>
                  <span className="font-medium tabular-nums">{qty} шт</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Сводка стоимости */}
      {hasAny && (
        <div className="bg-surface-2 rounded-xl border border-border px-4 py-3 text-sm text-text-muted flex flex-wrap gap-x-6 gap-y-1">
          <span>Плёнка: <strong className="text-text">{Math.round(cost.filmsTotal)} ₽</strong></span>
          {cost.resinGrams > 0 && (
            <span>Смола: <strong className="text-text">{Math.round(cost.resinCost)} ₽</strong></span>
          )}
          <span>Итого фактически: <strong className="text-text">{Math.round(cost.total)} ₽</strong></span>
        </div>
      )}
    </div>
  )
}
