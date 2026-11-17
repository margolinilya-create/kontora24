import { create } from 'zustand'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'
import { registerRouteRegistry, resetRouteRegistry } from '@/shared/lib/route-registry'

// R25.7A (ТЗ 17.11, Фаза 7): реестр типов заказов (k24_order_types) и
// каталог своих этапов (k24_stage_defs). Загружается при логине рядом с
// правами ролей (auth/store.js) и регистрируется в shared/lib/route-registry,
// откуда его читают getOrderRoute / getReprintRoute / formatOrderType /
// getStatusMeta. Ошибка загрузки не ломает приложение: реестр остаётся
// пустым → маршруты и подписи из констант.
//
// Колонки перечислены явно (без select('*')): rates — ставки своих типов,
// нужны для снимка маршрута; деньгами заказа не являются.
const TYPE_COLUMNS = 'key, name, short_name, is_builtin, is_set, head, production, locked_blocks, default_production, rates, sort_order, archived_at, updated_at'
const STAGE_COLUMNS = 'key, name, department, norm_per_8h, show_in_menu, otk_defect, sort_order, archived_at'

export const useOrderTypesStore = create((set) => ({
  types: [],
  stages: [],
  loaded: false,
  loading: false,
  error: null,

  async load() {
    set({ loading: true, error: null })
    try {
      const [typesRes, stagesRes] = await Promise.all([
        supabase.from('k24_order_types').select(TYPE_COLUMNS).order('sort_order'),
        supabase.from('k24_stage_defs').select(STAGE_COLUMNS).order('sort_order'),
      ])
      if (typesRes.error) throw typesRes.error
      if (stagesRes.error) throw stagesRes.error
      const types = typesRes.data || []
      const stages = stagesRes.data || []
      registerRouteRegistry({ types, stages })
      set({ types, stages, loaded: true, loading: false })
    } catch (err) {
      captureError(err, { tags: { source: 'orderTypesStore.load' } })
      // Реестр не трогаем: если он уже был загружен — остаётся прежним,
      // если нет — пуст и маршруты берутся из констант.
      set({ loading: false, error: err, loaded: true })
    }
  },

  reset() {
    resetRouteRegistry()
    set({ types: [], stages: [], loaded: false, error: null })
  },
}))
