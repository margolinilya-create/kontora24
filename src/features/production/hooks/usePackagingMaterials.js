import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'

/**
 * Список материалов для упаковки: БОПП-пакеты + коробки.
 * Загружается один раз при первом монтировании формы упаковки.
 * Используется только на этапе packaging (фидбэк менеджера 17.05).
 */
export function usePackagingMaterials() {
  const [bags, setBags] = useState([])
  const [boxes, setBoxes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error: err } = await supabase
        .from('k24_materials')
        .select('id, name, type, unit, stock_qty, capacity_per_box')
        .in('type', ['packaging_bag', 'box'])
        .order('name')
      if (cancelled) return
      if (err) {
        setError(err)
        setLoading(false)
        return
      }
      const all = data || []
      setBags(all.filter((m) => m.type === 'packaging_bag'))
      setBoxes(all.filter((m) => m.type === 'box'))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  return { bags, boxes, loading, error }
}
