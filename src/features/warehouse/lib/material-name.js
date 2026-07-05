import { FILM_FINISHES } from '@/shared/constants'

// Сборка отображаемого имени позиции плёнки/ламинации из структурных полей
// (запрос менеджера 05.07). Единый формат вместо свободного текста:
//   «Orajet 3640 Белая Глянцевая 1.26 м».
// Пустые поля пропускаются; ширина — с суффиксом «м». Порядок: производитель →
// серия → цвет → финиш → ширина.
export function composeMaterialName({ manufacturer, product_line, color, finish, roll_width_m } = {}) {
  const width = roll_width_m != null && roll_width_m !== '' && Number(roll_width_m) > 0
    ? `${Number(roll_width_m)} м`
    : null
  return [
    manufacturer,
    product_line,
    color,
    finish ? FILM_FINISHES[finish] : null,
    width,
  ]
    .map((s) => (s == null ? '' : String(s).trim()))
    .filter(Boolean)
    .join(' ')
}

// Тип с составным именем (плёнка/ламинация). Для остальных материалов name —
// свободный текст.
export function isStructuredFilmType(type) {
  return type === 'film' || type === 'lam_film'
}
