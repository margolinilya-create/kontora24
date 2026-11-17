// R25.5: плёнки и ламинация склада для калькулятора (чистые функции).
import { FILM_GROUPS } from './calc'

const GROUP_ORDER = ['white', 'holo', 'metal']

/** Только плёнки с назначенной ценовой группой, сгруппированные по группам. */
export function groupFilms(films) {
  return GROUP_ORDER
    .map((g) => ({
      group: g,
      label: FILM_GROUPS[g].label,
      items: (films || []).filter((f) => f.calc_price_group === g && !f.archived_at),
    }))
    .filter((g) => g.items.length > 0)
}

/** Сколько активных плёнок без ценовой группы («Не настроены для калькулятора»). */
export function countUnmappedFilms(films) {
  return (films || []).filter((f) => !f.archived_at && !f.calc_price_group).length
}

/**
 * Выбор плёнки: явно выбранная → по умолчанию из настроек → первая доступная.
 * Возвращает null, если ни одна плёнка не настроена.
 */
export function resolveFilm(films, selectedId, defaultId) {
  const usable = (films || []).filter((f) => f.calc_price_group && !f.archived_at)
  return usable.find((f) => f.id === selectedId)
    || usable.find((f) => f.id === defaultId)
    || usable[0]
    || null
}

/** «Название в расчёте» → иначе общее имя группы (не складское имя с шириной рулона). */
export function filmDisplayName(film) {
  if (!film) return ''
  return film.calc_display_name?.trim() || FILM_GROUPS[film.calc_price_group]?.defaultName || film.name
}

/** Ламинация калькулятора — матовые/глянцевые позиции склада. */
export function laminationOptions(laminations) {
  return (laminations || []).filter((m) => !m.archived_at && (m.material_code === 'matte' || m.material_code === 'glossy'))
}

export function laminationDisplayName(lam) {
  if (!lam) return null
  if (lam.material_code === 'matte') return 'Матовая'
  if (lam.material_code === 'glossy') return 'Глянцевая'
  return lam.name
}
