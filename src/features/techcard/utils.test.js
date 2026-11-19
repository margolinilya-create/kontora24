import { describe, it, expect } from 'vitest'
import {
  fitNumberFontSize,
  SAMPLE_NUMBER_FONT_PX,
  SAMPLE_NUMBER_TEXT_MAX_PX,
  SAMPLE_NUMBER_CAPSULE_MAX_PX,
} from './utils'

// Фейковый измеритель: ширина ≈ 0.6 em на знак (≈ жирный Arial для цифр).
const measure = (text, size) => text.length * size * 0.6

describe('fitNumberFontSize (R27.0, номер на образце)', () => {
  it('капсула номера не шире 760px', () => {
    expect(SAMPLE_NUMBER_CAPSULE_MAX_PX).toBe(760)
    expect(SAMPLE_NUMBER_TEXT_MAX_PX).toBe(680)
  })

  it.each(['#7', '#302', '#12345'])('короткий номер %s — базовый кегль 52px', (text) => {
    expect(fitNumberFontSize(text, measure)).toBe(SAMPLE_NUMBER_FONT_PX)
  })

  it('8 знаков влезают в капсулу 760px без уменьшения', () => {
    const size = fitNumberFontSize('#12345678', measure)
    expect(size).toBe(52)
    expect(measure('#12345678', size)).toBeLessThanOrEqual(SAMPLE_NUMBER_TEXT_MAX_PX)
  })

  it('8 знаков в узкой капсуле — кегль уменьшается и текст влезает', () => {
    const size = fitNumberFontSize('#12345678', measure, 200)
    expect(size).toBeLessThan(52)
    expect(measure('#12345678', size)).toBeLessThanOrEqual(200)
  })

  it('очень длинный custom_number уменьшается до ширины капсулы', () => {
    const text = '#2026-ПИНХЕД-СТУДИЯ-0001'
    const size = fitNumberFontSize(text, measure)
    expect(size).toBeLessThan(52)
    expect(measure(text, size)).toBeLessThanOrEqual(SAMPLE_NUMBER_TEXT_MAX_PX)
  })

  it('учитывает нелинейность измерителя (пошаговое уменьшение)', () => {
    const bumpy = (text, size) => text.length * size * 0.6 + 3
    const size = fitNumberFontSize('#12345678', bumpy, 200)
    expect(bumpy('#12345678', size)).toBeLessThanOrEqual(200)
  })

  it('не опускается ниже минимума', () => {
    expect(fitNumberFontSize('#'.repeat(500), measure)).toBe(20)
  })

  it('без текста/измерителя — базовый кегль', () => {
    expect(fitNumberFontSize('', measure)).toBe(52)
    expect(fitNumberFontSize('#7', null)).toBe(52)
  })
})
