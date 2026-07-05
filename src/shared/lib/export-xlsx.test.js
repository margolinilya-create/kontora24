import { describe, it, expect } from 'vitest'
import { sanitizeFilename } from './export-xlsx'

// QA 04.07, баг №6: период «Свой» кодируется как custom:YYYY-MM-DD:YYYY-MM-DD;
// двоеточия в download-атрибуте браузер отбрасывает вместе с именем и файл
// сохранялся как «download» без расширения.
describe('sanitizeFilename', () => {
  it('заменяет двоеточия custom-периода на дефисы', () => {
    expect(sanitizeFilename('unit-economics-custom:2026-01-01:2026-02-01'))
      .toBe('unit-economics-custom-2026-01-01-2026-02-01')
  })

  it('вычищает весь Windows-набор запрещённых символов', () => {
    expect(sanitizeFilename('a<b>c:d"e/f\\g|h?i*j')).toBe('a-b-c-d-e-f-g-h-i-j')
  })

  it('схлопывает повторные дефисы и обрезает точки/пробелы по краям', () => {
    expect(sanitizeFilename('  ..отчёт::за//месяц.. ')).toBe('отчёт-за-месяц')
  })

  it('кириллицу и обычные имена не трогает', () => {
    expect(sanitizeFilename('сотрудники-today')).toBe('сотрудники-today')
  })
})
