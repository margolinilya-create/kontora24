export function DateRangeFilter({ from, to, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-text-muted hidden sm:inline">Срок сдачи:</span>
      <input
        type="date"
        value={from || ''}
        onChange={(e) => onChange({ from: e.target.value || null, to })}
        className="rounded-lg border border-border px-3 py-2 text-sm bg-surface min-h-[44px]"
        aria-label="Срок сдачи от"
      />
      <span className="text-text-muted text-sm">—</span>
      <input
        type="date"
        value={to || ''}
        onChange={(e) => onChange({ from, to: e.target.value || null })}
        className="rounded-lg border border-border px-3 py-2 text-sm bg-surface min-h-[44px]"
        aria-label="Срок сдачи до"
      />
      {(from || to) && (
        <button
          onClick={() => onChange({ from: null, to: null })}
          className="text-xs text-accent hover:underline min-h-[44px]"
        >
          Сбросить
        </button>
      )}
    </div>
  )
}
