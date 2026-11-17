import { formatInt, formatPrice, formatRub } from '../lib/copy-text'

/**
 * «Цены по тиражам» (ТЗ 5.3): цена на нижней границе ступени с учётом
 * включённых опций, текущая ступень подсвечена. Колонка «Наценка» — только
 * при showMarkup (право view:finance и себестоимость не скрыта).
 */
export function PriceTiersTable({ tiers, showMarkup }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm tabular-nums">
        <thead className="bg-surface-2 text-text-muted text-xs">
          <tr>
            <th scope="col" className="text-left font-medium px-3 py-2">Тираж, шт</th>
            <th scope="col" className="text-right font-medium px-3 py-2">Цена 1 шт</th>
            <th scope="col" className="text-right font-medium px-3 py-2">Стоимость</th>
            {showMarkup && <th scope="col" className="text-right font-medium px-3 py-2">Наценка</th>}
          </tr>
        </thead>
        <tbody>
          {tiers.map((t) => (
            <tr
              key={t.from}
              aria-current={t.current ? 'true' : undefined}
              className={t.current ? 'bg-accent/25 font-semibold' : 'border-t border-border'}
            >
              <td className="px-3 py-2 whitespace-nowrap">{formatInt(t.from)}–{formatInt(t.to)}</td>
              <td className="px-3 py-2 text-right whitespace-nowrap">{formatPrice(t.pricePerUnit)}</td>
              <td className="px-3 py-2 text-right whitespace-nowrap">{formatRub(t.total)}</td>
              {showMarkup && <td className="px-3 py-2 text-right whitespace-nowrap">×{t.markup.toFixed(2).replace('.', ',')}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
