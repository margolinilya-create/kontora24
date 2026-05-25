import { MATERIAL_CATEGORIES } from '@/shared/constants'

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'Все категории' },
  ...Object.entries(MATERIAL_CATEGORIES).map(([key, { label }]) => ({ value: key, label })),
]

const STATUS_OPTIONS = [
  { value: 'all', label: 'Все статусы' },
  { value: 'empty', label: 'Закончилось' },
  { value: 'low', label: 'Мало' },
  { value: 'ok', label: 'Достаточно' },
]

/**
 * Общий фильтр для табов склада: поиск + категория + статус остатка.
 * showStatus=false скрывает селект статусов (полезно для инвентаризации,
 * где статус не нужен).
 */
export function WarehouseFilterBar({
  search, onSearch,
  category, onCategory,
  status, onStatus,
  showStatus = true,
  className = '',
}) {
  return (
    <div className={`flex flex-col sm:flex-row gap-2 ${className}`}>
      <input
        type="search"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Поиск по названию"
        className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
      <select
        value={category}
        onChange={(e) => onCategory(e.target.value)}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        aria-label="Категория"
      >
        {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {showStatus && (
        <select
          value={status}
          onChange={(e) => onStatus(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          aria-label="Статус остатка"
        >
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </div>
  )
}
