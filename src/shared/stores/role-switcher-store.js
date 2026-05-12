import { create } from 'zustand'

// Admin impersonation: when set, useAuth() returns this profile instead of the
// real admin profile, so the entire UI (sidebar, guards, cabinet) reflects what
// the impersonated user sees. Persisted in sessionStorage — переживает reload
// в той же вкладке (debug-сценарий: «вошёл как печатник → обновил страницу»),
// но не утекает в новую вкладку и не остаётся после закрытия браузера.

const STORAGE_KEY = 'role-impersonation'

function readPersisted() {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writePersisted(profile) {
  if (typeof sessionStorage === 'undefined') return
  try {
    if (profile) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch { /* quota / private-mode — ignore */ }
}

export const useRoleSwitcherStore = create((set, get) => ({
  impersonatedProfile: readPersisted(),

  setImpersonatedProfile: (profile) => {
    writePersisted(profile)
    set({ impersonatedProfile: profile })
  },

  resetImpersonation: () => {
    writePersisted(null)
    set({ impersonatedProfile: null })
  },

  isImpersonating: () => get().impersonatedProfile !== null,
}))
