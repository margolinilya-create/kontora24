import { create } from 'zustand'

// Admin impersonation: when set, useAuth() returns this profile instead of the
// real admin profile, so the entire UI (sidebar, guards, cabinet) reflects what
// the impersonated user sees. Resets on page reload (not persisted).
export const useRoleSwitcherStore = create((set, get) => ({
  impersonatedProfile: null,

  setImpersonatedProfile: (profile) => set({ impersonatedProfile: profile }),

  resetImpersonation: () => set({ impersonatedProfile: null }),

  isImpersonating: () => get().impersonatedProfile !== null,
}))
