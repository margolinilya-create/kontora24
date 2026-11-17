// R25.5 (ТЗ 5.5): настройки калькулятора + плёнки/ламинация со склада.
// Настройки — k24_settings['calculator'] (общие для всех), привязка плёнок —
// k24_materials.calc_price_group / calc_display_name (читаем через view
// k24_materials_full: после 098 табличного SELECT у authenticated нет).
// Realtime на k24_settings (uuid-суффикс канала, как usePlannerData): открытые
// калькуляторы получают новые ставки без перезагрузки. k24_materials не в
// realtime-публикации, но calc_save_settings пишет плёнки ДО ключа settings —
// событие по settings перечитывает и плёнки.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'
import { normalizeSettings } from '../lib/calc'
import { fetchWarehouseCategories } from '@/features/warehouse/hooks/useWarehouseCategories'
import { orderFieldMaterials } from '@/features/warehouse/lib/order-material-categories'

export const CALC_SETTINGS_KEY = 'calculator'

const MATERIAL_COLS = 'id, type, name, material_code, archived_at, calc_price_group, calc_display_name, category_id'

function makeChannelId(prefix) {
  const uid = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))
  return `${prefix}-${uid}`
}

export function useCalculatorSettings() {
  const [raw, setRaw] = useState(null)
  const [films, setFilms] = useState([])
  const [laminations, setLaminations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      // R25.7B (ТЗ 7.5/7.7): плёнки и ламинация — по отметкам категорий склада
      // («Материал печати» / «Ламинация»); без отметок — по служебному типу.
      const [settingsR, materialsR, categories] = await Promise.all([
        supabase.from('k24_settings').select('key, value').eq('key', CALC_SETTINGS_KEY).maybeSingle(),
        supabase
          .from('k24_materials_full')
          .select(MATERIAL_COLS)
          .is('archived_at', null)
          .order('name'),
        fetchWarehouseCategories().catch((err) => {
          captureError(err, { tags: { source: 'useCalculatorSettings.categories' } })
          return []
        }),
      ])
      if (settingsR.error) throw settingsR.error
      if (materialsR.error) throw materialsR.error
      if (!mountedRef.current) return
      const mats = materialsR.data || []
      setRaw(settingsR.data?.value || null)
      setFilms(orderFieldMaterials(mats, categories, 'print').items)
      setLaminations(orderFieldMaterials(mats, categories, 'lamination').items)
    } catch (err) {
      captureError(err, { tags: { source: 'useCalculatorSettings.load' } })
      if (mountedRef.current) setError(err)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    load()
    const ch = supabase
      .channel(makeChannelId('calculator-settings'))
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'k24_settings', filter: `key=eq.${CALC_SETTINGS_KEY}` },
        () => { load({ silent: true }) })
      .subscribe()
    return () => {
      mountedRef.current = false
      supabase.removeChannel(ch)
    }
  }, [load])

  /** Сохранение вкладки настроек: ставки + таблица плёнок атомарно (RPC, право calc:settings). */
  const save = useCallback(async (value, filmRows) => {
    const { error: err } = await supabase.rpc('calc_save_settings', {
      p_value: value,
      p_films: (filmRows || []).map((f) => ({
        id: f.id,
        group: f.calc_price_group || null,
        display_name: f.calc_display_name || null,
      })),
    })
    if (err) throw err
    await load({ silent: true })
  }, [load])

  const settings = useMemo(() => normalizeSettings(raw), [raw])

  return {
    raw,
    settings,
    films,
    laminations,
    loading,
    error,
    refetch: load,
    save,
  }
}
