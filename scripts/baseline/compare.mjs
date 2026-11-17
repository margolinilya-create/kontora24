#!/usr/bin/env node
// R25 — сравнение эталона отчётов с новым прогоном r25_reports_baseline.sql.
// Использование: node scripts/baseline/compare.mjs [эталон.json] <новый.json>
// Принимает «чистый» JSON эталона или ответ запроса ([{ "baseline": {...} }]).
// Exit 0 — совпадает, 1 — есть расхождения (печатаются пути и значения).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
if (args.length < 1) {
  console.error('usage: node scripts/baseline/compare.mjs [baseline.json] <new.json>')
  process.exit(2)
}
const [basePath, nextPath] = args.length === 1 ? [join(here, 'r25-baseline.json'), args[0]] : args

function load(path) {
  let v = JSON.parse(readFileSync(path, 'utf8'))
  if (Array.isArray(v) && v.length === 1) v = v[0]
  if (v && typeof v === 'object' && 'baseline' in v) v = v.baseline
  if (typeof v === 'string') v = JSON.parse(v)
  return v
}

// Массивы строк сопоставляем по ключу, а не по индексу.
const ROW_KEYS = {
  payout_inputs: (r) => [r.worker_id, r.stage, r.order_type, r.shape].join('|'),
  three_d: (r) => `${r.number}|${r.design_index}`,
}

const diffs = []
function cmp(a, b, path) {
  if (typeof a === 'number' || typeof b === 'number') {
    if (Math.abs(Number(a ?? 0) - Number(b ?? 0)) > 0.005) diffs.push([path, a, b])
    return
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    const keyFn = ROW_KEYS[path.split('.').pop()]
    const toMap = (arr) => Object.fromEntries((arr || []).map((r, i) => [keyFn ? keyFn(r) : i, r]))
    return cmp(toMap(a), toMap(b), path + '[]')
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) cmp(a[k], b[k], `${path}.${k}`)
    return
  }
  if (a !== b) diffs.push([path, a, b])
}

const base = load(basePath)
const next = load(nextPath)
// meta.to может отличаться только при осознанном пересъёме эталона.
cmp(base, next, '$')

if (!diffs.length) {
  console.log(`OK: ${nextPath} совпадает с эталоном ${basePath}`)
  process.exit(0)
}
console.log(`Расхождений: ${diffs.length}`)
for (const [p, a, b] of diffs.slice(0, 200)) console.log(`${p}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`)
process.exit(1)
