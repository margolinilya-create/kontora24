import { useState, useEffect } from 'react'
import { toast } from '@/shared/stores/toast-store'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'

const STORAGE_KEY = 'kontora24-saved-filters'

export function SavedFilters({ currentFilter, onApply }) {
  const [filters, setFilters] = useState([])
  const [showSave, setShowSave] = useState(false)
  const [name, setName] = useState('')

  useEffect(() => {
    try {
      setFilters(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'))
    } catch {}
  }, [])

  function saveFilter(e) {
    e.preventDefault()
    if (!name.trim()) return
    const updated = [...filters, { id: Date.now(), name: name.trim(), filter: currentFilter }]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    setFilters(updated)
    setName('')
    setShowSave(false)
    toast.success('Фильтр сохранён')
  }

  function deleteFilter(id) {
    const updated = filters.filter((f) => f.id !== id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    setFilters(updated)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {filters.map((f) => (
        <div key={f.id} className="flex items-center gap-1 bg-surface border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => onApply(f.filter)}
            className="px-2.5 py-1 text-xs font-medium text-text hover:bg-surface-dim transition-colors"
          >
            {f.name}
          </button>
          <button
            onClick={() => deleteFilter(f.id)}
            aria-label="Удалить фильтр"
            className="px-2.5 py-2 text-xs text-text-muted hover:text-danger transition-colors"
          >
            ×
          </button>
        </div>
      ))}

      {showSave ? (
        <form onSubmit={saveFilter} className="flex items-center gap-1">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название..."
            autoFocus
            ariaLabel="Название фильтра"
            className="!w-28 !px-2 !py-1 !text-xs"
          />
          <Button type="submit" variant="ghost" size="sm">OK</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowSave(false)}>×</Button>
        </form>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowSave(true)}
        >
          + Сохранить фильтр
        </Button>
      )}
    </div>
  )
}
