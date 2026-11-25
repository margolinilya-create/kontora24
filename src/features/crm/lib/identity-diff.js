// R28.0 — дифф каналов связи контакта при сохранении формы.
// Не «удалить всё → вставить заново»: если вставка упадёт, контакт не должен
// остаться без телефонов. Порядок применения в crm-api: insert → update → delete.

/**
 * @param {Array<{id, kind, value_norm, value, is_primary}>} existing — строки из БД
 * @param {Array<{kind, value_norm, value, is_primary}>} next — результат prepareIdentities
 * @returns {{ toInsert: object[], toUpdate: Array<{id, patch}>, toDelete: string[] }}
 */
export function diffIdentities(existing, next) {
  const byKey = new Map()
  for (const row of existing || []) byKey.set(`${row.kind}:${row.value_norm}`, row)

  const toInsert = []
  const toUpdate = []
  const kept = new Set()
  for (const row of next || []) {
    const key = `${row.kind}:${row.value_norm}`
    const old = byKey.get(key)
    if (!old) {
      toInsert.push({ kind: row.kind, value: row.value, value_norm: row.value_norm, is_primary: row.is_primary })
      continue
    }
    kept.add(old.id)
    const patch = {}
    if (old.value !== row.value) patch.value = row.value
    if (!!old.is_primary !== !!row.is_primary) patch.is_primary = !!row.is_primary
    if (Object.keys(patch).length) toUpdate.push({ id: old.id, patch })
  }
  const toDelete = (existing || []).filter((r) => !kept.has(r.id)).map((r) => r.id)
  return { toInsert, toUpdate, toDelete }
}
