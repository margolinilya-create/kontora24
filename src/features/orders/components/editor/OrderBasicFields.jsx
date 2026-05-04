import { ORDER_TYPES } from '@/shared/constants'

export function OrderBasicFields({ form, update, inputClass, labelClass }) {
  return (
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
          <label className={labelClass}>Ширина (мм)</label>
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
                <option value="glossy">Глянцевая</option>
                <option value="matte">Матовая</option>
              </select>
            )}
          </div>
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
  )
}
