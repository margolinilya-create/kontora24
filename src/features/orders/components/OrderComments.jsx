import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { formatRelative } from '@/shared/lib/utils'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'
import Spinner from '@/shared/components/Spinner'

export function OrderComments({ orderId }) {
  const { profile } = useAuth()
  const [comments, setComments] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchComments = useCallback(async () => {
    const { data } = await supabase
      .from('k24_order_comments')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })
    setComments(data || [])
    setLoading(false)
  }, [orderId])

  useEffect(() => { fetchComments() }, [fetchComments])

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`comments-${orderId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'k24_order_comments', filter: `order_id=eq.${orderId}` }, () => fetchComments())
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
      // Don't call fetchComments() — realtime subscription handles it
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <h2 className="font-semibold mb-4">Комментарии ({comments.length})</h2>

      {/* Comment list */}
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
                  <span className="text-xs text-text-muted ml-auto">{formatRelative(c.created_at)}</span>
                </div>
                <p className="text-sm mt-0.5 whitespace-pre-wrap">{c.text}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input */}
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
    </div>
  )
}
