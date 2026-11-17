export default function Tabs({ items, active, onChange, className = '' }) {
  return (
    <div role="tablist" className={`inline-flex gap-1 bg-surface-2 rounded-xl p-1 ${className}`}>
      {items.map((item) => {
        const isActive = active === item.key
        return (
          <button
            key={item.key}
            role="tab"
            onClick={() => onChange(item.key)}
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
              isActive
                ? 'bg-accent text-on-accent shadow-[0_1px_2px_rgba(20,20,20,0.08)]'
                : 'text-text-muted hover:text-text hover:bg-surface'
            }`}
          >
            {item.label}
            <TabBadge badge={item.badge} active={isActive} />
          </button>
        )
      })}
    </div>
  )
}

// R25.3 (ТЗ 3.3): необязательный кружок-счётчик у пункта: item.badge = { count, tone: 'accent'|'muted' }.
export function TabBadge({ badge, active = false }) {
  if (!badge || !badge.count) return null
  const tone = badge.tone === 'accent'
    ? (active ? 'bg-on-accent text-accent' : 'bg-accent text-on-accent')
    : (active ? 'bg-on-accent/30 text-on-accent' : 'bg-surface-dim text-text-muted')
  return (
    <span
      className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-semibold tabular-nums align-middle ${tone}`}
      aria-label={`${badge.count}`}
    >
      {badge.count}
    </span>
  )
}
