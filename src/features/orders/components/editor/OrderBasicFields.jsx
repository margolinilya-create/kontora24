import {
  ORDER_TYPES, FILM_TYPES, LAMINATION_TYPES, DESIGN_STATUSES,
  ORDER_SOURCES, PAYMENT_STATUSES, DELIVERY_TYPES, SIZE_PRESETS,
} from '@/shared/constants'

export function OrderBasicFields({ form, update, inputClass, labelClass }) {
  const isStickerpack = form.order_type === 'stickerpack' || form.order_type === 'stickerpack3D'

  function applyPreset(key) {
    const preset = SIZE_PRESETS[key]
    if (!preset) return
    update('width_mm', preset.width)
    update('height_mm', preset.height)
  }

  return (
    <div className="space-y-6">
      {/* Deal info */}
      <div>
        <h3 className="font-medium text-sm mb-3 text-text-muted">Сделка</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <div>
            <label className={labelClass}>Название сделки</label>
            <input type="text" value={form.deal_name} onChange={(e) => update('deal_name', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Номер сделки (Bitrix)</label>
            <input type="text" value={form.bitrix_deal_id} onChange={(e) => update('bitrix_deal_id', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Партнёрский</label>
            <label className="flex items-center gap-2 cursor-pointer h-[38px]">
              <input type="checkbox" checked={form.is_partner} onChange={(e) => update('is_partner', e.target.checked)} className="w-4 h-4 rounded border-border text-accent focus:ring-accent" />
              <span className="text-sm">Да (-35%)</span>
            </label>
          </div>
          <div>
            <label className={labelClass}>Источник</label>
            <select value={form.source} onChange={(e) => update('source', e.target.value)} className={inputClass}>
              <option value="">— Не указан —</option>
              {Object.entries(ORDER_SOURCES).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          {form.source === 'referrer' && (
            <div>
              <label className={labelClass}>Имя референта</label>
              <input type="text" value={form.source_referrer} onChange={(e) => update('source_referrer', e.target.value)} className={inputClass} />
            </div>
          )}
          <div>
            <label className={labelClass}>Оплата</label>
            <select value={form.payment_status} onChange={(e) => update('payment_status', e.target.value)} className={inputClass}>
              {Object.entries(PAYMENT_STATUSES).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Order info */}
      <div>
        <h3 className="font-medium text-sm mb-3 text-text-muted">Основная информация</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <div>
            <label className={labelClass}>Тип заказа</label>
            <select value={form.order_type} onChange={(e) => update('order_type', e.target.value)} className={inputClass}>
              <option value="">—</option>
              {Object.entries(ORDER_TYPES).map(([key, t]) => (
                <option key={key} value={key}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Материал (плёнка)</label>
            <select value={form.film_type} onChange={(e) => update('film_type', e.target.value)} className={inputClass}>
              {Object.entries(FILM_TYPES).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Ширина (мм)</label>
            <div className="flex gap-1 mb-1">
              {Object.entries(SIZE_PRESETS).map(([key, { label }]) => (
                <button key={key} type="button" onClick={() => applyPreset(key)} className="px-2 py-0.5 text-xs rounded border border-border bg-surface hover:bg-hover transition-colors">
                  {label}
                </button>
              ))}
            </div>
            <input type="number" value={form.width_mm} onChange={(e) => update('width_mm', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Высота (мм)</label>
            <input type="number" value={form.height_mm} onChange={(e) => update('height_mm', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Тираж (шт)</label>
            <input type="number" value={form.qty} onChange={(e) => update('qty', e.target.value)} className={inputClass} />
          </div>
          {isStickerpack && (
            <div>
              <label className={labelClass}>Стикеров в паке</label>
              <input type="number" value={form.stickers_per_pack} onChange={(e) => update('stickers_per_pack', e.target.value)} className={inputClass} />
            </div>
          )}
          <div>
            <label className={labelClass}>Кол-во видов</label>
            <input type="number" value={form.design_variants} onChange={(e) => update('design_variants', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Ламинация</label>
            <div className="flex items-center gap-3 h-[38px]">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.need_lam} onChange={(e) => update('need_lam', e.target.checked)} className="w-4 h-4 rounded border-border text-accent focus:ring-accent" />
                <span className="text-sm">Да</span>
              </label>
              {form.need_lam && (
                <select value={form.lam_type} onChange={(e) => update('lam_type', e.target.value)} className="border border-border rounded px-2 py-1 text-sm bg-surface">
                  {Object.entries(LAMINATION_TYPES).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <div>
            <label className={labelClass}>Дизайн макета</label>
            <select value={form.design_status} onChange={(e) => update('design_status', e.target.value)} className={inputClass}>
              {Object.entries(DESIGN_STATUSES).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Ссылка на макет</label>
            <input type="text" value={form.mockup_path} onChange={(e) => update('mockup_path', e.target.value)} className={inputClass} placeholder="Путь к файлу на сервере" />
          </div>
          <div>
            <label className={labelClass}>БОПП пакет</label>
            <label className="flex items-center gap-2 cursor-pointer h-[38px]">
              <input type="checkbox" checked={form.bopp_bag} onChange={(e) => update('bopp_bag', e.target.checked)} className="w-4 h-4 rounded border-border text-accent focus:ring-accent" />
              <span className="text-sm">Да</span>
            </label>
          </div>
          <div>
            <label className={labelClass}>Срок сдачи</label>
            <input type="date" value={form.deadline} onChange={(e) => update('deadline', e.target.value)} className={inputClass} />
          </div>
        </div>
      </div>

      {/* Delivery */}
      <div>
        <h3 className="font-medium text-sm mb-3 text-text-muted">Отгрузка</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <div>
            <label className={labelClass}>Получение</label>
            <select value={form.delivery_type} onChange={(e) => update('delivery_type', e.target.value)} className={inputClass}>
              {Object.entries(DELIVERY_TYPES).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          {form.delivery_type === 'delivery' && (
            <>
              <div>
                <label className={labelClass}>Город</label>
                <input type="text" value={form.delivery_city} onChange={(e) => update('delivery_city', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Адрес</label>
                <input type="text" value={form.delivery_address} onChange={(e) => update('delivery_address', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Комментарий</label>
                <input type="text" value={form.delivery_notes} onChange={(e) => update('delivery_notes', e.target.value)} className={inputClass} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
