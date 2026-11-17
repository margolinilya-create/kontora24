import { fetchAllChunked } from './export-xlsx'

/**
 * Забрать ВСЕ строки запроса порциями по 1000 (PostgREST режет ответ до
 * max_rows = 1000, поэтому `.limit(10000)` молча отдаёт первую тысячу).
 *
 * @param {() => object} makeQuery — фабрика СВЕЖЕГО query builder'а
 *   (builder мутабелен и одноразов, поэтому на каждую порцию — новый).
 *   Запрос обязан иметь детерминированный порядок, оканчивающийся
 *   уникальной колонкой (например `.order('created_at').order('id')`),
 *   иначе порции на границах могут дублировать/терять строки.
 * @param {{ cap?: number, chunk?: number }} [opts] — cap по умолчанию 50 000;
 *   превышение — ошибка EXPORT_TOO_LARGE («сузьте период»), а не тихий срез.
 * @returns {Promise<Array>}
 */
export async function fetchAllRows(makeQuery, { cap = 50000, chunk = 1000 } = {}) {
  return fetchAllChunked(async (from, to) => {
    const { data, error } = await makeQuery().range(from, to)
    if (error) throw error
    return data || []
  }, { chunk, cap })
}

/**
 * fetchAllRows по большому списку id: id режутся на пачки (длина URL
 * `.in(...)` ограничена — ~100 uuid на запрос), каждая пачка грузится
 * постранично. Пачки идут последовательно (не душим PostgREST).
 *
 * @param {Array<string>} ids
 * @param {(idsChunk: Array<string>) => object} makeQuery — фабрика builder'а
 *   для пачки id (с детерминированным `.order(...)`, см. fetchAllRows).
 * @param {{ idChunk?: number, cap?: number }} [opts]
 * @returns {Promise<Array>}
 */
export async function fetchAllRowsByIds(ids, makeQuery, { idChunk = 100, cap = 50000 } = {}) {
  const uniq = [...new Set((ids || []).filter(Boolean))]
  const out = []
  for (let i = 0; i < uniq.length; i += idChunk) {
    const part = uniq.slice(i, i + idChunk)
    const rows = await fetchAllRows(() => makeQuery(part), { cap })
    out.push(...rows)
    if (out.length > cap) {
      const err = new Error(`Слишком много строк (${out.length}). Предел — ${cap}: сузьте период.`)
      err.code = 'EXPORT_TOO_LARGE'
      throw err
    }
  }
  return out
}
