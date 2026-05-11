import { Component, useState, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { captureError } from '@/shared/lib/sentry'

function isChunkLoadError(error) {
  if (!error) return false
  if (error.name === 'ChunkLoadError') return true
  const msg = error.message || ''
  return /loading chunk \d+ failed|loading css chunk \d+ failed|importing a module script failed|failed to fetch dynamically imported module/i.test(msg)
}

export class ErrorBoundaryInner extends Component {
  state = {
    hasError: false,
    error: null,
    eventId: null,
    retryCount: 0,
    hasCopied: false,
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    const eventId = captureError(error, {
      tags: { source: 'ErrorBoundary' },
      extra: { componentStack: errorInfo.componentStack },
    })
    this.setState({ eventId })
  }

  handleRetry = () => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      eventId: null,
      retryCount: prev.retryCount + 1,
      hasCopied: false,
    }))
    if (this.props.onRetry) this.props.onRetry()
  }

  handleHome = () => {
    if (this.props.navigate) {
      this.props.navigate('/')
    } else {
      window.location.href = '/'
    }
  }

  handleReload = () => {
    window.location.reload()
  }

  handleCopyEventId = async () => {
    if (!this.state.eventId) return
    try {
      await navigator.clipboard.writeText(this.state.eventId)
      this.setState({ hasCopied: true })
      setTimeout(() => this.setState({ hasCopied: false }), 2000)
    } catch {
      // navigator.clipboard может не работать в небезопасном контексте
      // или старых браузерах — игнорим, не критично
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const { error, eventId, retryCount, hasCopied } = this.state

    if (isChunkLoadError(error)) {
      return <ChunkErrorUI onReload={this.handleReload} />
    }

    if (retryCount >= 1) {
      return (
        <RecoveryModeUI
          eventId={eventId}
          hasCopied={hasCopied}
          onCopyEventId={this.handleCopyEventId}
          onHome={this.handleHome}
          onReload={this.handleReload}
          error={error}
        />
      )
    }

    return (
      <FirstErrorUI
        eventId={eventId}
        hasCopied={hasCopied}
        onCopyEventId={this.handleCopyEventId}
        onRetry={this.handleRetry}
        onHome={this.handleHome}
        error={error}
      />
    )
  }
}

function ErrorLayout({ children }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center max-w-md mx-auto">
      {children}
    </div>
  )
}

function ErrorIcon() {
  return (
    <svg className="w-16 h-16 text-danger mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  )
}

function RefreshIcon() {
  // Нейтральная иконка «обновление», а не danger-треугольник.
  // Chunk-load fail — это нормальная ситуация после деплоя, не ошибка.
  return (
    <svg className="w-14 h-14 text-accent mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  )
}

function ChunkErrorUI({ onReload }) {
  return (
    <ErrorLayout>
      <RefreshIcon />
      <h2 className="text-xl font-semibold mb-2">Приложение обновилось</h2>
      <p className="text-text-muted mb-6">
        Вышла новая версия. Обновите страницу, чтобы продолжить работу.
      </p>
      <button
        onClick={onReload}
        className="bg-accent hover:bg-accent-hover text-on-accent font-medium rounded-lg px-6 min-h-[44px] transition-colors"
      >
        Обновить страницу
      </button>
    </ErrorLayout>
  )
}

function FirstErrorUI({ eventId, hasCopied, onCopyEventId, onRetry, onHome, error }) {
  return (
    <ErrorLayout>
      <ErrorIcon />
      <h2 className="text-xl font-semibold mb-2">Что-то пошло не так</h2>
      <p className="text-text-muted mb-6">
        Попробуйте ещё раз. Если ошибка повторится — мы её уже видим.
      </p>

      <div className="flex flex-col sm:flex-row gap-2 mb-4 w-full sm:w-auto">
        <button
          onClick={onRetry}
          className="bg-accent hover:bg-accent-hover text-on-accent font-medium rounded-lg px-6 min-h-[44px] transition-colors"
        >
          Попробовать снова
        </button>
        <button
          onClick={onHome}
          className="bg-surface-dim hover:bg-surface-dim/80 text-text font-medium border border-border rounded-lg px-6 min-h-[44px] transition-colors"
        >
          На главную
        </button>
      </div>

      <EventIdBadge eventId={eventId} hasCopied={hasCopied} onCopy={onCopyEventId} />
      <DevStackTrace error={error} />
    </ErrorLayout>
  )
}

function RecoveryModeUI({ eventId, hasCopied, onCopyEventId, onHome, onReload, error }) {
  return (
    <ErrorLayout>
      <ErrorIcon />
      <h2 className="text-xl font-semibold mb-2">Не удаётся восстановить страницу</h2>
      <p className="text-text-muted mb-6">
        Перейдите в другой раздел или обновите приложение.
        Если повторяется — сообщите ID ошибки администратору.
      </p>

      <div className="flex flex-col sm:flex-row gap-2 mb-4 w-full sm:w-auto">
        <button
          onClick={onHome}
          className="bg-accent hover:bg-accent-hover text-on-accent font-medium rounded-lg px-6 min-h-[44px] transition-colors"
        >
          На главную
        </button>
        <button
          onClick={onReload}
          className="bg-surface-dim hover:bg-surface-dim/80 text-text font-medium border border-border rounded-lg px-6 min-h-[44px] transition-colors"
        >
          Обновить приложение
        </button>
      </div>

      <EventIdBadge eventId={eventId} hasCopied={hasCopied} onCopy={onCopyEventId} />
      <DevStackTrace error={error} />
    </ErrorLayout>
  )
}

function EventIdBadge({ eventId, hasCopied, onCopy }) {
  if (!eventId) return null
  return (
    <div className="text-xs text-text-muted flex items-center gap-2 mt-2">
      <span>ID ошибки:</span>
      <code className="font-mono bg-surface-dim px-2 py-0.5 rounded">
        {eventId.slice(0, 8)}
      </code>
      <button
        onClick={onCopy}
        className="text-accent hover:underline"
        aria-label="Скопировать ID ошибки"
      >
        {hasCopied ? '✓ Скопировано' : 'Скопировать'}
      </button>
    </div>
  )
}

function DevStackTrace({ error }) {
  if (!import.meta.env.DEV || !error) return null
  return (
    <details className="mt-6 text-left w-full max-w-2xl">
      <summary className="cursor-pointer text-xs text-text-muted hover:text-text">
        Stack trace (DEV only)
      </summary>
      <pre className="mt-2 p-3 bg-surface-dim rounded text-xs overflow-auto text-left font-mono whitespace-pre-wrap break-all">
        {error.message}
        {'\n\n'}
        {error.stack}
      </pre>
    </details>
  )
}

export function ErrorBoundary({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [resetKey, setResetKey] = useState(0)

  const handleRetry = useCallback(() => {
    setResetKey((k) => k + 1)
  }, [])

  const compositeKey = `${location.pathname}-${resetKey}`

  return (
    <ErrorBoundaryInner
      key={compositeKey}
      navigate={navigate}
      onRetry={handleRetry}
    >
      {children}
    </ErrorBoundaryInner>
  )
}
