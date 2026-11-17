// R25.7C: validateTypeRoute — зеркало SQL k24_validate_type_production (102).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  validateTypeRoute, typeRouteWarnings, toRouteUnits, fromRouteUnits,
  normalizeRates, rateStagesFor, isKnownProductionStage,
} from './validate-type-route'
import { typeToDraft } from './type-draft'

const SQL_102 = readFileSync(resolve(process.cwd(), 'supabase/migrations/102_r25_7_order_types.sql'), 'utf-8')

function parseSeed(sql) {
  const re = /\('(\w+)',\s*'([^']+)',\s*'([^']+)',\s*(true|false),\s*(true|false),\s*'(\[[^']*\])',\s*'(\[[^']*\])',\s*'(\[[^']*\])',\s*(\d+)\)/g
  const rows = []
  let m
  while ((m = re.exec(sql))) {
    rows.push({ key: m[1], name: m[2], is_builtin: m[4] === 'true', is_set: m[5] === 'true', production: JSON.parse(m[6]), default_production: JSON.parse(m[7]), locked_blocks: JSON.parse(m[8]) })
  }
  return rows
}

const SEED = parseSeed(SQL_102)
const PACK3D = SEED.find((t) => t.key === 'stickerpack3D')
const STICKER3D = SEED.find((t) => t.key === 'sticker3D')
const hasCustom1 = (k) => k === 'custom_1'

describe('validateTypeRoute: зеркало k24_validate_type_production', () => {
  it('сид 102: все 8 встроенных типов проходят проверку со своими замками', () => {
    expect(SEED).toHaveLength(8)
    for (const t of SEED) {
      expect(validateTypeRoute({ production: t.production, lockedBlocks: t.locked_blocks, isBuiltin: true }), t.key).toBeNull()
    }
  })

  it('SQL-функция содержит те же тексты ошибок (синхронность клиента и сервера)', () => {
    for (const msg of [
      'Этап повторяется в маршруте.',
      '«Сушка» может стоять только сразу после «Заливки».',
      'У встроенного типа первым этапом производства должна быть «Печать».',
      'Маршрут типа должен быть списком этапов.',
    ]) {
      expect(SQL_102).toContain(msg)
    }
  })

  it('3D стикерпак: ламинацию убрать можно (ТЗ 7.9)', () => {
    const production = PACK3D.production.filter((s) => s !== 'lamination')
    expect(validateTypeRoute({ production, lockedBlocks: PACK3D.locked_blocks, isBuiltin: true })).toBeNull()
  })

  it('3D стикерпак: нельзя убрать или переставить этапы от Выборки до Сборки 3D (ТЗ 7.9)', () => {
    const removed = PACK3D.production.filter((s) => s !== 'assembly_3d')
    expect(validateTypeRoute({ production: removed, lockedBlocks: PACK3D.locked_blocks, isBuiltin: true }))
      .toMatch(/Закреплённые этапы/)
    const swapped = ['print', 'lamination', 'cutting', 'pouring', 'selection', 'drying', 'assembly_3d']
    expect(validateTypeRoute({ production: swapped, lockedBlocks: PACK3D.locked_blocks, isBuiltin: true }))
      .not.toBeNull()
    const noSelection = PACK3D.production.filter((s) => s !== 'selection')
    expect(validateTypeRoute({ production: noSelection, lockedBlocks: PACK3D.locked_blocks, isBuiltin: true }))
      .toMatch(/нельзя убрать/)
  })

  it('3D стикер: «Заливка → Сушка» закреплены, печать — первой', () => {
    expect(validateTypeRoute({ production: ['print', 'pouring', 'drying'], lockedBlocks: STICKER3D.locked_blocks, isBuiltin: true })).toBeNull()
    expect(validateTypeRoute({ production: ['cutting', 'print', 'pouring', 'drying'], lockedBlocks: STICKER3D.locked_blocks, isBuiltin: true }))
      .toMatch(/первым этапом/)
  })

  it('«Сушка» только сразу после «Заливки» — и у своих типов', () => {
    expect(validateTypeRoute({ production: ['print', 'drying'] })).toMatch(/Сушка/)
    expect(validateTypeRoute({ production: ['drying'] })).toMatch(/Сушка/)
    expect(validateTypeRoute({ production: ['pouring', 'drying', 'cutting'] })).toBeNull()
  })

  it('повторы, неизвестные этапы, этапы вне цеха', () => {
    expect(validateTypeRoute({ production: ['print', 'print'] })).toMatch(/повторяется/)
    expect(validateTypeRoute({ production: ['packaging'] })).toMatch(/нельзя поставить/)
    expect(validateTypeRoute({ production: ['otk'] })).toMatch(/нельзя поставить/)
    expect(validateTypeRoute({ production: ['custom_1'], stageExists: () => false })).toMatch(/нельзя поставить/)
    expect(validateTypeRoute({ production: ['custom_1'], stageExists: hasCustom1 })).toBeNull()
    expect(validateTypeRoute({ production: 'print' })).toMatch(/списком/)
  })

  it('пустая производственная часть допустима у своего типа — с предупреждением', () => {
    expect(validateTypeRoute({ production: [] })).toBeNull()
    expect(typeRouteWarnings([])).toHaveLength(1)
    expect(typeRouteWarnings(['print'])).toHaveLength(0)
    expect(validateTypeRoute({ production: [], isBuiltin: true })).toMatch(/первым этапом/)
  })

  it('isKnownProductionStage: встроенные этапы цеха и свои из каталога', () => {
    expect(isKnownProductionStage('print')).toBe(true)
    expect(isKnownProductionStage('prepress')).toBe(false)
    expect(isKnownProductionStage('custom_7', (k) => k === 'custom_7')).toBe(true)
  })
})

