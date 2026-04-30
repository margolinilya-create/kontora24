import { create } from 'zustand'

const getInitialTheme = () => {
  if (typeof window === 'undefined') return 'light'
  return localStorage.getItem('kontora24-theme') || 'light'
}

export const useThemeStore = create((set) => ({
  theme: getInitialTheme(),

  toggle: () => set((s) => {
    const next = s.theme === 'light' ? 'dark' : 'light'
    localStorage.setItem('kontora24-theme', next)
    document.documentElement.classList.toggle('dark', next === 'dark')
    return { theme: next }
  }),

  init: () => {
    const theme = getInitialTheme()
    document.documentElement.classList.toggle('dark', theme === 'dark')
    set({ theme })
  },
}))
