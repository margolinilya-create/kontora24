import { useState, useMemo } from 'react'

export function usePagination(totalCount, initialPerPage = 25) {
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(initialPerPage)

  const totalPages = Math.max(1, Math.ceil(totalCount / perPage))

  const pagination = useMemo(() => ({
    page,
    perPage,
    totalPages,
    totalCount,
    from: (page - 1) * perPage,
    to: page * perPage - 1,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  }), [page, perPage, totalPages, totalCount])

  function nextPage() { if (page < totalPages) setPage(page + 1) }
  function prevPage() { if (page > 1) setPage(page - 1) }
  function goToPage(p) { setPage(Math.max(1, Math.min(p, totalPages))) }
  function changePerPage(n) { setPerPage(n); setPage(1) }

  return { ...pagination, nextPage, prevPage, goToPage, setPage, changePerPage }
}
