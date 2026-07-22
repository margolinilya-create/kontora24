import { describe, it, expect } from 'vitest'
import { buildEmployeeReportAoa, parseDayKey, EMPLOYEE_REPORT_HEADER } from './employee-report'

// R22.2 (ТЗ 20.07 Фаза 2) — подневный Excel-отчёт сотрудника.

const worker = {
  name: 'Пётр',
  days: {
    // 06.07.26 — понедельник
    '06.07.26': { minutes: 480, poured: 100, selected: 20, assembled: 5, packaged: 10, payout: 150 },
    // 07.07.26 — вторник
    '07.07.26': { minutes: 240, poured: 50, selected: 0, assembled: 0, packaged: 0, payout: 50 },
  },
}

describe('parseDayKey', () => {
  it('парсит dd.MM.yy', () => {
    const d = parseDayKey('06.07.26')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(6) // июль
    expect(d.getDate()).toBe(6)
  })
})

describe('buildEmployeeReportAoa', () => {
  it('заголовок соответствует ТЗ', () => {
    const aoa = buildEmployeeReportAoa(worker)
    expect(aoa[0]).toEqual(EMPLOYEE_REPORT_HEADER)
  })

  it('строка на каждый день + итоговая «Общее»', () => {
    const aoa = buildEmployeeReportAoa(worker)
    // header + 2 дня + Общее
    expect(aoa.length).toBe(4)
    expect(aoa[1][0]).toBe('6.07')       // Дата Д.ММ
    expect(aoa[1][1]).toBe('Пн')          // день недели
    expect(aoa[1][2]).toBe(8)             // часы = 480/60
    expect(aoa[1][7]).toBe(150)           // заработок
    expect(aoa[3][0]).toBe('Общее')
  })

  it('итоговая строка суммирует все столбцы', () => {
    const total = buildEmployeeReportAoa(worker).at(-1)
    expect(total[2]).toBe(12)   // 8 + 4 часа
    expect(total[3]).toBe(150)  // залито 100 + 50
    expect(total[4]).toBe(20)   // выбрано
    expect(total[5]).toBe(5)    // собрано
    expect(total[6]).toBe(10)   // упаковано
    expect(total[7]).toBe(200)  // заработок 150 + 50
  })

  it('фильтр по периоду [from, to] отбрасывает дни вне диапазона', () => {
    const aoa = buildEmployeeReportAoa(worker, { from: new Date('2026-07-07T00:00:00'), to: new Date('2026-07-07T23:59:59') })
    expect(aoa.length).toBe(3) // header + 1 день + Общее
    expect(aoa[1][0]).toBe('7.07')
    expect(aoa.at(-1)[3]).toBe(50) // только вторник
  })

  it('пустые дни → только заголовок и нулевое «Общее»', () => {
    const aoa = buildEmployeeReportAoa({ name: 'X', days: {} })
    expect(aoa.length).toBe(2)
    expect(aoa[1]).toEqual(['Общее', '', 0, 0, 0, 0, 0, 0])
  })
})
