/**
 * R23.1 (ТЗ 23.07 Фаза 7) — маппинг «Категория (склад) → type (учёт)».
 *
 * В БД `k24_materials.type` (film/lam_film/ink/resin/...) управляет структурной
 * логикой: FilmFields (плёнка/ламинация), единицы измерения, списание по
 * material_code, группировки. Менеджер работает с «Категорией» (9 фикс. + свои).
 * Форма материала показывает одно поле «Категория», а `type` выводится из неё
 * (для 9 стандартных категорий). Кастомные категории → type='utensils'.
 */

// Имя категории → type. Держать синхронно с сидом (миграция 087) и
// MATERIAL_CATEGORIES-лейблами в constants.js.
export const CATEGORY_NAME_TO_TYPE = {
  'Плёнка для печати': 'film',
  'Плёнка для ламинации': 'lam_film',
  'Химические вещества': 'resin',
  'Утварь': 'utensils',
  'Ножи для плоттера': 'blade',
  'Упаковка (коробки)': 'box',
  'БОПП пакеты ширина >100 мм': 'packaging_bag',
  'БОПП пакеты ширина ≤100 мм': 'packaging_bag',
  'Хоз. товары': 'household',
}

export function deriveTypeFromCategory(categoryName) {
  return CATEGORY_NAME_TO_TYPE[categoryName] || 'utensils'
}

const UNIT_BY_TYPE = { film: 'м', lam_film: 'м', ink: 'ml', resin: 'g', blade: 'шт' }
export function defaultUnitForType(type) {
  return UNIT_BY_TYPE[type] || 'шт'
}
