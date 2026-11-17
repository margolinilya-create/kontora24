import { useContractors } from '../hooks/useContractors'

const SELECT_CLASS = 'w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm min-h-[44px]'

/**
 * R25.4 (ТЗ 4.2): выбор подрядчика. Архивные не предлагаются, но текущий
 * (у старого заказа) показывается с пометкой «архив».
 */
export function ContractorSelect({ value, onChange, id = 'contractor_id', invalid = false, disabled = false }) {
  const { contractors, loading } = useContractors({ includeArchived: true })
  const options = contractors.filter((c) => !c.archived_at || c.id === value)
  return (
    <select
      id={id}
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      className={`${SELECT_CLASS} ${invalid ? 'border-danger ring-1 ring-danger/30' : ''}`}
    >
      <option value="">{loading ? 'Загрузка…' : '— выберите подрядчика —'}</option>
      {options.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}{c.specialization ? ` · ${c.specialization}` : ''}{c.archived_at ? ' (архив)' : ''}
        </option>
      ))}
    </select>
  )
}
