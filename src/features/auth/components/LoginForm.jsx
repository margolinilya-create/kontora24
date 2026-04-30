import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/stores/toast-store'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState('login') // 'login' | 'reset'
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const from = location.state?.from?.pathname || '/'

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (mode === 'reset') {
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        })
        if (error) throw error
        toast.success('Ссылка для сброса пароля отправлена на ' + email)
        setMode('login')
      } catch (err) {
        setError(err.message || 'Ошибка отправки')
      } finally {
        setLoading(false)
      }
      return
    }

    try {
      await signIn(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      const msg = err.message?.includes('Invalid login') ? 'Неверный email или пароль' : err.message || 'Ошибка входа'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-dim p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4">
            <svg viewBox="0 0 32 32" className="w-10 h-10">
              <text x="16" y="23" textAnchor="middle" fill="#e94560" fontFamily="sans-serif" fontWeight="700" fontSize="20">K</text>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-primary">Kontora24</h1>
          <p className="text-text-muted mt-1">
            {mode === 'login' ? 'Управление производством' : 'Восстановление пароля'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-surface rounded-xl shadow-sm border border-border p-6 space-y-4">
          {error && (
            <div className="bg-danger/10 text-danger text-sm rounded-lg p-3" role="alert">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="login-email" className="block text-sm font-medium mb-1.5">Email</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
              placeholder="email@example.com"
              required
              autoFocus
            />
          </div>

          {mode === 'login' && (
            <div>
              <label htmlFor="login-password" className="block text-sm font-medium mb-1.5">Пароль</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
                placeholder="••••••••"
                required
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-hover text-white font-medium rounded-lg py-2.5 text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />}
            {mode === 'login' ? (loading ? 'Вход...' : 'Войти') : (loading ? 'Отправка...' : 'Сбросить пароль')}
          </button>

          <button
            type="button"
            onClick={() => { setMode(mode === 'login' ? 'reset' : 'login'); setError('') }}
            className="w-full text-sm text-text-muted hover:text-accent transition-colors"
          >
            {mode === 'login' ? 'Забыли пароль?' : '← Назад ко входу'}
          </button>
        </form>
      </div>
    </div>
  )
}
