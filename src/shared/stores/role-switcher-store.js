import { create } from 'zustand'

export const useRoleSwitcherStore = create((set, get) => ({
  emulatedRole: null,

  setEmulatedRole: (role) => set({ emulatedRole: role }),

  resetRole: () => set({ emulatedRole: null }),

  isEmulating: () => get().emulatedRole !== null,
}))
