// R25.6 (ТЗ 17.11, Фаза 6): попап «Создать заказ» поверх калькулятора.
// Внутри — та же форма, что на странице «Новый заказ» (CreateOrderForm),
// заполненная по таблице 6.2. Расчёт фиксируется на момент открытия и не
// меняется вслед за калькулятором. Десктоп — широкое окно с прокруткой,
// телефон — на весь экран. Закрытие с изменёнными полями — с подтверждением.
// Снимок расчёта пишется в k24_orders.calc_snapshot (финансовая колонка).

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ConfirmDialog from '@/shared/components/ConfirmDialog'
import { toast } from '@/shared/stores/toast-store'
import { supabase } from '@/shared/lib/supabase'
import { formatOrderNumber } from '@/shared/lib/utils'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { CreateOrderForm } from '@/features/orders/components/CreateOrderForm'
import { mapCalcToOrder, buildCalcSnapshot, orderPricePerUnit } from '../lib/calc-to-order'
import { buildDetailedText } from '../lib/copy-text'

/**
 * @param {Object} props
 * @param {Object} props.result — calculate() на момент нажатия кнопки
 * @param {Object|null} props.film — позиция плёнки склада
 * @param {Object|null} props.lam  — позиция ламинации склада
 * @param {Object} props.labels — { material, lamination } для текста «подробно»
 * @param {() => void} props.onClose
 */
export function CreateOrderModal({ result, film, lam, labels, onClose }) {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [dirty, setDirty] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const historyIdRef = useRef(null)
  const dialogRef = useRef(null)

  // Снимок «на момент открытия»: useState-инициализатор не пересчитывается.
  const [prepared] = useState(() => {
    const mapped = mapCalcToOrder(result, { film, lam })
    const snapshot = buildCalcSnapshot(result, {
      film, lam, labels,
      detailedText: buildDetailedText(result, labels),
      author: profile ? { id: profile.id, name: profile.display_name || null } : null,
      now: new Date(),
    })
    return {
      initialValues: { ...mapped.values, variants: mapped.variants },
      prefilledKeys: mapped.prefilledKeys,
      snapshot,
    }
  })

  // Ссылка на запись истории настроек, по которым посчитано. Читается с
  // view:finance или calc:settings (RLS 100); без права — null, не ошибка.
  useEffect(() => {
    let cancelled = false
    supabase
      .from('k24_calc_settings_history')
      .select('id')
      .lte('changed_at', prepared.snapshot.calculated_at)
      .order('changed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (!cancelled) historyIdRef.current = data?.id ?? null })
      .catch(() => { /* не критично: снимок без ссылки на историю */ })
    return () => { cancelled = true }
  }, [prepared.snapshot.calculated_at])

  const requestClose = useCallback(() => {
    if (dirty) setConfirmClose(true)
    else onClose()
  }, [dirty, onClose])

  // Esc закрывает попап, но не когда поверх открыт другой диалог (он закроется сам).
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return
      if (document.querySelectorAll('[role="dialog"]').length > 1) return
      requestClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [requestClose])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => { document.body.style.overflow = prev }
  }, [])

  const buildExtraOrderData = useCallback((values, payload) => {
    const calc_snapshot = { ...prepared.snapshot, settings_history_id: historyIdRef.current }
    const extra = { calc_snapshot }
    if (payload.price_final != null) {
      const ppu = orderPricePerUnit(calc_snapshot, payload.price_final, payload.qty)
      if (ppu != null) extra.price_per_unit = ppu
    }
    return extra
  }, [prepared.snapshot])

  function handleCreated(order) {
    const label = `Заказ #${formatOrderNumber(order)} создан`
    toast.success(
      <span>
        {label}{' · '}
        <button type="button" className="underline font-semibold" onClick={() => navigate(`/orders/${order.id}`)}>
          открыть
        </button>
      </span>,
    )
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center sm:items-center sm:p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={requestClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="calc-create-order-title"
        tabIndex={-1}
        className="relative flex flex-col w-full h-full bg-surface-dim sm:h-auto sm:max-h-[95vh] sm:max-w-6xl sm:rounded-2xl sm:border sm:border-border shadow-modal focus:outline-none"
      >
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-border bg-surface sm:rounded-t-2xl">
          <div className="min-w-0">
            <h2 id="calc-create-order-title" className="text-lg font-semibold tracking-tight">Новый заказ из расчёта</h2>
            <p className="text-xs text-text-muted truncate">
              {result.productLabel} · {result.input.widthMm}×{result.input.heightMm} мм · допишите заказчика, срок и сделку
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Закрыть"
            className="shrink-0 text-text-muted hover:text-text hover:bg-surface-2 transition-colors rounded-lg w-11 h-11 flex items-center justify-center text-xl leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            &#215;
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
          <CreateOrderForm
            variant="modal"
            initialValues={prepared.initialValues}
            prefilledKeys={prepared.prefilledKeys}
            buildExtraOrderData={buildExtraOrderData}
            onDirtyChange={setDirty}
            onCreated={handleCreated}
            onCancel={requestClose}
          />
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={() => { setConfirmClose(false); onClose() }}
        title="Закрыть без сохранения?"
        message="Изменения в форме заказа будут потеряны. Расчёт в калькуляторе останется."
        confirmText="Закрыть"
        variant="danger"
      />
    </div>
  )
}
