import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { DryingTimer } from './DryingTimer'

describe('DryingTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('показывает заглушку если startedAt не задан', () => {
    render(<DryingTimer startedAt={null} />)
    expect(screen.getByText(/Сушка ещё не запущена/i)).toBeInTheDocument()
  })

  it('показывает обратный отсчёт от 36 часов', () => {
    const startedAt = new Date('2026-06-01T12:00:00Z')
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))
    render(<DryingTimer startedAt={startedAt} />)
    // Через 1 секунду после старта остаётся 35:59:59
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText(/35:59:5\d/)).toBeInTheDocument()
  })

  it('показывает «Готово» после истечения 36 часов', () => {
    const startedAt = new Date('2026-06-01T12:00:00Z')
    // 12:00 UTC + 36h = 2026-06-03T00:00:00Z (конец сушки).
    // Сдвигаемся на 1ч после конца — таймер истёк.
    vi.setSystemTime(new Date('2026-06-03T01:00:00Z'))
    render(<DryingTimer startedAt={startedAt} />)
    expect(screen.getByText('Готово')).toBeInTheDocument()
    expect(screen.getByText(/перейдёт автоматически/i)).toBeInTheDocument()
  })

  it('кастомный durationHours', () => {
    const startedAt = new Date('2026-06-01T12:00:00Z')
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))
    render(<DryingTimer startedAt={startedAt} durationHours={2} />)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText(/01:59:5\d/)).toBeInTheDocument()
  })
})
