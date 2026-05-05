import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/shared/lib/sentry', () => ({
  captureError: vi.fn(),
}))

vi.mock('@/shared/stores/toast-store', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}))

import { safeAsync } from './safeAsync'
import { captureError } from '@/shared/lib/sentry'
import { toast } from '@/shared/stores/toast-store'

describe('safeAsync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns {data, error: null} on success', async () => {
    const result = await safeAsync(async () => 42)
    expect(result).toEqual({ data: 42, error: null })
    expect(captureError).not.toHaveBeenCalled()
  })

  it('returns {data: null, error} on throw', async () => {
    const err = new Error('boom')
    const result = await safeAsync(async () => {
      throw err
    })
    expect(result.data).toBeNull()
    expect(result.error).toBe(err)
  })

  it('calls captureError on throw', async () => {
    const err = new Error('kaboom')
    await safeAsync(async () => {
      throw err
    })
    expect(captureError).toHaveBeenCalledTimes(1)
    expect(captureError).toHaveBeenCalledWith(err, expect.any(Object))
  })

  it('does NOT call captureError on success', async () => {
    await safeAsync(async () => 'ok')
    expect(captureError).not.toHaveBeenCalled()
  })

  it('shows toast.error with translated message when showToast=true', async () => {
    await safeAsync(
      async () => {
        throw { code: '23505', message: 'duplicate key' }
      },
      { showToast: true }
    )
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalledWith(
      'Запись с такими данными уже есть. Проверьте поля или откройте существующую.'
    )
  })

  it('does NOT show toast when showToast is false/missing', async () => {
    await safeAsync(async () => {
      throw new Error('silent')
    })
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('calls onError callback with original error', async () => {
    const err = new Error('cb test')
    const onError = vi.fn()
    await safeAsync(
      async () => {
        throw err
      },
      { onError }
    )
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(err)
  })

  it('does NOT call onError on success', async () => {
    const onError = vi.fn()
    await safeAsync(async () => 'ok', { onError })
    expect(onError).not.toHaveBeenCalled()
  })

  it('passes context.tags to captureError', async () => {
    await safeAsync(
      async () => {
        throw new Error('ctx')
      },
      { context: { tags: { feature: 'orders', op: 'update' } } }
    )
    expect(captureError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { feature: 'orders', op: 'update' } })
    )
  })

  it('works without options at all', async () => {
    const err = new Error('no opts')
    const result = await safeAsync(async () => {
      throw err
    })
    expect(result).toEqual({ data: null, error: err })
    expect(captureError).toHaveBeenCalledWith(err, expect.any(Object))
  })

  it('never throws even if onError itself throws', async () => {
    const onError = vi.fn(() => {
      throw new Error('cb broken')
    })
    await expect(
      safeAsync(
        async () => {
          throw new Error('orig')
        },
        { onError }
      )
    ).resolves.toEqual({ data: null, error: expect.any(Error) })
  })

  it('handles synchronously-thrown errors inside async fn', async () => {
    const result = await safeAsync(() => {
      throw new Error('sync throw')
    })
    expect(result.data).toBeNull()
    expect(result.error.message).toBe('sync throw')
  })
})
