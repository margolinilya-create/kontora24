import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { captureError } from '@/shared/lib/sentry'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'

/**
 * Персональные сохранённые фильтры заказов в k24_user_filters.
 * RLS: каждый видит только свои.
 *
 * @param {object} currentFilter — что сохранять (передаётся пользователем)
 * @param {(config) => void} onApply — применить сохранённый фильтр
 */
export function SavedFilters({ currentFilter, onApply }) {
  const { profile } = useAuth()
  const [filters, setFilters] = useState([])
  const [showSave, setShowSave] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const fetchFilters = useCallback(async () => {
    if (!profile) return
    try {
      const { data, error } = await supabase
        .from('k24_user_filters')
        .select('id, name, config')
        .order('created_at', { ascending: true })
      if (error) throw error
      setFilters(data || [])
    } catch (err) {
      captureError(err, { tags: { source: 'SavedFilters.fetch' } })
    }
  }, [profile])

  useEffect(() => { fetchFilters() }, [fetchFilters])

  async function saveFilter(e) {
    e.preventDefault()
    if (!name.trim() || !profile) return
    setBusy(true)
    try {
      const { error } = await supabase
        .from('k24_user_filters')
        .insert({ user_id: profile.id, name: name.trim(), config: currentFilter })
      if (error) throw error
      toast.success('Фильтр сохранён')
      setName('')
      setShowSave(false)
      await fetchFilters()
    } catch (err) {
      toast.error(translateError(err).message || err.message)
    } finally {
      setBusy(false)
    }
  }

  async function deleteFilter(id) {
    try {
      const { error } = await supabase.from('k24_user_filters').delete().eq('id', id)
      if (error) throw error
      await fetchFilters()
    } catch (err) {
      toast.error(translateError(err).message || err.message)
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {filters.map((f) => (
        <div key={f.id} className="flex items-center bg-surface border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => onApply(f.config)}
            className="px-2.5 py-1.5 text-xs font-medium text-text hover:bg-surface-2 transition-colors"
          >
            {f.name}
          </button>
          <button
            onClick={() => deleteFilter(f.id)}
            aria-label={`Удалить фильтр "${f.name}"`}
            className="px-2 py-1.5 text-xs text-text-muted hover:text-danger transition-colors border-l border-border"
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
            className="!w-32 !px-2 !py-1.5 !text-xs"
          />
          <Button type="submit" variant="ghost" size="sm" loading={busy}>OK</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => { setShowSave(false); setName('') }}>×</Button>
        </form>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setShowSave(true)}>
          + Сохранить фильтр
        </Button>
      )}
    </div>
  )
}
