import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ErrorBoundaryInner } from './ErrorBoundary'

vi.mock('@/shared/lib/sentry', () => ({
  captureError: vi.fn(() => 'mocked-event-id-abc12345'),
}))

// Helper component that throws on demand
function Boom({ shouldThrow, error }) {
  if (shouldThrow) throw error || new Error('Test error')
  return <div>OK</div>
}

describe('ErrorBoundaryInner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // suppress React error boundary console output in tests
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('renders children when no error', () => {
    render(
      <ErrorBoundaryInner>
        <div>child content</div>
      </ErrorBoundaryInner>
    )
    expect(screen.getByText('child content')).toBeInTheDocument()
  })

  it('shows fallback UI on render error', () => {
    render(
      <ErrorBoundaryInner>
        <Boom shouldThrow />
      </ErrorBoundaryInner>
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/что-то пошло не так/i)).toBeInTheDocument()
  })

  it('calls captureError with proper tags on catch', async () => {
    const { captureError } = await import('@/shared/lib/sentry')
    render(
      <ErrorBoundaryInner>
        <Boom shouldThrow />
      </ErrorBoundaryInner>
    )
    expect(captureError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ source: 'ErrorBoundary' }),
      })
    )
  })

  it('displays eventId when available', () => {
    render(
      <ErrorBoundaryInner>
        <Boom shouldThrow />
      </ErrorBoundaryInner>
    )
    expect(screen.getByText(/id ошибки/i)).toBeInTheDocument()
    // first 8 chars of mocked-event-id-abc12345
    expect(screen.getByText(/mocked-e/)).toBeInTheDocument()
  })

  it('shows chunk error UI for ChunkLoadError', () => {
    const chunkError = new Error('Loading chunk 5 failed')
    chunkError.name = 'ChunkLoadError'
    render(
      <ErrorBoundaryInner>
        <Boom shouldThrow error={chunkError} />
      </ErrorBoundaryInner>
    )
    expect(screen.getByText(/приложение обновилось/i)).toBeInTheDocument()
  })

  it('shows chunk error UI for Vite dynamic import failure', () => {
    const viteError = new Error('Failed to fetch dynamically imported module: /assets/x.js')
    render(
      <ErrorBoundaryInner>
        <Boom shouldThrow error={viteError} />
      </ErrorBoundaryInner>
    )
    expect(screen.getByText(/приложение обновилось/i)).toBeInTheDocument()
  })

  it('calls onRetry when retry button clicked', () => {
    const onRetry = vi.fn()
    render(
      <ErrorBoundaryInner onRetry={onRetry}>
        <Boom shouldThrow />
      </ErrorBoundaryInner>
    )
    fireEvent.click(screen.getByText(/попробовать снова/i))
    expect(onRetry).toHaveBeenCalled()
  })

  it('calls navigate to / when home button clicked', () => {
    const navigate = vi.fn()
    render(
      <ErrorBoundaryInner navigate={navigate}>
        <Boom shouldThrow />
      </ErrorBoundaryInner>
    )
    fireEvent.click(screen.getByText(/на главную/i))
    expect(navigate).toHaveBeenCalledWith('/')
  })
})
