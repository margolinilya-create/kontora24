import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { calculate } from '../lib/calculator'
import { createOrder } from '@/features/orders/hooks/useOrders'
import { ORDER_TYPES, VOLUME_DISCOUNTS, PRIORITIES } from '@/shared/constants'
import { toast } from '@/shared/stores/toast-store'
import { formatPrice, formatNumber } from '@/shared/lib/utils'
import { LayoutPreview } from '../components/LayoutPreview'
import { CompareMode } from '../components/CompareMode'
import { CalcHistory } from '../components/CalcHistory'
import { saveCalcToHistory } from '../lib/calc-history'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'

const INITIAL = {
  orderType: 'sticker_cut',
  width: 50,
  height: 50,
  qty: 100,
  needLam: false,
  lamType: 'glossy',
  designVariants: 1,
  clientName: '',
  deadline: '',
  notes: '',
  priority: 'normal',
}

const PRESETS = [
  { label: '50×50', width: 50, height: 50 },
  { label: '70×70', width: 70, height: 70 },
  { label: '90×50', width: 90, height: 50 },
  { label: '100×100', width: 100, height: 100 },
  { label: '150×150', width: 150, height: 150 },
]

export default function CalculatorPage() {
  const [searchParams] = useSearchParams()
  const initialFromParams = {
    ...INITIAL,
    ...(searchParams.get('width') && { width: Number(searchParams.get('width')) }),
    ...(searchParams.get('height') && { height: Number(searchParams.get('height')) }),
    ...(searchParams.get('qty') && { qty: Number(searchParams.get('qty')) }),
    ...(searchParams.get('type') && { orderType: searchParams.get('type') }),
  }
  const [form, setForm] = useState(initialFromParams)
  const navigate = useNavigate()

  const is3D = form.orderType === 'sticker3D' || form.orderType === 'stickerpack3D'

  const result = useMemo(
    () => calculate({
      width: Number(form.width) || 0,
      height: Number(form.height) || 0,
      qty: Number(form.qty) || 1,
      orderType: form.orderType,
      needLam: form.needLam,
      is3D,
    }),
    [form.width, form.height, form.qty, form.orderType, form.needLam, is3D]
  )

  function update(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const [creating, setCreating] = useState(false)

  async function handleCreateOrder() {
    setCreating(true)
    try {
      const order = await createOrder({
        order_type: form.orderType,
        width_mm: Number(form.width),
        height_mm: Number(form.height),
        qty: Number(form.qty),
        design_variants: Number(form.designVariants) || 1,
        need_lam: form.needLam,
        cost_materials: result.costMaterials,
        cost_labor: result.costLabor,
        cost_total: result.costTotal,
        markup: result.markup,
        discount_pct: result.discount,
        price_final: result.priceFinal,
        price_per_unit: result.pricePerUnit,
        prod_days: result.prodDays,
        client_name: form.clientName || null,
        deadline: form.deadline || null,
        notes: form.notes || null,
        priority: form.priority || 'normal',
      })
      saveCalcToHistory(form, result)
      toast.success('Заказ успешно создан')
      navigate(`/orders/${order.id}`)
    } catch (err) {
      toast.error('Ошибка создания заказа: ' + err.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Калькулятор</h1>
        <p className="text-text-muted">Рассчитайте стоимость заказа</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input form */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
            <h2 className="font-semibold">Параметры</h2>

            {/* Order type */}
            <div>
              <label htmlFor="calc-order-type" className="block text-sm font-medium mb-1.5">Тип продукции</label>
              <select
                id="calc-order-type"
                value={form.orderType}
                onChange={(e) => update('orderType', e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
              >
                {Object.entries(ORDER_TYPES).map(([key, t]) => (
                  <option key={key} value={key}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Presets */}
            <div>
              <label className="block text-sm font-medium mb-1.5">Быстрый размер</label>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => { update('width', p.width); update('height', p.height) }}
                    className={`px-2.5 py-1 rounded text-xs transition-colors ${
                      Number(form.width) === p.width && Number(form.height) === p.height
                        ? 'bg-accent text-white' : 'bg-surface-dim text-text-muted hover:bg-border'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dimensions */}
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Ширина, мм"
                id="calc-width"
                type="number"
                value={form.width}
                onChange={(e) => update('width', e.target.value)}
                min="1"
              />
              <Input
                label="Высота, мм"
                id="calc-height"
                type="number"
                value={form.height}
                onChange={(e) => update('height', e.target.value)}
                min="1"
              />
            </div>

            {/* Quantity */}
            <Input
              label={<>Тираж{result.discount > 0 && <span className="ml-2 text-success text-xs">-{(result.discount * 100).toFixed(0)}% скидка</span>}</>}
              id="calc-qty"
              type="number"
              value={form.qty}
              onChange={(e) => update('qty', e.target.value)}
              min="1"
            />

            {/* Design variants */}
            <Input
              label="Кол-во видов"
              id="calc-variants"
              type="number"
              value={form.designVariants}
              onChange={(e) => update('designVariants', e.target.value)}
              min="1"
            />

            {/* Lamination */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.needLam}
                onChange={(e) => update('needLam', e.target.checked)}
                className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
              />
              <span className="text-sm">Ламинация</span>
            </label>

            {/* Lamination type */}
            {form.needLam && (
              <div>
                <label htmlFor="calc-lam-type" className="block text-sm font-medium mb-1.5">Тип ламинации</label>
                <select
                  id="calc-lam-type"
                  value={form.lamType}
                  onChange={(e) => update('lamType', e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                >
                  <option value="glossy">Глянцевая</option>
                  <option value="matte">Матовая</option>
                </select>
              </div>
            )}

            {/* Client name */}
            <Input
              label="Клиент"
              id="calc-client"
              type="text"
              value={form.clientName}
              onChange={(e) => update('clientName', e.target.value)}
              placeholder="Имя клиента..."
            />

            {/* Deadline */}
            <Input
              label="Дедлайн"
              id="calc-deadline"
              type="date"
              value={form.deadline}
              onChange={(e) => update('deadline', e.target.value)}
            />

            {/* Priority */}
            <div>
              <label htmlFor="calc-priority" className="block text-sm font-medium mb-1.5">Приоритет</label>
              <select
                id="calc-priority"
                value={form.priority}
                onChange={(e) => update('priority', e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
              >
                {Object.entries(PRIORITIES).map(([key, p]) => (
                  <option key={key} value={key}>{p.label}</option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div>
              <label htmlFor="calc-notes" className="block text-sm font-medium mb-1.5">Заметки</label>
              <textarea
                id="calc-notes"
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                placeholder="Пожелания клиента..."
                rows={3}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none"
              />
            </div>

            <Button
              variant="secondary"
              onClick={() => setForm(INITIAL)}
              className="w-full"
            >
              Сброс
            </Button>
          </div>

          {/* Volume discount table */}
          <div className="bg-surface rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold mb-3">Скидки за объём</h3>
            <div className="space-y-1">
              {VOLUME_DISCOUNTS.map((d) => {
                const isActive = form.qty >= d.min && form.qty <= d.max
                return (
                  <div
                    key={d.min}
                    className={`flex justify-between text-xs px-2 py-1 rounded ${
                      isActive ? 'bg-success/10 text-success font-medium' : 'text-text-muted'
                    }`}
                  >
                    <span>{d.max === Infinity ? `${d.min}+` : `${d.min}–${d.max}`} шт</span>
                    <span>{d.discount === 0 ? '—' : `-${(d.discount * 100).toFixed(0)}%`}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Layout preview */}
        <LayoutPreview width={Number(form.width)} height={Number(form.height)} itemsPerSheet={result.itemsPerSheet} sheets={result.sheets} />

        {/* Compare mode */}
        <CompareMode baseForm={form} />

        {/* Calc history */}
        <CalcHistory onRestore={(restored) => setForm({ ...INITIAL, ...restored })} />

        {/* Results */}
        <div className="lg:col-span-2 space-y-4">
          {/* Price card - sticky CTA */}
          <div className="bg-primary text-white rounded-xl p-6 sticky bottom-4 z-10">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
              <div>
                <p className="text-white/60 text-sm">Цена за тираж</p>
                <p className="text-3xl font-bold mt-1">{formatPrice(result.priceFinal)}</p>
              </div>
              <div>
                <p className="text-white/60 text-sm">Цена за штуку</p>
                <p className="text-2xl font-bold mt-1">{formatPrice(result.pricePerUnit)}</p>
              </div>
              <div>
                <p className="text-white/60 text-sm">Срок</p>
                <p className="text-2xl font-bold mt-1">{result.prodDays} дн.</p>
              </div>
            </div>

            <Button
              size="lg"
              onClick={handleCreateOrder}
              loading={creating}
              className="mt-6 w-full"
            >
              Оформить заказ
            </Button>
          </div>

          {/* Cost breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-surface rounded-xl border border-border p-5">
              <h3 className="font-semibold mb-3">Материалы</h3>
              <div className="space-y-2 text-sm">
                <Row label="Плёнка" value={formatPrice(result.costFilm)} sub={`${formatNumber(result.filmM2, 3)} м²`} />
                <Row label="Краска" value={formatPrice(result.costInk)} sub={`${formatNumber(result.inkM2, 3)} м²`} />
                {form.needLam && <Row label="Ламинация" value={formatPrice(result.costLam)} sub={`${formatNumber(result.lamM2, 3)} м²`} />}
                {is3D && <Row label="Смола" value={formatPrice(result.costResin)} sub={`${formatNumber(result.resinG, 1)} г`} />}
                <div className="border-t border-border pt-2 flex justify-between font-medium">
                  <span>Итого материалы</span>
                  <span>{formatPrice(result.costMaterials)}</span>
                </div>
              </div>
            </div>

            <div className="bg-surface rounded-xl border border-border p-5">
              <h3 className="font-semibold mb-3">Производство</h3>
              <div className="space-y-2 text-sm">
                <Row label="Раскладка" value={`${result.itemsPerSheet} шт/лист`} sub={`${result.sheets} листов`} />
                <Row label="Резка" value={`${formatNumber(result.cutTimeHours)} ч`} />
                {form.needLam && <Row label="Ламинация" value={`${formatNumber(result.lamTimeHours)} ч`} />}
                {is3D && <Row label="Заливка смолой" value={`${formatNumber(result.resinTimeHours)} ч`} />}
                <div className="border-t border-border pt-2 flex justify-between font-medium">
                  <span>Труд ({formatNumber(result.totalHours)} ч)</span>
                  <span>{formatPrice(result.costLabor)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-surface rounded-xl border border-border p-5">
            <h3 className="font-semibold mb-3">Итог</h3>
            <div className="space-y-2 text-sm">
              <Row label="Себестоимость" value={formatPrice(result.costTotal)} />
              <Row label={`Наценка x${result.markup}`} value={formatPrice(result.costTotal * result.markup)} />
              {result.discount > 0 && (
                <Row
                  label={`Скидка -${(result.discount * 100).toFixed(0)}%`}
                  value={`-${formatPrice(result.costTotal * result.markup * result.discount)}`}
                  className="text-success"
                />
              )}
              <div className="border-t border-border pt-2 flex justify-between font-bold text-base">
                <span>Итого</span>
                <span>{formatPrice(result.priceFinal)}</span>
              </div>
              <div className="flex justify-between text-text-muted">
                <span>Маржа</span>
                <span>{formatPrice(result.margin)} ({result.marginPct}%)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, sub, className = '' }) {
  return (
    <div className={`flex justify-between items-baseline ${className}`}>
      <span className="text-text-muted">{label}</span>
      <div className="text-right">
        <span>{value}</span>
        {sub && <span className="block text-xs text-text-muted">{sub}</span>}
      </div>
    </div>
  )
}