describe('конструктор: элементы маршрута', () => {
  it('закреплённый блок — один элемент; обратное преобразование без потерь', () => {
    const units = toRouteUnits(PACK3D.production, PACK3D.locked_blocks)
    expect(units.map((u) => u.locked)).toEqual([true, false, false, true])
    expect(units[3].stages).toEqual(['selection', 'pouring', 'drying', 'assembly_3d'])
    expect(fromRouteUnits(units)).toEqual(PACK3D.production)
  })

  it('блок не целиком (сломан) → этапы по одному', () => {
    const units = toRouteUnits(['print', 'pouring', 'cutting', 'drying'], STICKER3D.locked_blocks)
    expect(units.every((u) => u.stages.length === 1)).toBe(true)
  })
})

describe('ставки своего типа', () => {
  it('этапы ставок = производство + упаковка', () => {
    expect(rateStagesFor(['print', 'custom_1'])).toEqual(['print', 'custom_1', 'packaging'])
  })

  it('normalizeRates: пустые убираются, «за стикер» только у набора, чужие этапы отбрасываются', () => {
    const rates = {
      print: { rate: '0,5', base: 'sticker' },
      custom_1: { rate: '2', base: 'item' },
      cutting: { rate: '', base: 'item' },
      pouring: { rate: '1', base: 'item' },
    }
    expect(normalizeRates(rates, ['print', 'custom_1', 'cutting'], false)).toEqual({
      print: { rate: 0.5, base: 'item' },
      custom_1: { rate: 2, base: 'item' },
    })
    expect(normalizeRates(rates, ['print', 'custom_1'], true).print).toEqual({ rate: 0.5, base: 'sticker' })
    expect(normalizeRates({}, ['print'], false)).toBeNull()
  })

  it('«Скопировать из…» встроенного: свой тип с тем же маршрутом, без замков и ключа', () => {
    const d = typeToDraft(PACK3D, { copy: true })
    expect(d.key).toBeNull()
    expect(d.is_builtin).toBe(false)
    expect(d.production).toEqual(PACK3D.production)
    expect(d.locked_blocks).toEqual([])
    expect(d.name).toMatch(/копия/)
  })
})
