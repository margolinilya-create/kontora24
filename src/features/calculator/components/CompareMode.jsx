import { useState, useMemo } from 'react'
import { calculate } from '../lib/calculator'
import { formatPrice } from '@/shared/lib/utils'

export function CompareMode({ baseForm }) {
  const [compareQty, setCompareQty] = useState(Number(baseForm.qty) * 2)

  const is3D = baseForm.orderType === 'sticker3D' || baseForm.orderType === 'stickerpack3D'

  const baseResult = useMemo(() => calculate({
    width: Number(baseForm.width), height: Number(baseForm.height), qty: Number(baseForm.qty),
    orderType: baseForm.orderType, needLam: baseForm.needLam, is3D,
  }), [baseForm, is3D])

  const compareResult = useMemo(() => calculate({
    width: Number(baseForm.width), height: Number(baseForm.height), qty: Number(compareQty),
    orderType: baseForm.orderType, needLam: baseForm.needLam, is3D,
  }), [baseForm, compareQty, is3D])

  const savedPerUnit = baseResult.pricePerUnit - compareResult.pricePerUnit
  const savedPct = baseResult.pricePerUnit > 0 ? (savedPerUnit / baseResult.pricePerUnit * 100).toFixed(0) : 0

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <h3 className="font-semibold mb-3">Сравнить тиражи</h3>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-sm text-text-muted">Если заказать</span>
        <input
          type="number"
          value={compareQty}
          onChange={(e) => setCompareQty(Number(e.target.value) || 1)}
          min="1"
          aria-label="Количество для сравнения"
          className="w-24 rounded-lg border border-border px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
        <span className="text-sm text-text-muted">шт вместо {baseForm.qty}?</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-xs text-text-muted">Текущий ({baseForm.qty} шт)</p>
          <p className="text-lg font-bold">{formatPrice(baseResult.pricePerUnit)}</p>
          <p className="text-xs text-text-muted">за шт</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Сравнение ({compareQty} шт)</p>
          <p className="text-lg font-bold text-accent">{formatPrice(compareResult.pricePerUnit)}</p>
          <p className="text-xs text-text-muted">за шт</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Экономия</p>
          <p className={`text-lg font-bold ${savedPerUnit > 0 ? 'text-success' : 'text-text-muted'}`}>
            {savedPerUnit > 0 ? `-${savedPct}%` : '—'}
          </p>
          <p className="text-xs text-text-muted">
            {savedPerUnit > 0 ? `${formatPrice(savedPerUnit)} за шт` : ''}
          </p>
        </div>
      </div>

      <div className="flex justify-between mt-3 pt-3 border-t border-border text-sm">
        <div>
          <span className="text-text-muted">Итого за {baseForm.qty}:</span>{' '}
          <span className="font-semibold">{formatPrice(baseResult.priceFinal)}</span>
        </div>
        <div>
          <span className="text-text-muted">Итого за {compareQty}:</span>{' '}
          <span className="font-semibold text-accent">{formatPrice(compareResult.priceFinal)}</span>
        </div>
      </div>
    </div>
  )
}
