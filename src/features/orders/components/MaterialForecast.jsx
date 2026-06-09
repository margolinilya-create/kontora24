import { useMemo } from 'react'
import { forecastMaterials } from '../lib/material-forecast'
import { useMaterials } from '@/features/warehouse/hooks/useMaterials'
import { formatNumber } from '@/shared/lib/utils'

/**
 * Виджет «Предварительный расход материалов» в правом блоке формы создания заказа.
 * Бриф 25.05: показывает по 4-5 строк (плёнка, ламинация, смола, БОПП) с колонками
 * расход/остаток. Зелёный — расход <= остаток, красный — расход > остаток.
 *
 * Сравнение по material_code (для плёнки/ламинации/смолы) или по type
 * (для БОПП — суммируем все позиции).
 */
export function MaterialForecast({
  orderType, widthMm, heightMm, qty,
  filmType, filmTypeStickers, lamType, boppBag,
  items, // [{widthMm, heightMm, qty}] для multi-variant — приоритет над одиночными полями
}) {
  const { materials, loading } = useMaterials()

  // R17.6: кандидаты на БОПП-matching из k24_materials с размерами.
  const boppCandidates = useMemo(() => {
    return (materials || []).filter((m) => m.type === 'packaging_bag' && m.archived_at == null)
  }, [materials])

  const rows = useMemo(() => forecastMaterials({
    orderType, widthMm, heightMm, qty,
    filmType, filmTypeStickers, lamType, boppBag, items,
    boppCandidates,
  }), [orderType, widthMm, heightMm, qty, filmType, filmTypeStickers, lamType, boppBag, items, boppCandidates])

  const stockByCode = useMemo(() => {
    const map = {}
    for (const m of materials) {
      if (m.material_code) map[m.material_code] = Number(m.stock_qty) || 0
    }
    return map
  }, [materials])

  const stockByType = useMemo(() => {
    const map = {}
    for (const m of materials) {
      if (m.type) map[m.type] = (map[m.type] || 0) + (Number(m.stock_qty) || 0)
    }
    return map
  }, [materials])

  // R17.6: остаток по конкретной позиции (для БОПП matching).
  const stockById = useMemo(() => {
    const map = {}
    for (const m of materials) map[m.id] = Number(m.stock_qty) || 0
    return map
  }, [materials])

  if (rows.length === 0) {
    return (
      <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
        <h3 className="font-semibold text-sm mb-1">Расход материалов</h3>
        <p className="text-xs text-text-muted">
          Заполните размер, тираж и тип плёнки — появится прогноз расхода.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
      <h3 className="font-semibold text-sm mb-3">Расход материалов</h3>
      <div className="space-y-2">
        {rows.map((row) => {
          const stock = row.lookup
            ? (row.lookup.by === 'code'
                ? stockByCode[row.lookup.value]
                : row.lookup.by === 'materialId'
                ? stockById[row.lookup.value]
                : stockByType[row.lookup.value])
            : undefined
          const stockKnown = stock !== undefined
          const enough = stockKnown && stock >= row.expected
          const tone = !stockKnown ? 'neutral' : (enough ? 'ok' : 'short')
          const decimals = row.unit === 'шт' ? 0 : 1
          return (
            <div
              key={row.key}
              className={`grid grid-cols-2 gap-2 items-center px-3 py-2 rounded-lg border text-sm ${
                tone === 'ok'
                  ? 'bg-success/10 border-success/30'
                  : tone === 'short'
                  ? 'bg-danger/10 border-danger/30'
                  : 'bg-surface-dim border-border'
              }`}
            >
              <div>
                <p className="text-xs font-medium leading-tight">{row.label}</p>
                <p className={`text-base font-semibold tabular-nums ${tone === 'short' ? 'text-danger' : ''}`}>
                  {formatNumber(row.expected, decimals)} {row.unit}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-text-muted">Остаток</p>
                <p className={`text-base font-semibold tabular-nums ${
                  !stockKnown ? 'text-text-muted' : enough ? 'text-success' : 'text-danger'
                }`}>
                  {stockKnown ? `${formatNumber(stock, decimals)} ${row.unit}` : '—'}
                </p>
              </div>
            </div>
          )
        })}
      </div>
      {loading && (
        <p className="text-xs text-text-muted mt-2">Обновление остатков…</p>
      )}
      <p className="text-xs text-text-muted mt-3">
        Расход рассчитан по формулам брифа (ширина блока, отступ 30 мм по высоте, 6 мм между изделиями).
        Списание по факту — на этапе производства.
      </p>
    </div>
  )
}
