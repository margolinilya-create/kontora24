import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { execSync } from 'child_process'
import {
  classifyMaterialOperation, computeBalanceAfter, compareMovementsDesc,
  expectedClosing, isTurnoverBalanced, groupTurnoverByCategory, groupReceiptsByCategory,
  periodRange, formatRangeLabel, moscowDateString, enteredOnOtherDay,
  parseJournalFilters, serializeJournalFilters, buildRpcFilters, DEFAULT_JOURNAL_FILTERS,
  buildJournalAoa, buildHistoryAoa, buildReceiptsAoa, buildTurnoverAoa, buildParamsAoa,
  excelDate, editableKindsForDelta, OPERATION_KIND_KEYS,
} from './warehouse-journal'

describe('classifyMaterialOperation (таблица 8.3)', () => {
  const cases = [
    ['Списание по факту: плёнка', -3, 'order_consumption', true, false],
    ['Списание по факту: смола', 14, 'correction', true, false],
    ['Авто: печать заказа (краска)', -1, 'order_consumption', true, false],
    ['Возврат: смена коробки', 1, 'correction', true, false],
    ['Возврат при удалении заказа #3', 5, 'correction', true, false],
    ['Инвентаризация', 10, 'inventory', false, false],
    ['Инвентаризация', -10, 'inventory', false, false],
    ['Приход', 51, 'purchase', false, false],
    ['Расход', -2, 'manual_consumption', false, false],
    ['Заказ #12', -2, 'manual_consumption', false, false],
    ['закупка', 2, 'purchase', false, true],
    ['Приход 14 июля', 1, 'purchase', false, true],
    ['забрал ярослав', -1, 'manual_consumption', false, true],
    ['инвент', 10, 'purchase', false, true],
    ['Начальный остаток (перенос истории)', 7, 'opening', false, false],
    [null, 3, 'purchase', false, true],
  ]
  it.each(cases)('%s (%d) → %s', (reason, delta, kind, isAuto, needsReview) => {
    expect(classifyMaterialOperation(reason, delta)).toEqual({ kind, isAuto, needsReview })
  })

  it('SQL-классификатор 096 содержит те же префиксы и системные причины', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/096_r25_8_warehouse_journal.sql'), 'utf-8')
    for (const s of ["'Списание по факту%'", "'Авто:%'", "'Возврат%'", "'Начальный остаток%'", "'Заказ #%'", "'Инвентаризация', 'Приход', 'Расход'"]) {
      expect(sql).toContain(s)
    }
  })
})

describe('editableKindsForDelta', () => {
  it('приход нельзя превратить в расход и наоборот, «Списание на заказ» не выставляется', () => {
    expect(editableKindsForDelta(5)).toContain('purchase')
    expect(editableKindsForDelta(5)).not.toContain('manual_consumption')
    expect(editableKindsForDelta(-5)).toContain('manual_consumption')
    expect(editableKindsForDelta(-5)).not.toContain('purchase')
    for (const d of [5, -5, 0]) expect(editableKindsForDelta(d)).not.toContain('order_consumption')
  })
})

describe('computeBalanceAfter', () => {
  const rows = [
    { id: 'a', op_date: '2026-07-01', created_at: '2026-07-01T07:00:00Z', delta: 120 },
    { id: 'b', op_date: '2026-07-05', created_at: '2026-07-05T07:00:00Z', delta: -30 },
    { id: 'c', op_date: '2026-07-06', created_at: '2026-07-06T07:00:00Z', delta: 5 },
    // внесено 20.07, но дата поступления 14.07 → в хронологии стоит раньше c? нет: 14 > 06
    { id: 'd', op_date: '2026-07-14', created_at: '2026-07-20T07:00:00Z', delta: 10 },
    { id: 'o', op_date: '2026-06-30', created_at: '2026-11-17T07:00:00Z', delta: -5 },
  ]

  it('у самой свежей строки остаток после = текущему остатку', () => {
    const out = computeBalanceAfter(rows, 100)
    expect(out[0].id).toBe('d')
    expect(out[0].balance_after).toBe(100)
  })

  it('считает назад от текущего остатка, порядок — по дате операции', () => {
    const out = computeBalanceAfter(rows, 100)
    expect(out.map((r) => [r.id, r.balance_after])).toEqual([
      ['d', 100], ['c', 90], ['b', 85], ['a', 115], ['o', -5],
    ])
  })

  it('после переноса (Σ операций = остаток) у самой старой строки остаток после = её delta', () => {
    const out = computeBalanceAfter(rows, rows.reduce((s, r) => s + r.delta, 0))
    expect(out[out.length - 1].balance_after).toBe(out[out.length - 1].delta)
  })

  it('compareMovementsDesc: одинаковая дата → по времени внесения', () => {
    const a = { id: '1', op_date: '2026-07-01', created_at: '2026-07-01T07:00:00Z' }
    const b = { id: '2', op_date: '2026-07-01', created_at: '2026-07-01T09:00:00Z' }
    expect([a, b].sort(compareMovementsDesc)[0]).toBe(b)
  })
})

