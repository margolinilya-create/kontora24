import { describe, it, expect } from 'vitest'
import {
  isWeekend, isWorkingDay, addDays, addWorkingDays, getWorkingDays,
  previousWorkingDay, toISODate, fromISODate, startOfUTCDay,
} from './working-days'

const D = (iso) => new Date(`${iso}T00:00:00.000Z`)

describe('working-days', () => {
  it('isWeekend: суббота и воскресенье', () => {
    expect(isWeekend(D('2026-06-06'))).toBe(true)  // суббота
    expect(isWeekend(D('2026-06-07'))).toBe(true)  // воскресенье
    expect(isWeekend(D('2026-06-08'))).toBe(false) // понедельник
  })

  it('isWorkingDay: учитывает праздники', () => {
    const holidays = ['2026-05-01', '2026-05-11']
    expect(isWorkingDay(D('2026-05-01'), holidays)).toBe(false) // праздник (пт)
    expect(isWorkingDay(D('2026-05-04'), holidays)).toBe(true)  // пн рабочий
    expect(isWorkingDay(D('2026-05-11'), holidays)).toBe(false) // праздник (пн)
  })

  it('addDays прибавляет N календарных дней', () => {
    expect(toISODate(addDays(D('2026-06-03'), 1))).toBe('2026-06-04')
    expect(toISODate(addDays(D('2026-06-03'), 7))).toBe('2026-06-10')
    expect(toISODate(addDays(D('2026-06-03'), -1))).toBe('2026-06-02')
  })

  it('addWorkingDays(date, 0) возвращает ближайший рабочий день включительно', () => {
    // суббота 2026-06-06 → пн 2026-06-08
    expect(toISODate(addWorkingDays(D('2026-06-06'), 0))).toBe('2026-06-08')
    // рабочий день остаётся
    expect(toISODate(addWorkingDays(D('2026-06-08'), 0))).toBe('2026-06-08')
  })

  it('addWorkingDays(date, N) перепрыгивает выходные и праздники', () => {
    // пт 2026-06-05 + 1 рабочий день → пн 2026-06-08
    expect(toISODate(addWorkingDays(D('2026-06-05'), 1))).toBe('2026-06-08')
    // ср 2026-06-10 + 3 раб. дня → пн 2026-06-15
    expect(toISODate(addWorkingDays(D('2026-06-10'), 3))).toBe('2026-06-15')
    // праздник 2026-06-12 (Пятница) должен пропускаться
    expect(toISODate(addWorkingDays(D('2026-06-10'), 3, ['2026-06-12']))).toBe('2026-06-16')
  })

  it('getWorkingDays выдаёт N рабочих дней начиная с ближайшего', () => {
    const holidays = ['2026-06-12']
    const list = getWorkingDays(D('2026-06-08'), 5, holidays).map(toISODate)
    expect(list).toEqual(['2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-15'])
  })

  it('getWorkingDays стартует с понедельника, если дано воскресенье', () => {
    const list = getWorkingDays(D('2026-06-07'), 3).map(toISODate)
    expect(list).toEqual(['2026-06-08', '2026-06-09', '2026-06-10'])
  })

  it('previousWorkingDay сдвигает дедлайн на пятницу/предыдущий рабочий', () => {
    // суббота 2026-06-06 → пятница 2026-06-05
    expect(toISODate(previousWorkingDay(D('2026-06-06')))).toBe('2026-06-05')
    // воскресенье 2026-06-07 → пятница 2026-06-05
    expect(toISODate(previousWorkingDay(D('2026-06-07')))).toBe('2026-06-05')
    // праздник 2026-06-12 (пт) → 2026-06-11 (чт)
    expect(toISODate(previousWorkingDay(D('2026-06-12'), ['2026-06-12']))).toBe('2026-06-11')
  })

  it('toISODate / fromISODate — roundtrip', () => {
    const d = D('2026-06-03')
    expect(toISODate(d)).toBe('2026-06-03')
    expect(toISODate(fromISODate('2026-06-03'))).toBe('2026-06-03')
    expect(fromISODate('')).toBeNull()
    expect(fromISODate(null)).toBeNull()
  })

  it('startOfUTCDay обнуляет время', () => {
    const d = new Date('2026-06-03T15:42:00.000Z')
    expect(toISODate(startOfUTCDay(d))).toBe('2026-06-03')
  })
})
