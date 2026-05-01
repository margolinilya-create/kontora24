import { create } from 'zustand'

export const useNotificationStore = create((set) => ({
  soundEnabled: localStorage.getItem('soundEnabled') !== 'false',
  toggleSound: () => set((s) => {
    const next = !s.soundEnabled
    localStorage.setItem('soundEnabled', next)
    return { soundEnabled: next }
  }),
}))
