import '@testing-library/jest-dom'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Cleanup DOM after each test
afterEach(() => {
  cleanup()
})

// Reset localStorage between tests
afterEach(() => {
  localStorage.clear()
})

// Stub navigator.vibrate
Object.defineProperty(navigator, 'vibrate', {
  value: vi.fn(),
  writable: true,
})

// Stub Audio (used by sound.js)
globalThis.Audio = vi.fn(() => ({
  play: vi.fn(() => Promise.resolve()),
  pause: vi.fn(),
  load: vi.fn(),
}))