describe('оборотная ведомость', () => {
  const row = {
    material_id: 'm1', material_name: 'Orajet', unit: 'm', category_id: 'c1', category_name: 'Плёнка',
    opening: -5, purchased: 130, order_consumption: 30, manual_consumption: 0, inventory: 0, corrections: 5,
    closing: 100, purchase_count: 2, last_purchase_date: '2026-07-20', purchase_sum: 6500,
  }

  it('равенство: начало + поступило − списано − расход ± инв. ± корр. = конец', () => {
    expect(expectedClosing(row)).toBe(100)
    expect(isTurnoverBalanced(row)).toBe(true)
    expect(isTurnoverBalanced({ ...row, closing: 99 })).toBe(false)
  })

  it('категория с разными единицами: количества не складываются, рубли — да', () => {
    const groups = groupTurnoverByCategory([
      { ...row, material_id: 'r1', category_id: 'chem', category_name: 'Химия', unit: 'g', purchase_sum: 100 },
      { ...row, material_id: 'r2', category_id: 'chem', category_name: 'Химия', unit: 'ml', purchase_sum: 50 },
      row,
      { ...row, material_id: 'm2', purchase_sum: null },
    ])
    const chem = groups.find((g) => g.category_id === 'chem')
    expect(chem.mixedUnits).toBe(true)
    expect(chem.totals.opening).toBeNull()
    expect(chem.totals.purchase_sum).toBe(150)
    const film = groups.find((g) => g.category_id === 'c1')
    expect(film.mixedUnits).toBe(false)
    expect(film.totals.purchased).toBe(260)
    expect(film.totals.purchase_sum).toBe(6500)
    expect(isTurnoverBalanced(film.totals)).toBe(true)
  })

  it('без права на финансы суммы категории = null', () => {
    const [g] = groupTurnoverByCategory([{ ...row, purchase_sum: null }])
    expect(g.totals.purchase_sum).toBeNull()
  })
})

describe('groupReceiptsByCategory', () => {
  it('число поставок, количество, сумма и общий итог', () => {
    const { groups, total } = groupReceiptsByCategory([
      { id: '1', category_id: 'c1', category_name: 'Плёнка', unit: 'm', delta: 10, total_cost: 500, op_date: '2026-10-02' },
      { id: '2', category_id: 'c1', category_name: 'Плёнка', unit: 'm', delta: 20, total_cost: 1000, op_date: '2026-10-09' },
      { id: '3', category_id: 'c2', category_name: 'Химия', unit: 'g', delta: 5, total_cost: null, op_date: '2026-10-03' },
      { id: '4', category_id: 'c2', category_name: 'Химия', unit: 'ml', delta: 5, total_cost: 30, op_date: '2026-10-01' },
    ])
    const film = groups.find((g) => g.category_id === 'c1')
    expect(film).toMatchObject({ count: 2, qty: 30, unit: 'm', sum: 1500, lastDate: '2026-10-09' })
    const chem = groups.find((g) => g.category_id === 'c2')
    expect(chem.mixedUnits).toBe(true)
    expect(chem.qty).toBeNull()
    expect(total).toEqual({ count: 4, sum: 1530 })
  })
})

