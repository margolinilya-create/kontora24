export default function Tabs({ items, active, onChange, className = '' }) {
  return (
    <div role="tablist" className={`flex gap-1 bg-surface-dim rounded-lg p-1 ${className}`}>
      {items.map((item) => (
        <button
          key={item.key}
          role="tab"
          onClick={() => onChange(item.key)}
          aria-selected={active === item.key}
          tabIndex={active === item.key ? 0 : -1}
          className={`px-3 py-2 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
            active === item.key
              ? 'bg-primary text-white'
              : 'text-text-muted hover:text-text hover:bg-surface'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
