import { useState } from 'react'
import { addMaterialTransaction, useMaterialTransactions } from '../hooks/useMaterials'
import { toast } from '@/shared/stores/toast-store'
import { formatNumber, formatDateTime } from '@/shared/lib/utils'

export function StockModal({ material, onClose, onDone }) {
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const [isExpense, setIsExpense] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('form') // 'form' | 'history'
  const { transactions, loading: histLoading } = useMaterialTransactions(material.id)

  async function handleSubmit(e) {
    e.preventDefault()
    const num = Number(delta)
    if (!num || num <= 0) return

    setLoading(true)
    try {
      await addMaterialTransaction({
        materialId: material.id,
        delta: isExpense ? -num : num,
        reason: reason || (isExpense ? 'Расход' : 'Приход'),
      })
      toast.success(isExpense ? 'Списано' : 'Оприходовано')
      onDone()
    } catch (err) {
      toast.error('Ошибка: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="bg-surface rounded-xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold">{material.name}</h2>
            <p className="text-sm text-text-muted mt-0.5">
              Остаток: <span className="font-semibold text-text">{formatNumber(material.stock_qty, 1)} {material.unit}</span>
              {material.min_qty > 0 && Number(material.stock_qty) <= Number(material.min_qty) && (
                <span className="text-danger ml-2">(ниже минимума {formatNumber(material.min_qty, 1)})</span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text text-xl" aria-label="Закрыть">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setTab('form')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === 'form' ? 'border-b-2 border-accent text-accent' : 'text-text-muted hover:text-text'}`}
          >
            Приход / Расход
          </button>
          <button
            onClick={() => setTab('history')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === 'history' ? 'border-b-2 border-accent text-accent' : 'text-text-muted hover:text-text'}`}
          >
            История ({transactions.length})
          </button>
        </div>

        {tab === 'form' ? (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setIsExpense(false)}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${!isExpense ? 'bg-success text-white' : 'text-text-muted hover:bg-surface-dim'}`}
              >
                + Приход
              </button>
              <button
                type="button"
                onClick={() => setIsExpense(true)}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${isExpense ? 'bg-danger text-white' : 'text-text-muted hover:bg-surface-dim'}`}
              >
                − Расход
              </button>
            </div>

            <div>
              <label htmlFor="stock-qty" className="block text-sm font-medium mb-1.5">
                Количество ({material.unit})
              </label>
              <input
                id="stock-qty"
                type="number"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                min="0.01"
                step="any"
                required
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                placeholder="0"
                autoFocus
              />
              {delta && (
                <p className="text-xs text-text-muted mt-1">
                  После: {formatNumber(Number(material.stock_qty) + (isExpense ? -Number(delta) : Number(delta)), 1)} {material.unit}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="stock-reason" className="block text-sm font-medium mb-1.5">Причина</label>
              <input
                id="stock-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                placeholder={isExpense ? 'Расход на заказ' : 'Закупка'}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent hover:bg-accent-hover text-white font-medium rounded-lg py-2.5 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Обработка...' : isExpense ? 'Списать' : 'Оприходовать'}
            </button>
          </form>
        ) : (
          <div className="overflow-auto flex-1 p-4">
            {histLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-accent border-t-transparent" />
              </div>
            ) : transactions.length === 0 ? (
              <p className="text-text-muted text-sm text-center py-8">Нет операций</p>
            ) : (
              <div className="space-y-2">
                {transactions.map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-sm py-2 border-b border-border last:border-0">
                    <div>
                      <span className={`font-medium ${Number(t.delta) > 0 ? 'text-success' : 'text-danger'}`}>
                        {Number(t.delta) > 0 ? '+' : ''}{formatNumber(t.delta, 2)} {material.unit}
                      </span>
                      {t.reason && <p className="text-xs text-text-muted">{t.reason}</p>}
                      {t.created_by_profile && <p className="text-xs text-text-muted">{t.created_by_profile.display_name}</p>}
                    </div>
                    <span className="text-xs text-text-muted whitespace-nowrap">{formatDateTime(t.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
