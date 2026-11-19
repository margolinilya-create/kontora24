import Input from '@/shared/components/Input'
import { toast } from '@/shared/stores/toast-store'
import {
  MAX_EDITOR_VARIANTS, resizeEditorVariants, removeVariantAt,
  checkVariantsAgainstAccounting, removeVariantBlockReason,
  buildVariantRows, variantsTotalQty,
} from '../lib/order-variants'

const SELECT_CLASS = 'w-full rounded-xl border border-border bg-surface text-text px-3.5 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent/60 focus:border-accent transition-colors'

/**
 * R27.0 (ТЗ 19.11, №5.2): виды изделий в редакторе заказа.
 * 1–9 видов; у вида размер общий (пусто) или свой, тираж — свой; «Итого».
 * Вид с учётом работы (или если после него есть вид с учётом) убрать нельзя —
 * то же правило, что в RPC replace_order_items.
 *
 * Состояние видов хранит родитель (AdminOrderEditor) — он же сохраняет.
 *
 * @param {object} props
 * @param {Array<{src_idx:number|null, width_mm:string, height_mm:string, qty:string}>} props.variants
 * @param {(next:Array) => void} props.onChange
 * @param {number|string} props.commonWidth — общий размер заказа
 * @param {number|string} props.commonHeight
 * @param {number[]} props.accounting — номера видов с учётом работы
 * @param {number} props.currentCount — сколько видов сейчас в базе
 * @param {boolean} [props.disabled]
 */
export function OrderVariantsEditor({
  variants, onChange, commonWidth, commonHeight, accounting = [], currentCount = 0, disabled = false,
}) {
  const count = variants.length
  const rows = buildVariantRows(variants, commonWidth, commonHeight)
  const total = variantsTotalQty(rows)

  function changeCount(n) {
    const next = resizeEditorVariants(variants, n, total)
    const reason = checkVariantsAgainstAccounting(next, accounting, currentCount)
    if (reason) { toast.error(reason); return }
    onChange(next)
  }

  function updateField(i, field, value) {
    onChange(variants.map((v, k) => (k === i ? { ...v, [field]: value } : v)))
  }

  function remove(i) {
    onChange(removeVariantAt(variants, i))
  }

  return (
    <div className="space-y-2">
      <div>
        <label htmlFor="admin_items_count" className="block text-sm font-medium text-text mb-1.5">Кол-во видов изделий</label>
        <select
          id="admin_items_count"
          value={count}
          disabled={disabled}
          onChange={(e) => changeCount(e.target.value)}
          className={SELECT_CLASS}
        >
          {Array.from({ length: MAX_EDITOR_VARIANTS }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      {count === 1 ? (
        <div>
          <label htmlFor="admin_qty" className="block text-sm font-medium text-text mb-1.5">Тираж, шт</label>
          <Input
            id="admin_qty"
            type="number" inputMode="numeric" min={1}
            disabled={disabled}
            value={variants[0]?.qty ?? ''}
            onChange={(e) => updateField(0, 'qty', e.target.value)}
          />
        </div>
      ) : (
        <div className="space-y-3 p-3 rounded-xl border border-border bg-surface-dim">
          <p className="text-xs text-text-muted">
            Размер вида — общий, если поля пустые. Тираж заказа = сумма тиражей видов.
          </p>
          {variants.map((v, i) => {
            const blocked = removeVariantBlockReason(variants, i, accounting, currentCount)
            return (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    Вид {i + 1}
                    {v.src_idx == null && <span className="text-xs text-text-muted ml-1">(новый)</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    disabled={disabled || !!blocked}
                    title={blocked || 'Убрать вид'}
                    className="text-xs min-h-[36px] px-2 rounded-lg text-text-muted hover:text-danger disabled:opacity-50 disabled:hover:text-text-muted"
                  >
                    Убрать
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="min-w-0">
                    <label className="block text-xs text-text-muted mb-0.5">Ширина, мм</label>
                    <Input
                      type="number" inputMode="numeric" min={1}
                      disabled={disabled}
                      placeholder={String(Number(commonWidth) || '')}
                      value={v.width_mm}
                      onChange={(e) => updateField(i, 'width_mm', e.target.value)}
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-xs text-text-muted mb-0.5">Длина, мм</label>
                    <Input
                      type="number" inputMode="numeric" min={1}
                      disabled={disabled}
                      placeholder={String(Number(commonHeight) || '')}
                      value={v.height_mm}
                      onChange={(e) => updateField(i, 'height_mm', e.target.value)}
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-xs text-text-muted mb-0.5">Тираж, шт</label>
                    <Input
                      type="number" inputMode="numeric" min={1}
                      disabled={disabled}
                      value={v.qty}
                      onChange={(e) => updateField(i, 'qty', e.target.value)}
                    />
                  </div>
                </div>
                {blocked && blocked !== 'В заказе должен остаться хотя бы один вид' && (
                  <p className="text-xs text-text-muted">{blocked}</p>
                )}
              </div>
            )
          })}
          <p className="text-sm font-medium pt-1">Итого: {total} шт</p>
        </div>
      )}
    </div>
  )
}
