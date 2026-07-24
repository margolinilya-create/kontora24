import { describe, it, expect } from 'vitest'
import { deriveTypeFromCategory, defaultUnitForType, CATEGORY_NAME_TO_TYPE } from './category-type'

// R23.1 (ТЗ 23.07 Фаза 7) — маппинг категория→type.

describe('deriveTypeFromCategory', () => {
  it('плёнка для печати → film', () => {
    expect(deriveTypeFromCategory('Плёнка для печати')).toBe('film')
  })
  it('плёнка для ламинации → lam_film', () => {
    expect(deriveTypeFromCategory('Плёнка для ламинации')).toBe('lam_film')
  })
  it('обе БОПП-категории → packaging_bag', () => {
    expect(deriveTypeFromCategory('БОПП пакеты ширина >100 мм')).toBe('packaging_bag')
    expect(deriveTypeFromCategory('БОПП пакеты ширина ≤100 мм')).toBe('packaging_bag')
  })
  it('химические вещества → resin', () => {
    expect(deriveTypeFromCategory('Химические вещества')).toBe('resin')
  })
  it('ножи → blade, коробки → box', () => {
    expect(deriveTypeFromCategory('Ножи для плоттера')).toBe('blade')
    expect(deriveTypeFromCategory('Упаковка (коробки)')).toBe('box')
  })
  it('кастомная/неизвестная категория → utensils', () => {
    expect(deriveTypeFromCategory('Моя категория')).toBe('utensils')
    expect(deriveTypeFromCategory(undefined)).toBe('utensils')
  })
  it('покрывает все 9 стандартных категорий', () => {
    expect(Object.keys(CATEGORY_NAME_TO_TYPE)).toHaveLength(9)
  })
})

describe('defaultUnitForType', () => {
  it('плёнка/ламинация → м, смола → g, прочее → шт', () => {
    expect(defaultUnitForType('film')).toBe('м')
    expect(defaultUnitForType('lam_film')).toBe('м')
    expect(defaultUnitForType('resin')).toBe('g')
    expect(defaultUnitForType('ink')).toBe('ml')
    expect(defaultUnitForType('box')).toBe('шт')
    expect(defaultUnitForType('utensils')).toBe('шт')
  })
})
