import { useState } from 'react'
import { addMaterialTransaction } from '../hooks/useMaterials'

export function StockModal({ material, onClose, onDone }) {
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const [isExpense, setIsExpense] = useState(false)
  const [loading, setLoading] = useState(false)

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
      onDone()
    } catch (err) {
      alert('Ошибка: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-surface rounded-xl shadow-xl max-w-sm w-full">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-semibold">{material.name}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text text-xl">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Toggle */}
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
            <label className="block text-sm font-medium mb-1.5">
              Количество ({material.unit})
            </label>
            <input
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
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Причина</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
              placeholder={isExpense ? 'Расход на заказ' : 'Закупка'}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-hover text-white font-medium rounded-lg py-2.5 text-sm transition-colors disabled:opacity-50"
          >
            {loading ? '...' : isExpense ? 'Списать' : 'Оприходовать'}
          </button>
        </form>
      </div>
    </div>
  )
}
