import { create } from 'zustand'
import { supabase } from '@/shared/lib/supabase'
import { useRolePermissionsStore } from './role-permissions-store'
import { useOrderTypesStore } from '@/features/order-types/store'

// Тот же пользователь (TOKEN_REFRESHED приносит новый объект user с теми же данными).
function isSameUser(a, b) {
  if (!a || !b) return false
  return a.id === b.id && a.email === b.email && a.updated_at === b.updated_at
}

// Профиль из БД не изменился — сравниваем по значению (плоская строка k24_profiles).
export function isSameProfile(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    const va = a[k]
    const vb = b[k]
    if (va === vb) continue
    if (va && vb && typeof va === 'object' && typeof vb === 'object'
      && JSON.stringify(va) === JSON.stringify(vb)) continue
    return false
  }
  return true
}

export const useAuthStore = create((set, get) => ({
  user: null,
  profile: null,
  loading: true,

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const { data: profile, error: profileErr } = await supabase
          .from('k24_profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
        // Если профиль не найден или RLS отказал — сбрасываем сессию,
        // иначе AuthGuard крутит спиннер вечно (user есть, profile=null).
        if (profileErr || !profile) {
          await supabase.auth.signOut()
          set({ user: null, profile: null, loading: false })
        } else {
          set({ user: session.user, profile, loading: false })
          // Загружаем динамические права (L2 RBAC) — параллельно, не блокируя UI
          useRolePermissionsStore.getState().load()
          // R25.7A: реестр типов заказов (маршруты/подписи; пуст → константы)
          useOrderTypesStore.getState().load()
        }
      } else {
        set({ user: null, profile: null, loading: false })
      }
    } catch {
      set({ user: null, profile: null, loading: false })
    }

    // Unsubscribe existing listener if initialize() is called again
    const existing = get()._authSubscription
    if (existing) existing.unsubscribe()

    // Listen for auth changes (store subscription for cleanup).
    // ВАЖНО: внутри callback нельзя вызывать supabase.* напрямую — будет дедлок
    // (см. https://supabase.com/docs/reference/javascript/auth-onauthstatechange).
    // Поэтому сам callback только синхронно меняет user; profile подтягиваем
    // через setTimeout(0), вне локa auth.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session?.user) {
        set({ user: null, profile: null })
        return
      }
      // Не трогаем стейт сразу — дождёмся профиля. Иначе AuthGuard мигнёт спиннером
      // на каждом TOKEN_REFRESHED.
      setTimeout(async () => {
        try {
          const { data: profile, error: profileErr } = await supabase
            .from('k24_profiles')
            .select('*')
            .eq('id', session.user.id)
            .single()
          // Транзиентная ошибка при TOKEN_REFRESHED — оставляем текущий профиль
          // (если он был), иначе на каждом моргании сети будет логаут.
          if (profileErr) return
          if (!profile) {
            // Профиль реально удалён — сбрасываем сессию
            supabase.auth.signOut()
            set({ user: null, profile: null })
            return
          }
          // TOKEN_REFRESHED каждые ~час: если пользователь и профиль те же —
          // не трогаем стор (иначе ререндер всего дерева, зависящего от profile).
          const cur = get()
          const sameUser = isSameUser(cur.user, session.user)
          const sameProfile = isSameProfile(cur.profile, profile)
          if (!sameUser || !sameProfile) {
            set({
              user: sameUser ? cur.user : session.user,
              profile: sameProfile ? cur.profile : profile,
            })
          }
          // Подгружаем права при первом профиле или смене юзера
          if (!useRolePermissionsStore.getState().loaded) {
            useRolePermissionsStore.getState().load()
          }
          if (!useOrderTypesStore.getState().loaded) {
            useOrderTypesStore.getState().load()
          }
        } catch {
          // swallow — keep existing state
        }
      }, 0)
    })
    set({ _authSubscription: subscription })

    // If "remember me" was unchecked, clear session on next load
    const rememberMe = localStorage.getItem('rememberMe')
    if (rememberMe === 'false') {
      localStorage.removeItem('rememberMe')
      supabase.auth.signOut()
    }
  },

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error

    // Verify this user has a Kontora24 profile
    const { data: profile } = await supabase
      .from('k24_profiles')
      .select('*')
      .eq('id', data.user.id)
      .single()

    if (!profile) {
      await supabase.auth.signOut()
      throw new Error('Нет доступа к Kontora24')
    }

    // Сразу проставляем store, чтобы LoginForm.navigate('/') не упал в AuthGuard
    // на user=null: onAuthStateChange может ещё не успеть отстрелять SIGNED_IN
    // к моменту следующего рендера, и AuthGuard кикнет обратно на /login.
    set({ user: data.user, profile, loading: false })
    useRolePermissionsStore.getState().load()
    useOrderTypesStore.getState().load()

    return data
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null })
    useRolePermissionsStore.getState().reset()
    useOrderTypesStore.getState().reset()
  },

  hasRole: (roles) => {
    const { profile } = get()
    if (!profile) return false
    if (Array.isArray(roles)) return roles.includes(profile.role)
    return profile.role === roles
  },
}))
