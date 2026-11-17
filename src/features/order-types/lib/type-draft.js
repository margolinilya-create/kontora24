// R25.7C: черновик редактора типа заказа.

/** Черновик редактора из типа реестра (или пустой / копия). */
export function typeToDraft(type, { copy = false } = {}) {
  if (!type) {
    return { key: null, name: '', short_name: '', is_set: false, is_builtin: false, head: { sample: true, prepress: true }, production: ['print'], locked_blocks: [], default_production: null, rates: {}, archived: false }
  }
  const rates = {}
  for (const [k, v] of Object.entries(type.rates || {})) rates[k] = { rate: String(v?.rate ?? ''), base: v?.base || 'item' }
  return {
    key: copy ? null : type.key,
    name: copy ? `${type.name} (копия)` : type.name,
    short_name: copy ? '' : (type.short_name || ''),
    is_set: !!type.is_set,
    // Копия встроенного — свой тип без замков (ТЗ 7.1: копия берёт маршрут и ставки).
    is_builtin: copy ? false : !!type.is_builtin,
    head: { sample: type.head?.sample !== false, prepress: type.head?.prepress !== false },
    production: Array.isArray(type.production) ? [...type.production] : [],
    locked_blocks: copy ? [] : (type.locked_blocks || []),
    default_production: copy ? null : (type.default_production || null),
    rates,
    archived: copy ? false : !!type.archived_at,
  }
}
