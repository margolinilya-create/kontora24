import { describe, it, expect } from 'vitest'
import { composeMaterialName, isStructuredFilmType } from './material-name'

describe('composeMaterialName', () => {
  it('собирает полное имя из всех полей', () => {
    expect(composeMaterialName({
      manufacturer: 'Orajet', product_line: '3640', color: 'Белая', finish: 'G', roll_width_m: 1.26,
    })).toBe('Orajet 3640 Белая Глянцевая 1.26 м')
  })

  it('пропускает пустые поля', () => {
    expect(composeMaterialName({ product_line: 'Голографическая', roll_width_m: 1.22 }))
      .toBe('Голографическая 1.22 м')
  })

  it('финиш M → Матовая', () => {
    expect(composeMaterialName({ manufacturer: 'Duckson', finish: 'M', color: 'Прозрачная' }))
      .toBe('Duckson Прозрачная Матовая')
  })

  it('нулевая/пустая ширина не добавляет « м»', () => {
    expect(composeMaterialName({ product_line: 'Сахарная', roll_width_m: '' })).toBe('Сахарная')
    expect(composeMaterialName({ product_line: 'Сахарная', roll_width_m: 0 })).toBe('Сахарная')
  })

  it('пустой объект → пустая строка', () => {
    expect(composeMaterialName({})).toBe('')
    expect(composeMaterialName()).toBe('')
  })

  it('тримит значения', () => {
    expect(composeMaterialName({ manufacturer: '  Oracal ', product_line: ' 352 ' })).toBe('Oracal 352')
  })
})

describe('isStructuredFilmType', () => {
  it('film и lam_film — структурные', () => {
    expect(isStructuredFilmType('film')).toBe(true)
    expect(isStructuredFilmType('lam_film')).toBe(true)
  })
  it('прочие типы — нет', () => {
    expect(isStructuredFilmType('resin')).toBe(false)
    expect(isStructuredFilmType('box')).toBe(false)
    expect(isStructuredFilmType(undefined)).toBe(false)
  })
})
