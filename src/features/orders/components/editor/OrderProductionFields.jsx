export function OrderProductionFields({ form, update, inputClass, labelClass }) {
  return (
    <div>
      <h3 className="font-medium text-sm mb-3 text-text-muted">Производственные данные</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <label className={labelClass}>Напечатано (м)</label>
          <input type="number" step="0.01" value={form.printed_meters} onChange={(e) => update('printed_meters', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Потрачено смеси</label>
          <input type="number" step="0.01" value={form.resin_used} onChange={(e) => update('resin_used', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Брак (шт)</label>
          <input type="number" value={form.rejected_qty} onChange={(e) => update('rejected_qty', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Напечатано (шт)</label>
          <input type="number" value={form.printed_qty} onChange={(e) => update('printed_qty', e.target.value)} className={inputClass} />
        </div>
      </div>
    </div>
  )
}
