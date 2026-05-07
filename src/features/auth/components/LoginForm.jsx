import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/stores/toast-store'
import Input from '@/shared/components/Input'
import Button from '@/shared/components/Button'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
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
      localStorage.setItem('rememberMe', rememberMe)
      navigate(from, { replace: true })
    } catch (err) {
      const msg = err.message?.includes('Invalid login') ? 'Неверный email или пароль' : err.message || 'Ошибка входа'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent mb-4 shadow-card">
            <svg viewBox="0 0 32 32" className="w-10 h-10 text-on-accent">
              <text x="16" y="23" textAnchor="middle" fill="currentColor" fontFamily="sans-serif" fontWeight="700" fontSize="20">K</text>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-text font-display tracking-tight">Kontora24</h1>
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

          <Input
            label="Email"
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            required
            autoFocus
          />

          {mode === 'login' && (
            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-text mb-1">Пароль</label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 pr-10 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent/50"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text transition-colors"
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}

          {mode === 'login' && (
            <label className="flex items-center gap-2 text-sm text-text-muted">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded"
              />
              Запомнить меня
            </label>
          )}

          <Button type="submit" loading={loading} className="w-full">
            {mode === 'login' ? 'Войти' : 'Сбросить пароль'}
          </Button>

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
