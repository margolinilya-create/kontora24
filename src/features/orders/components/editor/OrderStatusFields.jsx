import { ORDER_STATUSES, PRIORITIES } from '@/shared/constants'

export function OrderStatusFields({ form, update, clients, profiles, inputClass, labelClass }) {
  return (
    <div>
      <h3 className="font-medium text-sm mb-3 text-text-muted">Статус и назначение</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <div>
          <label className={labelClass}>Статус</label>
          <select value={form.status} onChange={(e) => update('status', e.target.value)} className={inputClass}>
            {Object.entries(ORDER_STATUSES).map(([key, s]) => (
              <option key={key} value={key}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Приоритет</label>
          <select value={form.priority} onChange={(e) => update('priority', e.target.value)} className={inputClass}>
            {Object.entries(PRIORITIES).map(([key, p]) => (
              <option key={key} value={key}>{p.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Клиент</label>
          <select value={form.client_id} onChange={(e) => update('client_id', e.target.value)} className={inputClass}>
            <option value="">— Не выбран —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Исполнитель</label>
          <select value={form.assigned_to} onChange={(e) => update('assigned_to', e.target.value)} className={inputClass}>
            <option value="">— Не назначен —</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.display_name} ({p.role})</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