describe('периоды', () => {
  it('диапазоны от «сегодня» по Москве', () => {
    expect(periodRange('today', '2026-11-17')).toEqual({ from: '2026-11-17', to: '2026-11-17' })
    expect(periodRange('7d', '2026-11-17')).toEqual({ from: '2026-11-11', to: '2026-11-17' })
    expect(periodRange('month', '2026-11-17')).toEqual({ from: '2026-11-01', to: '2026-11-17' })
    expect(periodRange('prev_month', '2026-11-17')).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(periodRange('prev_month', '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(periodRange('quarter', '2026-11-17')).toEqual({ from: '2026-10-01', to: '2026-11-17' })
    expect(periodRange('year', '2026-11-17')).toEqual({ from: '2026-01-01', to: '2026-11-17' })
    expect(periodRange('all', '2026-11-17')).toEqual({ from: null, to: null })
    expect(periodRange('custom', '2026-11-17', { from: '2026-07-01', to: '2026-07-31' })).toEqual({ from: '2026-07-01', to: '2026-07-31' })
  })

  it('formatRangeLabel', () => {
    expect(formatRangeLabel({ from: '2026-10-01', to: '2026-10-31' })).toBe('01.10.2026–31.10.2026')
    expect(formatRangeLabel({ from: null, to: null })).toBe('всё время')
  })

  it('moscowDateString: 22:30 UTC — уже следующий день в Москве', () => {
    expect(moscowDateString(new Date('2026-07-13T22:30:00Z'))).toBe('2026-07-14')
  })

  it('enteredOnOtherDay: приход 14.07, внесённый 17.11', () => {
    expect(enteredOnOtherDay({ op_date: '2026-07-14', created_at: '2026-11-17T09:00:00Z' })).toBe(true)
    expect(enteredOnOtherDay({ op_date: '2026-11-17', created_at: '2026-11-17T09:00:00Z' })).toBe(false)
  })
})

describe('фильтры ↔ URL ↔ RPC', () => {
  it('round-trip через URLSearchParams', () => {
    const f = {
      ...DEFAULT_JOURNAL_FILTERS, period: 'custom', from: '2026-10-01', to: '2026-10-31',
      categories: ['c1', 'c2'], kinds: ['purchase'], auto: 'manual', review: true, q: 'УПД', sort: 'qty_desc',
    }
    const sp = new URLSearchParams(serializeJournalFilters(f, { tab: 'journal' }))
    expect(sp.get('tab')).toBe('journal')
    expect(parseJournalFilters(sp)).toEqual(f)
  })

  it('дефолты не попадают в адрес, мусор отбрасывается', () => {
    expect(serializeJournalFilters(DEFAULT_JOURNAL_FILTERS)).toEqual({})
    const f = parseJournalFilters(new URLSearchParams('kinds=purchase,hack&sort=evil&auto=x'))
    expect(f.kinds).toEqual(['purchase'])
    expect(f.sort).toBe('date_desc')
    expect(f.auto).toBe('')
  })

  it('buildRpcFilters', () => {
    const p = buildRpcFilters({
      ...DEFAULT_JOURNAL_FILTERS, period: 'month', categories: ['c1'], material: 'm1',
      kinds: ['purchase'], auto: 'auto', review: true, supplier: ' Ромашка ', order: '#42', user: 'u1', q: 'УПД-7',
    }, '2026-10-15')
    expect(p).toEqual({
      from: '2026-10-01', to: '2026-10-15', category_ids: ['c1'], material_id: 'm1', kinds: ['purchase'],
      auto: 'auto', needs_review: true, supplier: 'Ромашка', order_number: '42', created_by: 'u1', q: 'УПД-7',
    })
    expect(buildRpcFilters(DEFAULT_JOURNAL_FILTERS)).toEqual({})
  })

  it('все виды операций совпадают с CHECK миграции 096', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/096_r25_8_warehouse_journal.sql'), 'utf-8')
    for (const k of OPERATION_KIND_KEYS) expect(sql).toContain(`'${k}'`)
  })
})

describe('Excel AOA', () => {
  const rows = [
    {
      id: '1', op_date: '2026-10-02', created_at: '2026-10-05T08:00:00Z', category_id: 'c1', category_name: 'Плёнка',
      material_name: 'Orajet', kind: 'purchase', is_auto: false, delta: 10, unit: 'm', balance_after: 110,
      total_cost: 500, unit_cost: 50, supplier: 'Ромашка', doc_number: 'УПД-1', order_number: null, reason: '', created_by_name: 'Аня',
    },
    {
      id: '2', op_date: '2026-10-03', created_at: '2026-10-03T08:00:00Z', category_id: 'c1', category_name: 'Плёнка',
      material_name: 'Orajet', kind: 'order_consumption', is_auto: true, delta: -3, unit: 'm', balance_after: 107,
      total_cost: null, unit_cost: null, supplier: null, doc_number: null, order_number: 42, reason: 'Списание по факту: плёнка', created_by_name: null,
    },
  ]

  it('без права на финансы денежных колонок нет совсем', () => {
    const aoa = buildJournalAoa(rows, { showMoney: false })
    expect(aoa[0].some((h) => /₽/.test(h))).toBe(false)
    expect(aoa[0]).toHaveLength(aoa[1].length)
    const withMoney = buildJournalAoa(rows, { showMoney: true })
    expect(withMoney[0]).toContain('Сумма, ₽')
    expect(withMoney[0]).toContain('Цена за ед., ₽')
    expect(withMoney[0].length).toBe(aoa[0].length + 2)
  })

  it('числа — числами, даты — Date, единица — отдельной колонкой, «Система» у авто', () => {
    const aoa = buildJournalAoa(rows, { showMoney: true, showBalance: true })
    const h = aoa[0]
    const r = aoa[2]
    expect(r[h.indexOf('Количество')]).toBe(-3)
    expect(r[h.indexOf('Ед.')]).toBe('m')
    expect(r[h.indexOf('Остаток после')]).toBe(107)
    expect(r[h.indexOf('Дата операции')]).toBeInstanceOf(Date)
    expect(r[h.indexOf('Заказ')]).toBe(42)
    expect(r[h.indexOf('Кто')]).toBe('Система')
    expect(r[h.indexOf('Сумма, ₽')]).toBeNull()
  })

  it('excelDate — полдень UTC (не съезжает на соседний день)', () => {
    const d = excelDate('2026-07-14')
    expect(d.toISOString()).toBe('2026-07-14T12:00:00.000Z')
    expect(excelDate(null)).toBeNull()
  })

  it('история позиции: остаток после в каждой строке, без денег без права', () => {
    const aoa = buildHistoryAoa(rows, { showMoney: false })
    expect(aoa[0]).toContain('Остаток после')
    expect(aoa[0].some((h) => /₽/.test(h))).toBe(false)
    expect(aoa[1][aoa[0].indexOf('Остаток после')]).toBe(110)
  })

  it('поступления: строки-итоги по категориям + общий итог совпадают с экраном', () => {
    const receipts = rows.filter((r) => r.kind === 'purchase')
    const aoa = buildReceiptsAoa(receipts, { showMoney: true })
    const h = aoa[0]
    const sumCol = h.indexOf('Сумма, ₽')
    expect(aoa[1][0]).toMatch(/Плёнка — итого \(1 пост\.\)/)
    expect(aoa[1][sumCol]).toBe(500)
    expect(aoa[aoa.length - 1][0]).toBe('Итого: 1 пост.')
    expect(aoa[aoa.length - 1][sumCol]).toBe(groupReceiptsByCategory(receipts).total.sum)
    expect(buildReceiptsAoa(receipts, { showMoney: false })[0].some((x) => /₽/.test(x))).toBe(false)
  })

  it('сводка: «Закуплено, ₽» только с финансами', () => {
    const t = [{ material_id: 'm', material_name: 'Orajet', unit: 'm', category_id: 'c', category_name: 'Плёнка', opening: 0, purchased: 1, order_consumption: 0, manual_consumption: 0, inventory: 0, corrections: 0, closing: 1, purchase_count: 1, last_purchase_date: '2026-10-01', purchase_sum: 10 }]
    expect(buildTurnoverAoa(t, { showMoney: true })[0]).toContain('Закуплено, ₽')
    expect(buildTurnoverAoa(t, { showMoney: false })[0]).not.toContain('Закуплено, ₽')
    expect(buildTurnoverAoa(t)).toHaveLength(3) // заголовок + категория + позиция
  })

  it('параметры: пустые значения пропускаются, кто и когда — всегда', () => {
    const at = new Date('2026-11-17T10:00:00Z')
    const aoa = buildParamsAoa([['Период', 'всё время'], ['Поставщик', '']], { user: 'Илья', at })
    expect(aoa).toEqual([['Параметр', 'Значение'], ['Период', 'всё время'], ['Выгрузил', 'Илья'], ['Когда', at]])
  })
})

describe('места записи операций склада передают вид явно', () => {
  it('фронт не вставляет операции напрямую — только через addMaterialTransaction/RPC', () => {
    const out = execSync(
      `grep -rln "from('k24_material_transactions')" src/ --include="*.js" --include="*.jsx" || true`,
      { encoding: 'utf-8' },
    ).split('\n').filter(Boolean)
    for (const f of out) {
      const src = readFileSync(resolve(process.cwd(), f), 'utf-8')
      const re = /from\('k24_material_transactions'\)([\s\S]{0,200})/g
      let m
      while ((m = re.exec(src))) {
        expect(m[1], `${f}: прямой insert в k24_material_transactions`).not.toMatch(/^\s*\.insert\(/)
      }
    }
  })

  it('каждый вызов addMaterialTransaction передаёт kind', () => {
    const files = execSync(
      `grep -rl "addMaterialTransaction(" src/ --include="*.js" --include="*.jsx" || true`,
      { encoding: 'utf-8' },
    ).split('\n').filter(Boolean)
    for (const f of files) {
      const src = readFileSync(resolve(process.cwd(), f), 'utf-8')
      const re = /addMaterialTransaction\(\{([\s\S]*?)\}\)/g
      let m
      while ((m = re.exec(src))) {
        expect(m[1], `${f}: addMaterialTransaction без kind`).toMatch(/\bkind\s*[:,]/)
      }
    }
  })

  it('SQL-места записи (096) передают kind, is_auto и op_date', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/096_r25_8_warehouse_journal.sql'), 'utf-8')
    const inserts = sql.match(/INSERT INTO (?:public\.)?k24_material_transactions\s*\([^)]*\)/g) || []
    expect(inserts.length).toBeGreaterThanOrEqual(8) // 5 deduct + 1 cascade + add_operation + inventory
    for (const ins of inserts) {
      expect(ins).toMatch(/\bkind\b/)
      expect(ins).toMatch(/\bis_auto\b/)
      expect(ins).toMatch(/\bop_date\b/)
    }
  })
})
