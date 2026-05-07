import { create } from 'zustand'

const STORAGE_KEY = 'kontora24-theme'

const getStoredTheme = () => {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(STORAGE_KEY)
}

const getSystemTheme = () => {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const applyTheme = (theme) => {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export const useThemeStore = create((set, get) => ({
  theme: getStoredTheme() || getSystemTheme(),
  isUserSet: !!getStoredTheme(),

  toggle: () => set((s) => {
    const next = s.theme === 'light' ? 'dark' : 'light'
    localStorage.setItem(STORAGE_KEY, next)
    applyTheme(next)
    return { theme: next, isUserSet: true }
  }),

  init: () => {
    const stored = getStoredTheme()
    const theme = stored || getSystemTheme()
    applyTheme(theme)
    set({ theme, isUserSet: !!stored })

    if (typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const onChange = (e) => {
        if (get().isUserSet) return
        const next = e.matches ? 'dark' : 'light'
        applyTheme(next)
        set({ theme: next })
      }
      mq.addEventListener?.('change', onChange)
    }
  },
}))
