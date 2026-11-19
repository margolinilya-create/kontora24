import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/shared/lib/sentry', () => ({ captureError: vi.fn() }))

const { useToastStore, toast } = await import('./toast-store')

describe('toast-store: кнопка действия (R27.0 «Повторить»)', () => {
  beforeEach(() => { useToastStore.setState({ toasts: [] }) })

  it('тост с action хранит кнопку', () => {
    const onClick = vi.fn()
    toast.error('Виды не сохранены', { action: { label: 'Повторить', onClick } })
    const [t] = useToastStore.getState().toasts
    expect(t.message).toBe('Виды не сохранены')
    expect(t.action.label).toBe('Повторить')
    t.action.onClick()
    expect(onClick).toHaveBeenCalled()
  })

  it('без action — прежний формат', () => {
    toast.info('Готово')
    expect(useToastStore.getState().toasts[0]).toEqual({ id: expect.any(Number), message: 'Готово', type: 'info' })
  })
})
