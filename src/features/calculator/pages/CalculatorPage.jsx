// R25.5 (ТЗ 17.11, Фаза 5): калькулятор стоимости. Формулы — lib/calc.js
// (сверены с порталом ОП v2.0 до рубля), настройки — общие в БД.
// Десктоп: слева ввод, справа результат. Телефон: блоки друг под другом,
// внизу закреплённая полоса «Итого · Скопировать».
// Себестоимость и наценка видны только с view:finance и скрываются кнопкой-глазом
// (запоминается для пользователя в localStorage — per-viewer удобство).

import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'
import Tabs from '@/shared/components/Tabs'
import { Skeleton } from '@/shared/components/Skeleton'
import ErrorState from '@/shared/components/ErrorState'
import { toast } from '@/shared/stores/toast-store'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import { useCalculatorSettings } from '../hooks/useCalculatorSettings'
import {
  calculate, optionDeltas, priceTiers, splitQty, clampQty, sumViews, clampManualHours,
  MIN_QTY, MAX_QTY, MAX_VIEWS, OPTION_LABELS,
  MANUAL_HOURS_MIN, MANUAL_HOURS_MAX, MANUAL_HOURS_STEP, MANUAL_HOURS_DEFAULT,
} from '../lib/calc'
import {
  groupMaterials, resolveMaterial, resolvePrice, materialDisplayName, resolveNfc,
  laminationOptions, laminationDisplayName,
} from '../lib/materials'
import {
  buildShortText, buildDetailedText, buildOptionLines, formatInt, formatPrice, formatRub, formatArea,
  formatHours,
} from '../lib/copy-text'
import { OptionToggle } from '../components/OptionToggle'
import { PriceTiersTable } from '../components/PriceTiersTable'
import { CopyButton } from '../components/CopyButton'
import { CreateOrderModal } from '../components/CreateOrderModal'

const PRODUCT_TABS = [
  { key: 'sticker', label: 'Стикер' },
  { key: 'pack', label: 'Стикерпак' },
]

const SIZE_PRESETS = {
  sticker: [
    { label: '30×30', w: 30, h: 30 },
    { label: '50×50', w: 50, h: 50 },
    { label: '100×100', w: 100, h: 100 },
  ],
  pack: [
    { label: 'А6 (105×148)', w: 105, h: 148 },
    { label: 'А5 (148×210)', w: 148, h: 210 },
  ],
}

const OPTION_HINTS = {
  montage: 'Не наценивается',
  bag: '₽ за штуку',
  nfc: 'Метка в каждое изделие',
  manual: 'Часы × ставка, не наценивается',
}

const SELECT_CLASS = 'w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent/60'

const EMPTY_OPTIONS = {
  resin3d: false, lamination: false, montage: false, urgent: false, bag: false,
  partner: false, cut: false, nfc: false, design: false, designEdit: false, manual: false,
}

const fmtCm2 = (v) => (Math.round(v * 10000) / 10000).toString().replace('.', ',')

function hideCostKey(userId) {
  return `k24:calc:hide-cost:${userId || 'anon'}`
}

function readHideCost(userId) {
  try { return globalThis.localStorage?.getItem(hideCostKey(userId)) === '1' } catch { return false }
}

function writeHideCost(userId, v) {
  try { globalThis.localStorage?.setItem(hideCostKey(userId), v ? '1' : '0') } catch { /* приватный режим */ }
}

