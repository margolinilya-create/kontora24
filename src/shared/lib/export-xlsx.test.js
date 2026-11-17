import { describe, it, expect, vi } from 'vitest'
import { sanitizeFilename, fetchAllChunked, excelDateFormat } from './export-xlsx'

describe('fetchAllChunked (R25.8)', () => {
  it('забирает порциями по chunk до неполной страницы и сообщает прогресс', async () => {
    const data = Array.from({ length: 2500 }, (_, i) => i)
    const fetchPage = vi.fn(async (from, to) => data.slice(from, to + 1))
    const progress = []
    const rows = await fetchAllChunked(fetchPage, { total: 2500, chunk: 1000, onProgress: (l, t) => progress.push([l, t]) })
    expect(rows).toHaveLength(2500)
    expect(fetchPage).toHaveBeenCalledTimes(3)
    expect(fetchPage.mock.calls[1]).toEqual([1000, 1999])
    expect(progress).toEqual([[1000, 2500], [2000, 2500], [2500, 2500]])
  })

  it('больше предела — просит сузить период, не делая запросов', async () => {
    const fetchPage = vi.fn()
    await expect(fetchAllChunked(fetchPage, { total: 60000, cap: 50000 })).rejects.toMatchObject({ code: 'EXPORT_TOO_LARGE' })
    expect(fetchPage).not.toHaveBeenCalled()
  })

  it('без total — останавливается на пределе', async () => {
    const fetchPage = vi.fn(async () => Array(10).fill(0))
    await expect(fetchAllChunked(fetchPage, { chunk: 10, cap: 30 })).rejects.toMatchObject({ code: 'EXPORT_TOO_LARGE' })
  })
})

describe('excelDateFormat (R25.8)', () => {
  it('полдень UTC — дата, иначе дата и время', () => {
    expect(excelDateFormat(new Date('2026-07-14T12:00:00Z'))).toBe('dd.mm.yyyy')
    expect(excelDateFormat(new Date('2026-07-14T09:31:00Z'))).toBe('dd.mm.yyyy hh:mm')
  })

  it('имя выгрузки склада сохраняет тире и точки внутри', () => {
    expect(sanitizeFilename('Склад — журнал 01.10.2026–31.10.2026')).toBe('Склад — журнал 01.10.2026–31.10.2026')
  })
})

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
