import { useState } from 'react'
import { addMaterialTransaction, useMaterialTransactions } from '../hooks/useMaterials'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { formatNumber, formatDateTime, formatPrice } from '@/shared/lib/utils'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import Modal from '@/shared/components/Modal'
import Input from '@/shared/components/Input'
import Button from '@/shared/components/Button'
import Spinner from '@/shared/components/Spinner'

export function StockModal({ material, onClose, onDone }) {
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const [totalCost, setTotalCost] = useState('')
  const [isExpense, setIsExpense] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('form') // 'form' | 'history'
  const { transactions, loading: histLoading } = useMaterialTransactions(material.id)
  const canTransact = useCanDo('material:add_transaction')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canTransact) {
      toast.error('Нет прав на внесение прихода/расхода')
      return
    }
    const num = Number(delta)
    if (!num || num <= 0) return

    setLoading(true)
    try {
      await addMaterialTransaction({
        materialId: material.id,
        delta: isExpense ? -num : num,
        reason: reason || (isExpense ? 'Расход' : 'Приход'),
        totalCost: !isExpense && totalCost !== '' ? totalCost : null,
      })
      toast.success(isExpense ? 'Списано' : 'Оприходовано')
      onDone()
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={true} onClose={onClose} title={material.name}>
      <div className="text-sm text-text-muted mb-4 space-y-0.5">
        <p>
          Остаток: <span className="font-semibold text-text">{formatNumber(material.stock_qty, 1)} {material.unit}</span>
          {material.min_qty > 0 && Number(material.stock_qty) <= Number(material.min_qty) && (
            <span className="text-danger ml-2">(ниже минимума {formatNumber(material.min_qty, 1)})</span>
          )}
        </p>
        {material.reserved > 0 && (
          <>
            <p>Зарезервировано: <span className="font-semibold text-text">{formatNumber(material.reserved, 1)} {material.unit}</span></p>
            <p>Доступно: <span className="font-semibold text-text">{formatNumber(material.available, 1)} {material.unit}</span></p>
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border -mx-5 px-5 mb-4">
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
        <form onSubmit={handleSubmit} className="space-y-4">
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
            <Input
              label={`Количество (${material.unit})`}
              id="stock-qty"
              type="number"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              min="0.01"
              step="any"
              required
              placeholder="0"
              autoFocus
            />
            {delta && (
              <p className="text-xs text-text-muted mt-1">
                После: {formatNumber(Number(material.stock_qty) + (isExpense ? -Number(delta) : Number(delta)), 1)} {material.unit}
              </p>
            )}
          </div>

          {!isExpense && (
            <div>
              <Input
                label="Стоимость всех поступивших единиц (₽)"
                id="stock-total-cost"
                type="number"
                value={totalCost}
                onChange={(e) => setTotalCost(e.target.value)}
                min="0"
                step="0.01"
                placeholder="например, 14500"
              />
              {totalCost && delta && Number(delta) > 0 && Number(totalCost) > 0 && (
                <p className="text-xs text-text-muted mt-1">
                  Себест. за 1 {material.unit}: {formatPrice(Number(totalCost) / Number(delta))}
                </p>
              )}
              {Number(material.unit_cost) > 0 && (
                <p className="text-xs text-text-muted mt-1">
                  Текущая средняя: {formatPrice(material.unit_cost)} / {material.unit}
                </p>
              )}
            </div>
          )}

          <Input
            label="Причина"
            id="stock-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={isExpense ? 'Расход на заказ' : 'Закупка'}
          />

          <Button type="submit" loading={loading} className="w-full">
            {isExpense ? 'Списать' : 'Оприходовать'}
          </Button>
        </form>
      ) : (
        <div>
          {histLoading ? (
            <div className="flex justify-center py-8">
              <Spinner size="sm" />
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
                    {Number(t.total_cost) > 0 && (
                      <span className="text-xs text-text-muted ml-2">
                        ({formatPrice(t.total_cost)}, {formatPrice(t.unit_cost)}/{material.unit})
                      </span>
                    )}
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
    </Modal>
  )
}
