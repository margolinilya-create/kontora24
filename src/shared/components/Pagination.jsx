export function Pagination({ page, totalPages, totalCount, perPage, hasNext, hasPrev, nextPage, prevPage, changePerPage }) {
  if (totalCount <= 0) return null

  const start = (page - 1) * perPage + 1
  const end = Math.min(page * perPage, totalCount)

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4">
      <div className="text-sm text-text-muted">
        {start}–{end} из {totalCount}
        <select
          value={perPage}
          onChange={(e) => changePerPage(Number(e.target.value))}
          aria-label="Записей на странице"
          className="ml-2 rounded border border-border px-2 py-1 text-xs"
        >
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
        {' '}на стр.
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={prevPage}
          disabled={!hasPrev}
          aria-label="Предыдущая страница"
          className="px-3 py-1.5 rounded-lg border border-border text-sm disabled:opacity-30 hover:bg-surface-dim transition-colors disabled:cursor-not-allowed"
        >
          ←
        </button>
        <span className="text-sm text-text-muted">
          {page} / {totalPages}
        </span>
        <button
          onClick={nextPage}
          disabled={!hasNext}
          aria-label="Следующая страница"
          className="px-3 py-1.5 rounded-lg border border-border text-sm disabled:opacity-30 hover:bg-surface-dim transition-colors disabled:cursor-not-allowed"
        >
          →
        </button>
      </div>
    </div>
  )
}
