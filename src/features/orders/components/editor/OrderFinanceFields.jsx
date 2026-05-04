export function OrderFinanceFields({ form, update, inputClass, labelClass }) {
  return (
    <div>
      <h3 className="font-medium text-sm mb-3 text-text-muted">Финансы</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <label className={labelClass}>Итого (руб)</label>
          <input type="number" value={form.price_final} onChange={(e) => update('price_final', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Материалы</label>
          <input type="number" value={form.cost_materials} onChange={(e) => update('cost_materials', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Труд</label>
          <input type="number" value={form.cost_labor} onChange={(e) => update('cost_labor', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Себестоимость</label>
          <input type="number" value={form.cost_total} onChange={(e) => update('cost_total', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>За штуку</label>
          <input type="number" value={form.price_per_unit} onChange={(e) => update('price_per_unit', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Наценка (x)</label>
          <input type="number" step="0.1" value={form.markup} onChange={(e) => update('markup', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Скидка (0-1)</label>
          <input type="number" step="0.01" min="0" max="1" value={form.discount_pct} onChange={(e) => update('discount_pct', e.target.value)} className={inputClass} />
        </div>
      </div>
    </div>
  )
}
