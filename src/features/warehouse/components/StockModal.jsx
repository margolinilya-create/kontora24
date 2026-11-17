import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { addMaterialTransaction, updateMaterial } from '../hooks/useMaterials'
import { useMovementsList, fetchAllMovements, useSupplierSuggestions } from '../hooks/useWarehouseJournal'
import {
  moscowDateString, enteredOnOtherDay, buildHistoryAoa, buildParamsAoa,
  serializeJournalFilters, DEFAULT_JOURNAL_FILTERS,
} from '../lib/warehouse-journal'
import { OperationKindBadge } from './OperationKindBadge'
import { ClarifyOperationModal } from './ClarifyOperationModal'
import { ExportProgressButton } from './ExportProgressButton'
import { supabase } from '@/shared/lib/supabase'
import { downloadXlsxBook } from '@/shared/lib/export-xlsx'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { formatNumber, formatPrice, formatDate, formatQty } from '@/shared/lib/utils'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import { useAuth } from '@/features/auth/hooks/useAuth'
import Modal from '@/shared/components/Modal'
import Input from '@/shared/components/Input'
import Button from '@/shared/components/Button'
import Spinner from '@/shared/components/Spinner'

/** Найти заказ по номеру (number или custom_number) → id. */
async function resolveOrderId(raw) {
  const v = String(raw || '').trim().replace(/^#/, '')
  if (!v) return null
  let q = supabase.from('k24_orders').select('id').limit(1)
  q = /^\d+$/.test(v) ? q.or(`number.eq.${v},custom_number.eq.${v}`) : q.eq('custom_number', v)
  const { data, error } = await q
  if (error) throw error
  if (!data?.length) {
    const e = new Error(`Заказ ${v} не найден`)
    e.code = 'ORDER_NOT_FOUND'
    throw e
  }
  return data[0].id
}

/**
 * R25.8 (ТЗ 8.2, 8.5): карточка позиции — приход / расход и полная история.
 */
export function StockModal({ material, onClose, onDone }) {
  const [tab, setTab] = useState('form') // 'form' | 'history'
  const historyFilters = useMemo(() => ({ material_id: material.id }), [material.id])
  const history = useMovementsList(historyFilters, 'date_desc')

  return (
    <Modal isOpen={true} onClose={onClose} title={material.name} maxWidth="max-w-2xl">
      <div className="text-sm text-text-muted mb-4 space-y-0.5">
        <p>
          Остаток: <span className="font-semibold text-text">{formatNumber(material.stock_qty, 3)} {material.unit}</span>
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
          История{history.total != null ? ` (${formatQty(history.total, 0)})` : ''}
        </button>
      </div>

      {tab === 'form'
        ? <StockForm material={material} onDone={onDone} />
        : <MaterialHistory material={material} history={history} onClose={onClose} />}
    </Modal>
  )
}

function StockForm({ material, onDone }) {
  const today = moscowDateString()
  const canTransact = useCanDo('material:add_transaction')
  const canSeeFinance = useCanDo('view:finance')
  const canEditMaterial = useCanDo('material:archive') // «Архивировать/редактировать позиции склада»
  const suppliers = useSupplierSuggestions(true)
  const [isExpense, setIsExpense] = useState(false)
  const [loading, setLoading] = useState(false)
  const [askRemember, setAskRemember] = useState(null) // supplier string | null
  const [form, setForm] = useState({
    qty: '', totalCost: '', opDate: today, supplier: material.supplier || '', docNumber: '', comment: '', order: '',
  })
  function update(k, v) { setForm((p) => ({ ...p, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canTransact) {
      toast.error('Нет прав на внесение прихода/расхода')
      return
    }
    const num = Number(form.qty)
    if (!num || num <= 0) return
    if (isExpense && !form.comment.trim()) {
      toast.error('Укажите, на что списано')
      return
    }
    if (!isExpense && (!form.opDate || form.opDate > today)) {
      toast.error('Дата поступления не может быть позже сегодняшней')
      return
    }

    setLoading(true)
    try {
      if (isExpense) {
        const orderId = await resolveOrderId(form.order)
        await addMaterialTransaction({
          materialId: material.id,
          delta: -num,
          kind: 'manual_consumption',
          reason: form.comment.trim(),
          orderId,
        })
        toast.success('Списано')
        onDone()
        return
      }
      const supplier = form.supplier.trim()
      await addMaterialTransaction({
        materialId: material.id,
        delta: num,
        kind: 'purchase',
        reason: form.comment.trim() || null,
        totalCost: form.totalCost !== '' ? form.totalCost : null,
        opDate: form.opDate,
        supplier,
        docNumber: form.docNumber.trim(),
      })
      toast.success('Оприходовано')
      if (supplier && !material.supplier && canEditMaterial) {
        setAskRemember(supplier)
        return
      }
      onDone()
    } catch (err) {
      toast.error(err?.code === 'ORDER_NOT_FOUND' ? err.message : translateError(err).message)
    } finally {
      setLoading(false)
    }
  }

  async function rememberSupplier() {
    try {
      await updateMaterial(material.id, { supplier: askRemember })
      toast.success('Поставщик сохранён в карточке позиции')
    } catch (err) {
      toast.error(translateError(err).message)
    }
    onDone()
  }

  if (askRemember) {
    return (
      <div className="space-y-4 text-sm">
        <p>Запомнить поставщика «{askRemember}» для позиции? Он будет подставляться в следующие приходы.</p>
        <div className="flex gap-2">
          <Button onClick={rememberSupplier} className="flex-1">Запомнить поставщика</Button>
          <Button variant="secondary" onClick={onDone} className="flex-1">Не нужно</Button>
        </div>
      </div>
    )
  }

  const qtyNum = Number(form.qty)
  return (
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
          value={form.qty}
          onChange={(e) => update('qty', e.target.value)}
          min="0.001"
          step="any"
          required
          placeholder="0"
          autoFocus
        />
        {form.qty && (
          <p className="text-xs text-text-muted mt-1">
            После: {formatNumber(Number(material.stock_qty) + (isExpense ? -qtyNum : qtyNum), 3)} {material.unit}
          </p>
        )}
      </div>

      {!isExpense ? (
        <>
          {/* Сумму вводят все, кто вносит приход (накладная в руках, без неё
              средняя цена перестанет обновляться). Подсказки с ценами — только
              с правом «Видеть финансы» (ТЗ 8.2). */}
          <div>
            <Input
              label="Сумма по накладной (₽)"
              id="stock-total-cost"
              type="number"
              value={form.totalCost}
              onChange={(e) => update('totalCost', e.target.value)}
              min="0"
              step="0.01"
              placeholder="например, 14500"
            />
            {canSeeFinance && form.totalCost && qtyNum > 0 && Number(form.totalCost) > 0 && (
              <p className="text-xs text-text-muted mt-1">
                Себест. за 1 {material.unit}: {formatPrice(Number(form.totalCost) / qtyNum)}
              </p>
            )}
            {canSeeFinance && Number(material.unit_cost) > 0 && (
              <p className="text-xs text-text-muted mt-1">
                Текущая средняя: {formatPrice(material.unit_cost)} / {material.unit}
              </p>
            )}
          </div>
          <Input
            label="Дата поступления"
            id="stock-op-date"
            type="date"
            value={form.opDate}
            max={today}
            onChange={(e) => update('opDate', e.target.value)}
            required
          />
          <div>
            <Input
              label="Поставщик"
              id="stock-supplier"
              value={form.supplier}
              onChange={(e) => update('supplier', e.target.value)}
              list="stock-supplier-list"
              autoComplete="off"
            />
            <datalist id="stock-supplier-list">
              {suppliers.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          <Input
            label="№ документа"
            id="stock-doc"
            value={form.docNumber}
            onChange={(e) => update('docNumber', e.target.value)}
            placeholder="Накладная, УПД или счёт"
          />
          <Input
            label="Комментарий"
            id="stock-comment"
            value={form.comment}
            onChange={(e) => update('comment', e.target.value)}
          />
        </>
      ) : (
        <>
          <Input
            label="Заказ (необязательно)"
            id="stock-order"
            value={form.order}
            onChange={(e) => update('order', e.target.value)}
            placeholder="Номер заказа"
            inputMode="numeric"
          />
          <Input
            label="На что списано"
            id="stock-comment"
            value={form.comment}
            onChange={(e) => update('comment', e.target.value)}
            required
            placeholder="Например: настройка реза"
          />
        </>
      )}

      <Button type="submit" loading={loading} className="w-full">
        {isExpense ? 'Списать' : 'Оприходовать'}
      </Button>
    </form>
  )
}

function MaterialHistory({ material, history, onClose }) {
  const navigate = useNavigate()
  const canSeeFinance = useCanDo('view:finance')
  const canEditOps = useCanDo('warehouse:edit_operation')
  const { profile } = useAuth()
  const [clarify, setClarify] = useState(null)
  const { rows, total, loading, loadingMore, error, hasMore, loadMore, reload } = history
  const sentinelRef = useRef(null)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore()
    }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [loadMore, rows.length])

  function openInJournal() {
    const qs = new URLSearchParams(serializeJournalFilters({ ...DEFAULT_JOURNAL_FILTERS, material: material.id }, { tab: 'journal' }))
    onClose()
    navigate(`/warehouse?${qs.toString()}`)
  }

  async function runExport(onProgress) {
    const all = await fetchAllMovements({ material_id: material.id }, 'date_desc', { total: total ?? undefined, onProgress })
    await downloadXlsxBook(`Склад — ${material.name} ${moscowDateString().split('-').reverse().join('.')}`, [
      { name: 'История', aoa: buildHistoryAoa(all, { showMoney: canSeeFinance }) },
      { name: 'Параметры', aoa: buildParamsAoa([['Позиция', material.name], ['Единица', material.unit], ['Текущий остаток', material.stock_qty]], { user: profile?.display_name }) },
    ])
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        <button type="button" onClick={openInJournal} className="text-sm px-3 py-2 rounded-lg border border-border hover:bg-surface-2">
          Открыть в журнале
        </button>
        <ExportProgressButton run={runExport} disabled={!total} />
      </div>
      {loading ? (
        <div className="flex justify-center py-8"><Spinner size="sm" /></div>
      ) : error ? (
        <p className="text-sm text-danger py-4">{translateError(error).message}</p>
      ) : rows.length === 0 ? (
        <p className="text-text-muted text-sm text-center py-8">Нет операций</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((t) => {
            const d = Number(t.delta)
            return (
              <li key={t.id} className="py-2.5 text-sm flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-medium tabular-nums ${d >= 0 ? 'text-success' : 'text-danger'}`}>
                      {d > 0 ? '+' : d < 0 ? '−' : ''}{formatNumber(Math.abs(d), 3)} {material.unit}
                    </span>
                    <OperationKindBadge kind={t.kind} isAuto={t.is_auto} needsReview={t.needs_review} />
                  </div>
                  <p className="text-xs text-text-muted mt-0.5">
                    {[t.supplier, t.doc_number && `№ ${t.doc_number}`, t.reason, t.order_number != null && `заказ #${t.order_custom_number || t.order_number}`]
                      .filter(Boolean).join(' · ') || '—'}
                  </p>
                  {canSeeFinance && t.total_cost != null && (
                    <p className="text-xs text-text-muted">
                      {formatPrice(t.total_cost)}{t.unit_cost != null ? `, ${formatPrice(t.unit_cost)}/${material.unit}` : ''}
                    </p>
                  )}
                  <p className="text-xs text-text-muted">{t.created_by_name || (t.is_auto ? 'Система' : '—')}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs whitespace-nowrap">{formatDate(t.op_date)}</p>
                  {enteredOnOtherDay(t) && (
                    <p className="text-[11px] text-text-muted whitespace-nowrap">внесено {formatDate(t.created_at)}</p>
                  )}
                  <p className="text-xs text-text-muted whitespace-nowrap tabular-nums" title="Остаток после операции">
                    ост. {formatNumber(t.balance_after, 3)}
                  </p>
                  {canEditOps && !t.is_auto && (
                    <button type="button" onClick={() => setClarify(t)} className="text-xs text-accent hover:underline">
                      Уточнить
                    </button>
                  )}
                </div>
              </li>
            )
          })}
          <li ref={sentinelRef} className="h-1" aria-hidden="true" />
          {loadingMore && <li className="flex justify-center py-3"><Spinner size="sm" /></li>}
          {!hasMore && <li className="text-center text-xs text-text-muted py-3">Все операции позиции</li>}
        </ul>
      )}
      {clarify && (
        <ClarifyOperationModal
          operation={clarify}
          onClose={() => setClarify(null)}
          onSaved={() => { setClarify(null); reload() }}
        />
      )}
    </div>
  )
}
