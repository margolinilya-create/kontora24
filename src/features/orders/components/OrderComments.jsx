import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { captureError } from '@/shared/lib/sentry'
import { formatRelative } from '@/shared/lib/utils'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'
import Spinner from '@/shared/components/Spinner'
import ConfirmDialog from '@/shared/components/ConfirmDialog'

export function OrderComments({ orderId }) {
  const { profile } = useAuth()
  const [comments, setComments] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null) // {id, text}

  const isManager = profile?.role === 'admin' || profile?.role === 'manager'
  const canModify = (c) => Boolean(profile) && (c.author_id === profile.id || isManager)

  const fetchComments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('k24_order_comments')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true })
      if (error) throw error
      setComments(data || [])
    } catch (err) {
      captureError(err, { tags: { source: 'OrderComments.fetchComments' }, extra: { orderId } })
      setComments([])
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => { fetchComments() }, [fetchComments])

  // Realtime — unique channel name per mount.
  useEffect(() => {
    const uid = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))
    const channel = supabase
      .channel(`comments-${orderId}-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'k24_order_comments', filter: `order_id=eq.${orderId}` }, () => fetchComments())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [orderId, fetchComments])

  async function handleSend(e) {
    e.preventDefault()
    if (!text.trim() || !profile) return

    setSending(true)
    try {
      const { error } = await supabase.from('k24_order_comments').insert({
        order_id: orderId,
        author_id: profile.id,
        author_name: profile.display_name || profile.name,
        author_role: profile.role,
        text: text.trim(),
      })
      if (error) throw error
      setText('')
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setSending(false)
    }
  }

  function startEdit(c) {
    setEditingId(c.id)
    setEditText(c.text)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditText('')
  }

  async function saveEdit() {
    if (!editText.trim()) return
    setSavingEdit(true)
    try {
      const { error } = await supabase.from('k24_order_comments')
        .update({ text: editText.trim() })
        .eq('id', editingId)
      if (error) throw error
      cancelEdit()
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setSavingEdit(false)
    }
  }

  async function performDelete() {
    if (!confirmDelete) return
    const id = confirmDelete.id
    setConfirmDelete(null)
    try {
      const { error } = await supabase.from('k24_order_comments').delete().eq('id', id)
      if (error) throw error
      toast.success('Удалено')
    } catch (err) {
      toast.error(translateError(err).message)
    }
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <h2 className="font-semibold mb-4">Комментарии ({comments.length})</h2>

      <div className="space-y-3 max-h-80 overflow-y-auto mb-4">
        {loading ? (
          <div className="flex justify-center py-4">
            <Spinner size="sm" />
          </div>
        ) : comments.length === 0 ? (
          <p className="text-text-muted text-sm text-center py-4">Нет комментариев</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium flex-shrink-0">
                {(c.author_name || 'U')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium">{c.author_name || 'User'}</span>
                  <span className="text-xs text-text-muted">{c.author_role}</span>
                  <span className="text-xs text-text-muted ml-auto">
                    {formatRelative(c.created_at)}
                    {c.updated_at && <span className="ml-1 italic">· изменено</span>}
                  </span>
                </div>
                {editingId === c.id ? (
                  <div className="mt-1 space-y-2">
                    <Input
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      ariaLabel="Редактировать комментарий"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveEdit} loading={savingEdit} disabled={!editText.trim()}>
                        Сохранить
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelEdit}>
                        Отмена
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm mt-0.5 whitespace-pre-wrap">{c.text}</p>
                    {canModify(c) && (
                      <div className="flex gap-3 mt-1">
                        <button
                          onClick={() => startEdit(c)}
                          className="text-xs text-text-muted hover:text-accent transition-colors"
                          type="button"
                        >
                          Изменить
                        </button>
                        <button
                          onClick={() => setConfirmDelete({ id: c.id, text: c.text })}
                          className="text-xs text-text-muted hover:text-danger transition-colors"
                          type="button"
                        >
                          Удалить
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSend} className="flex gap-2">
        <div className="flex-1">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Написать комментарий..."
            ariaLabel="Написать комментарий"
          />
        </div>
        <Button
          type="submit"
          disabled={!text.trim()}
          loading={sending}
        >
          Отправить
        </Button>
      </form>

      <ConfirmDialog
        isOpen={Boolean(confirmDelete)}
        title="Удалить комментарий?"
        message={confirmDelete?.text || ''}
        confirmText="Удалить"
        variant="danger"
        onConfirm={performDelete}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  )
}