function toInt(v) {
  const n = parseInt(String(v).replace(/\D/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}

export default function CalculatorPage() {
  const { profile } = useAuth()
  const canFinance = useCanDo('view:finance')
  const canCreateOrder = useCanDo('order:create')
  const {
    settings, films, laminations, materials, prices, nfcRow, loading, error, refetch,
  } = useCalculatorSettings()
  // R25.6: «Открыть в калькуляторе» из вкладки «Финансы» заказа передаёт
  // восстановленный расчёт через state роутера (restoreCalcState).
  const location = useLocation()
  const [restored] = useState(() => location.state?.calcRestore || null)

  const [product, setProduct] = useState(restored?.product || 'sticker')
  const [width, setWidth] = useState(restored?.width || '100')
  const [height, setHeight] = useState(restored?.height || '100')
  const [filmId, setFilmId] = useState(restored?.filmId || null)
  const [lamId, setLamId] = useState(restored?.lamId || null)
  const [qtyText, setQtyText] = useState(restored ? String(sumViews(restored.views)) : '500')
  const [views, setViews] = useState(restored?.views || [500])
  const [viewTexts, setViewTexts] = useState(restored ? restored.views.map(String) : ['500'])
  const [options, setOptions] = useState(restored ? { ...EMPTY_OPTIONS, ...restored.options } : EMPTY_OPTIONS)
  const [manualHours, setManualHours] = useState(restored?.manualHours ?? MANUAL_HOURS_DEFAULT)
  const [manualText, setManualText] = useState(() => formatHours(restored?.manualHours ?? MANUAL_HOURS_DEFAULT))
  const [createOpen, setCreateOpen] = useState(false)
  const [hideCost, setHideCost] = useState(() => readHideCost(profile?.id))

  useEffect(() => { setHideCost(readHideCost(profile?.id)) }, [profile?.id])

  const materialGroups = useMemo(() => groupMaterials(films, prices, settings), [films, prices, settings])
  const film = resolveMaterial(films, prices, settings, filmId, settings.default_film_id)
  const filmPrice = resolvePrice(film, prices, settings)
  const nfc = useMemo(() => resolveNfc(settings, nfcRow, materials), [settings, nfcRow, materials])
  const lamOptions = useMemo(() => laminationOptions(laminations), [laminations])
  const lam = lamOptions.find((l) => l.id === lamId) || lamOptions[0] || null

  const viewsCount = views.length
  const qty = sumViews(views)

  const input = useMemo(() => ({
    product,
    widthMm: toInt(width),
    heightMm: toInt(height),
    filmGroup: film?.calc_price_group || 'white',
    materialPriceCm2: filmPrice.source === 'warehouse' ? filmPrice.priceCm2Raw : null,
    nfcPrice: nfc.available ? nfc.price : null,
    manualHours,
    views,
    options,
  }), [product, width, height, film?.calc_price_group, filmPrice.source, filmPrice.priceCm2Raw,
    nfc.available, nfc.price, manualHours, views, options])

  const result = useMemo(() => calculate(input, settings), [input, settings])
  const deltas = useMemo(() => optionDeltas(input, settings), [input, settings])
  const tiers = useMemo(() => priceTiers(input, settings), [input, settings])

  const showCost = canFinance && !hideCost
  const sizeValid = input.widthMm > 0 && input.heightMm > 0
  const qtyValid = qty >= MIN_QTY
  const ready = sizeValid && qtyValid && !!film

  const labels = { material: materialDisplayName(film), lamination: laminationDisplayName(lam) }
  const optionLines = buildOptionLines(result, settings)
  const nfcShort = nfc.available && options.nfc && nfc.stock != null && nfc.stock < qty

  // --- handlers ------------------------------------------------------------
  function setOption(key, value) {
    setOptions((prev) => ({ ...prev, [key]: value }))
  }

  function changeProduct(next) {
    setProduct(next)
    if (next === 'pack') setOptions((prev) => ({ ...prev, cut: false }))
  }

  function applyPreset(p) {
    setWidth(String(p.w))
    setHeight(String(p.h))
  }

  function setAllViews(next) {
    setViews(next)
    setViewTexts(next.map(String))
  }

  function onQtyChange(e) {
    const text = e.target.value.replace(/\D/g, '').slice(0, 5)
    setQtyText(text)
    // Ввод с любой цифры («1» → «15» → «150»): нормализация только на blur.
    setAllViews([Math.min(toInt(text), MAX_QTY)])
  }

  function onQtyBlur() {
    if (viewsCount > 1) return // тираж = сумма видов, поле только для чтения
    const n = toInt(qtyText)
    const clamped = clampQty(n)
    if (n < MIN_QTY) toast.info('Минимальный тираж — 20 шт')
    setQtyText(String(clamped))
    setAllViews([clamped])
  }

  function onSlider(e) {
    const n = clampQty(e.target.value)
    setQtyText(String(n))
    setAllViews([n])
  }

  function changeViewsCount(nextCount) {
    const n = Math.min(Math.max(1, nextCount), MAX_VIEWS)
    if (n === viewsCount) return
    const total = Math.max(qty, MIN_QTY)
    const next = n === 1 ? [total] : splitQty(Math.max(total, n), n)
    setAllViews(next)
    setQtyText(String(sumViews(next)))
  }

  function onViewChange(idx, text) {
    const clean = text.replace(/\D/g, '').slice(0, 5)
    const next = views.map((v, i) => (i === idx ? toInt(clean) : v))
    setViewTexts((prev) => prev.map((t, i) => (i === idx ? clean : t)))
    setViews(next)
    setQtyText(String(sumViews(next)))
  }

  function onViewBlur(idx) {
    const v = Math.max(1, toInt(viewTexts[idx]))
    const next = views.map((x, i) => (i === idx ? v : x))
    setAllViews(next)
    setQtyText(String(sumViews(next)))
    if (sumViews(next) < MIN_QTY) toast.info('Минимальный тираж — 20 шт')
  }

  function onManualChange(e) {
    setManualText(e.target.value.replace(/[^\d.,]/g, '').slice(0, 5))
  }

  function onManualBlur() {
    const h = clampManualHours(manualText)
    setManualHours(h)
    setManualText(formatHours(h))
  }

  function toggleHideCost() {
    const v = !hideCost
    setHideCost(v)
    writeHideCost(profile?.id, v)
  }

  // --- render --------------------------------------------------------------
  if (error) return <ErrorState error={error} onRetry={refetch} />

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    )
  }

  // Порядок переключателей = порядок строк «Дополнительно:» в тексте клиенту.
  const optionKeys = [
    'resin3d', 'lamination', 'montage', 'urgent', 'bag', 'partner',
    ...(product === 'sticker' ? ['cut'] : []), 'nfc', 'design', 'designEdit', 'manual',
  ]

  return (
    <div className="space-y-4 min-w-0">
      <div>
        <h1 className="text-2xl font-bold font-display tracking-tight">Калькулятор</h1>
        <p className="text-text-muted text-sm">Стоимость тиража по общим ставкам — для расчёта клиенту</p>
      </div>

      {/* grid-cols-1 (= minmax(0,1fr)): без шаблона неявная колонка растягивалась
          по таблице «Цены по тиражам» → +74px горизонтальной прокрутки на 375px. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)] items-start">
        {/* ------------------------------------------------ Ввод */}
        <section aria-label="Параметры расчёта" className="space-y-4 min-w-0">
          <div className="bg-surface rounded-2xl border border-border p-4 space-y-4">
            <div>
              <p className="text-sm font-medium mb-1.5">Тип продукции</p>
              <Tabs items={PRODUCT_TABS} active={product} onChange={changeProduct} />
            </div>

            <div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Ширина, мм" inputMode="numeric" value={width}
                  onChange={(e) => setWidth(e.target.value.replace(/\D/g, '').slice(0, 4))} />
                <Input label="Длина, мм" inputMode="numeric" value={height}
                  onChange={(e) => setHeight(e.target.value.replace(/\D/g, '').slice(0, 4))} />
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {SIZE_PRESETS[product].map((p) => {
                  const active = input.widthMm === p.w && input.heightMm === p.h
                  return (
                    <button key={p.label} type="button" onClick={() => applyPreset(p)}
                      className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-medium border transition-colors ${
                        active ? 'bg-accent border-accent text-on-accent' : 'bg-surface border-border text-text-muted hover:text-text'
                      }`}>
                      {p.label}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-text-muted mt-2">
                Площадь: {sizeValid ? `${formatArea(result.areaCm2)} см²` : '—'}
              </p>
            </div>

            <div>
              <label htmlFor="calc-film" className="block text-sm font-medium mb-1.5">Материал</label>
              {materialGroups.length === 0 ? (
                <p className="text-sm text-danger">
                  Материалы не настроены для калькулятора — назначьте ценовые группы или цену склада в «Настройки → Калькулятор».
                </p>
              ) : (
                <select id="calc-film" className={SELECT_CLASS} value={film?.id || ''} onChange={(e) => setFilmId(e.target.value)}>
                  {!film && <option value="" disabled>Нет материала с ценой</option>}
                  {materialGroups.map((g) => (
                    <optgroup key={g.key} label={g.label}>
                      {g.items.map((m) => (
                        <option key={m.id} value={m.id} disabled={m.price.priceCm2 == null}>
                          {m.name}{m.price.priceCm2 == null ? ` — ${m.price.reason}` : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
              {canFinance && film && filmPrice.priceCm2 != null && (
                <p className="text-xs text-text-muted mt-1.5 tabular-nums">
                  {fmtCm2(filmPrice.priceCm2)} ₽/см²
                  {filmPrice.source === 'warehouse'
                    ? ` · по цене склада (${fmtCm2(filmPrice.priceCm2Raw)} × ${String(settings.material_k).replace('.', ',')})`
                    : ' · цена группы'}
                </p>
              )}
            </div>
          </div>

          <div className="bg-surface rounded-2xl border border-border p-4 space-y-4">
            <div>
              <Input
                label="Тираж, шт"
                inputMode="numeric"
                value={qtyText}
                readOnly={viewsCount > 1}
                onChange={onQtyChange}
                onBlur={onQtyBlur}
                aria-describedby="calc-qty-hint"
                className={viewsCount > 1 ? 'bg-surface-2' : ''}
              />
              <input
                type="range"
                min={MIN_QTY}
                max={MAX_QTY}
                step={10}
                value={Math.min(Math.max(qty, MIN_QTY), MAX_QTY)}
                onChange={onSlider}
                disabled={viewsCount > 1}
                aria-label="Тираж"
                className="w-full mt-3 accent-[var(--color-accent)] disabled:opacity-40"
              />
              <p id="calc-qty-hint" className="text-xs text-text-muted">
                {viewsCount > 1 ? 'Тираж = сумма по видам' : `От ${MIN_QTY} до ${formatInt(MAX_QTY)} шт`}
              </p>
            </div>

            <div>
              <p className="text-sm font-medium mb-1.5">Видов (макетов)</p>
              <div className="inline-flex items-center gap-2">
                <Button type="button" variant="secondary" size="sm" aria-label="Меньше видов"
                  onClick={() => changeViewsCount(viewsCount - 1)} disabled={viewsCount <= 1}>−</Button>
                <span className="w-8 text-center font-semibold tabular-nums" aria-live="polite">{viewsCount}</span>
                <Button type="button" variant="secondary" size="sm" aria-label="Больше видов"
                  onClick={() => changeViewsCount(viewsCount + 1)} disabled={viewsCount >= MAX_VIEWS}>+</Button>
              </div>
              {viewsCount > 1 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                  {viewTexts.map((t, i) => (
                    <Input key={i} label={`Вид ${i + 1}, шт`} inputMode="numeric" value={t}
                      onChange={(e) => onViewChange(i, e.target.value)} onBlur={() => onViewBlur(i)} />
                  ))}
                </div>
              )}
              {!qtyValid && <p className="text-xs text-danger mt-2">Минимальный тираж — 20 шт</p>}
            </div>
          </div>

          <div className="bg-surface rounded-2xl border border-border p-4 space-y-2">
            <p className="text-sm font-medium">Дополнительные опции</p>
            {optionKeys.map((key) => (
              <OptionToggle
                key={key}
                id={`calc-opt-${key}`}
                label={OPTION_LABELS[key]}
                hint={key === 'nfc' && !nfc.available ? nfc.reason : OPTION_HINTS[key]}
                checked={!!options[key] && !(key === 'nfc' && !nfc.available)}
                onChange={(v) => setOption(key, v)}
                delta={ready ? deltas[key] : 0}
                disabled={key === 'nfc' && !nfc.available}
              >
                {key === 'lamination' && (
                  lamOptions.length === 0
                    ? <p className="text-xs text-text-muted">На складе нет матовой или глянцевой ламинации</p>
                    : (
                      <select aria-label="Ламинация" className={SELECT_CLASS} value={lam?.id || ''} onChange={(e) => setLamId(e.target.value)}>
                        {lamOptions.map((l) => (
                          <option key={l.id} value={l.id}>{laminationDisplayName(l)} · {l.name}</option>
                        ))}
                      </select>
                    )
                )}
                {key === 'nfc' && nfcShort && (
                  <p className="text-xs font-medium text-warning" role="status">
                    На складе {formatInt(nfc.stock)} шт — меньше тиража
                  </p>
                )}
                {key === 'manual' && (
                  <div className="max-w-[180px]">
                    <Input
                      label="Часов"
                      inputMode="decimal"
                      value={manualText}
                      onChange={onManualChange}
                      onBlur={onManualBlur}
                      aria-describedby="calc-manual-hint"
                    />
                    <p id="calc-manual-hint" className="text-xs text-text-muted mt-1">
                      Шаг {formatHours(MANUAL_HOURS_STEP)} ч, от {formatHours(MANUAL_HOURS_MIN)} до {MANUAL_HOURS_MAX}
                    </p>
                  </div>
                )}
              </OptionToggle>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------ Результат */}
        <section aria-label="Результат расчёта" className="space-y-4 min-w-0 lg:sticky lg:top-20">
          <div className="bg-surface rounded-2xl border border-border p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-text-muted">Цена за 1 шт</p>
                <p className="text-3xl font-bold font-display tabular-nums">{ready ? formatPrice(result.pricePerUnit) : '—'}</p>
              </div>
              {canFinance && (
                <Button type="button" variant="ghost" size="sm" onClick={toggleHideCost}
                  aria-pressed={hideCost} aria-label={hideCost ? 'Показать себестоимость' : 'Скрыть себестоимость'}
                  title={hideCost ? 'Показать себестоимость' : 'Скрыть себестоимость'}>
                  <EyeIcon off={hideCost} />
                </Button>
              )}
            </div>
            <div>
              <p className="text-xs text-text-muted">Стоимость тиража</p>
              <p className="text-2xl font-bold tabular-nums">{ready ? formatRub(result.totalRounded) : '—'}</p>
              {ready && (
                <p className="text-xs text-text-muted mt-0.5 tabular-nums">
                  {formatInt(qty)} шт × {formatPrice(result.pricePerUnit)}
                  {result.extrasTotal > 0 && ` + доплаты ${formatRub(result.extrasTotal)}`}
                </p>
              )}
            </div>

            {showCost && ready && (
              <dl className="grid grid-cols-3 gap-2 pt-3 border-t border-border text-sm">
                <div className="min-w-0">
                  <dt className="text-xs text-text-muted">Себест. 1 шт</dt>
                  <dd className="font-semibold tabular-nums">{formatPrice(result.costPerUnit)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-text-muted">Наценка</dt>
                  <dd className="font-semibold tabular-nums">×{result.markup.toFixed(2).replace('.', ',')}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-text-muted">Себест. тиража</dt>
                  <dd className="font-semibold tabular-nums">{formatRub(result.costTotal)}</dd>
                </div>
              </dl>
            )}
          </div>

          {showCost && ready && <CostBreakdown result={result} />}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Tile label="Площадь изделия" value={sizeValid ? `${formatArea(result.areaCm2)} см²` : '—'} />
            <Tile label="Тираж" value={`${formatInt(qty)} шт`} />
            <Tile label="Площадь тиража" value={sizeValid ? `${result.tirageAreaM2.toFixed(2).replace('.', ',')} м²` : '—'} />
            <Tile label="Видов" value={viewsCount} />
          </div>

          {ready && (
            <div className="bg-surface rounded-2xl border border-border p-4">
              <h2 className="text-sm font-semibold mb-2">Итог расчёта</h2>
              <dl className="text-sm space-y-1">
                <SummaryRow label="Продукция" value={result.productLabel} />
                <SummaryRow label="Материал" value={labels.material} />
                <SummaryRow label="Ламинация" value={options.lamination ? (labels.lamination || 'да') : 'нет'} />
                <SummaryRow label="Размер" value={`${input.widthMm} × ${input.heightMm} мм`} />
                <SummaryRow
                  label="Тираж"
                  value={viewsCount > 1
                    ? `${formatInt(qty)} шт (${views.map((v, i) => `вид ${i + 1} — ${formatInt(v)}`).join(', ')})`
                    : `${formatInt(qty)} шт`}
                />
                <SummaryRow label="Цена за 1 шт" value={formatPrice(result.pricePerUnit)} />
                {optionLines.length > 0 && <p className="text-text-muted pt-1">Дополнительно:</p>}
                {optionLines.map((l) => (
                  <SummaryRow key={l.key} label={l.label} value={l.text} />
                ))}
                <div className="flex justify-between gap-3 pt-2 mt-1 border-t border-border font-semibold">
                  <dt>Итого</dt>
                  <dd className="tabular-nums">{formatRub(result.totalRounded)}</dd>
                </div>
              </dl>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
                <CopyButton getText={() => buildShortText(result)}>Скопировать</CopyButton>
                <CopyButton getText={() => buildDetailedText(result, labels, settings)}>Скопировать подробно</CopyButton>
                {canCreateOrder && (
                  <Button type="button" className="sm:col-span-2" onClick={() => setCreateOpen(true)}>
                    Создать заказ
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="bg-surface rounded-2xl border border-border p-4">
            <h2 className="text-sm font-semibold mb-2">Цены по тиражам</h2>
            {ready
              ? <PriceTiersTable tiers={tiers} showMarkup={showCost} />
              : <p className="text-sm text-text-muted">Укажите размер, материал и тираж</p>}
          </div>
        </section>
      </div>

      {/* Телефон/планшет: закреплённая полоса итога */}
      {ready && (
        <div className="lg:hidden sticky bottom-2 z-20 bg-surface/95 backdrop-blur-md border border-border rounded-2xl shadow-card p-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-text-muted">Итого</p>
            <p className="text-lg font-bold tabular-nums truncate">{formatRub(result.totalRounded)}</p>
          </div>
          <CopyButton variant="primary" getText={() => buildShortText(result)}>Скопировать</CopyButton>
        </div>
      )}

      {/* R25.6: попап «Создать заказ» — расчёт фиксируется на момент открытия */}
      {createOpen && ready && (
        <CreateOrderModal
          result={result}
          film={film}
          lam={options.lamination ? lam : null}
          nfc={result.input.options.nfc ? nfc.material : null}
          materialPriceSource={filmPrice.source}
          settings={settings}
          labels={labels}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  )
}

function EyeIcon({ off }) {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden="true">
      {off ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
      ) : (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </>
      )}
    </svg>
  )
}

/** Разбивка себестоимости (только view:finance): статьи 1 см² + NFC-метка за штуку. */
function CostBreakdown({ result }) {
  return (
    <div className="bg-surface rounded-2xl border border-border p-4">
      <h2 className="text-sm font-semibold mb-2">Разбивка себестоимости 1 см²</h2>
      <dl className="text-sm space-y-1 tabular-nums">
        {result.costBreakdown.map((i) => (
          <div key={i.key} className="flex justify-between gap-3">
            <dt className="text-text-muted min-w-0">{i.label}</dt>
            <dd>{fmtCm2(i.value)} ₽</dd>
          </div>
        ))}
        <div className="flex justify-between gap-3 pt-1.5 mt-1 border-t border-border font-semibold">
          <dt>Итого за 1 см²</dt>
          <dd>{fmtCm2(result.costPerCm2)} ₽</dd>
        </div>
        {result.nfcCostPerUnit > 0 && (
          <div className="flex justify-between gap-3 pt-1.5">
            <dt className="text-text-muted min-w-0">NFC-метка, ₽/шт</dt>
            <dd>{formatPrice(result.nfcCostPerUnit)}</dd>
          </div>
        )}
      </dl>
    </div>
  )
}

function Tile({ label, value }) {
  return (
    <div className="bg-surface rounded-xl border border-border px-3 py-2 min-w-0">
      <p className="text-[11px] text-text-muted truncate">{label}</p>
      <p className="text-sm font-semibold tabular-nums truncate">{value}</p>
    </div>
  )
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-text-muted shrink-0">{label}</dt>
      <dd className="text-right min-w-0 break-words">{value}</dd>
    </div>
  )
}
