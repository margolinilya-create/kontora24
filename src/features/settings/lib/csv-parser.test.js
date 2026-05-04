import { describe, it, expect } from 'vitest'
import { parseCSV } from './csv-parser'

describe('parseCSV', () => {
  describe('basic parsing', () => {
    it('parses simple CSV with Russian headers', () => {
      const csv = `Тип;Ширина;Высота;Тираж;Клиент
стикер;50;70;100;ООО Тест`
      const { rows, errors } = parseCSV(csv)
      expect(errors).toHaveLength(0)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        order_type: 'sticker_cut',
        width_mm: 50,
        height_mm: 70,
        qty: 100,
        clientName: 'ООО Тест',
      })
    })

    it('parses tab-separated values', () => {
      const csv = "Тип\tТираж\nстикерпак\t200"
      const { rows } = parseCSV(csv)
      expect(rows[0].order_type).toBe('stickerpack')
      expect(rows[0].qty).toBe(200)
    })

    it('parses comma-separated values', () => {
      const csv = "Тип,Тираж\nвырубной,50"
      const { rows } = parseCSV(csv)
      expect(rows[0].order_type).toBe('sticker_cut')
    })

    it('returns error if less than 2 lines', () => {
      const { errors } = parseCSV('Тип;Тираж')
      expect(errors[0]).toContain('Нужен заголовок')
    })

    it('skips empty lines', () => {
      const csv = "Тип;Тираж\nстикер;100\n\nстикер;200"
      const { rows } = parseCSV(csv)
      expect(rows).toHaveLength(2)
    })
  })

  describe('header mapping', () => {
    it('handles English headers', () => {
      const csv = "type;width;height;qty\nsticker_cut;60;80;150"
      const { rows } = parseCSV(csv)
      expect(rows[0].width_mm).toBe(60)
      expect(rows[0].height_mm).toBe(80)
    })

    it('handles alternative Russian headers (количество, №, пленка)', () => {
      const csv = "№;Количество;Пленка\n123;500;Holo"
      const { rows } = parseCSV(csv)
      expect(rows[0].externalNumber).toBe('123')
      expect(rows[0].qty).toBe(500)
      expect(rows[0].film_type).toBe('Holo')
    })

    it('ignores unmapped columns', () => {
      const csv = "Тип;Фигня;Тираж\nстикер;xxx;100"
      const { rows } = parseCSV(csv)
      expect(rows[0].order_type).toBe('sticker_cut')
      expect(rows[0].qty).toBe(100)
    })

    it('strips quotes from headers and values', () => {
      const csv = '"Тип";"Тираж"\n"стикер";"100"'
      const { rows } = parseCSV(csv)
      expect(rows[0].order_type).toBe('sticker_cut')
      expect(rows[0].qty).toBe(100)
    })
  })

  describe('type normalization', () => {
    const cases = [
      ['стикер', 'sticker_cut'],
      ['вырубной', 'sticker_cut'],
      ['die cut', 'sticker_cut'],
      ['kiss cut', 'sticker_kiss'],
      ['подложка', 'sticker_kiss'],
      ['стикерпак', 'stickerpack'],
      ['пак', 'stickerpack'],
      ['3d', 'sticker3D'],
      ['3д', 'sticker3D'],
      ['3d пак', 'stickerpack3D'],
      ['прямоугольный', 'rect'],
      ['большой', 'big'],
    ]

    it.each(cases)('maps "%s" to "%s"', (input, expected) => {
      const csv = `Тип;Тираж\n${input};100`
      const { rows } = parseCSV(csv)
      expect(rows[0].order_type).toBe(expected)
    })

    it('defaults to sticker_cut when type is missing', () => {
      const csv = "Тираж\n100"
      const { rows } = parseCSV(csv)
      expect(rows[0].order_type).toBe('sticker_cut')
    })

    it('keeps unknown type as-is', () => {
      const csv = "Тип;Тираж\nunknown_type;100"
      const { rows } = parseCSV(csv)
      expect(rows[0].order_type).toBe('unknown_type')
    })
  })

  describe('number normalization', () => {
    it('defaults width/height to 50 if not a number', () => {
      const csv = "Ширина;Высота;Тираж\nabc;xyz;100"
      const { rows } = parseCSV(csv)
      expect(rows[0].width_mm).toBe(50)
      expect(rows[0].height_mm).toBe(50)
    })

    it('defaults qty to 100 if not a number', () => {
      const csv = "Тираж\nabc"
      const { rows } = parseCSV(csv)
      expect(rows[0].qty).toBe(100)
    })

    it('defaults design_variants to 1', () => {
      const csv = "Тираж\n100"
      const { rows } = parseCSV(csv)
      expect(rows[0].design_variants).toBe(1)
    })

    it('parses price_final as number', () => {
      const csv = "Цена;Тираж\n5000;100"
      const { rows } = parseCSV(csv)
      expect(rows[0].price_final).toBe(5000)
    })

    it('leaves price_final undefined when empty', () => {
      const csv = "Цена;Тираж\n;100"
      const { rows } = parseCSV(csv)
      expect(rows[0].price_final).toBeUndefined()
    })
  })

  describe('boolean normalization', () => {
    it.each(['да', 'yes', '1', 'true', '3d', '3д'])('is_3d=true for "%s"', (val) => {
      const csv = `3д;Тираж\n${val};100`
      const { rows } = parseCSV(csv)
      expect(rows[0].is_3d).toBe(true)
    })

    it('is_3d=false for other values', () => {
      const csv = "3д;Тираж\nнет;100"
      const { rows } = parseCSV(csv)
      expect(rows[0].is_3d).toBe(false)
    })

    it.each(['да', 'yes', '1', 'true'])('need_lam=true for "%s"', (val) => {
      const csv = `Ламинация;Тираж\n${val};100`
      const { rows } = parseCSV(csv)
      expect(rows[0].need_lam).toBe(true)
    })
  })

  describe('validation', () => {
    it('qty=0 becomes default 100 (Number(0) || 100 behavior)', () => {
      // Note: parseCSV uses `Number(val) || 100` so 0 becomes 100
      const csv = "Тираж\n0"
      const { rows } = parseCSV(csv)
      expect(rows[0].qty).toBe(100)
    })

    it('rejects rows with negative qty', () => {
      const csv = "Тираж\n-5"
      const { rows, errors } = parseCSV(csv)
      expect(rows).toHaveLength(0)
      expect(errors[0]).toContain('тираж <= 0')
    })

    it('rejects rows with negative dimensions', () => {
      const csv = "Ширина;Высота;Тираж\n-10;50;100"
      const { rows, errors } = parseCSV(csv)
      expect(rows).toHaveLength(0)
      expect(errors[0]).toContain('размер <= 0')
    })

    it('processes valid rows and reports errors for invalid ones', () => {
      const csv = "Тираж;Ширина\n100;50\n200;-10\n300;50"
      const { rows, errors } = parseCSV(csv)
      expect(rows).toHaveLength(2)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toContain('размер <= 0')
    })
  })

  describe('headers output', () => {
    it('returns mapped headers list', () => {
      const csv = "Тип;Тираж;Фигня\nстикер;100;xxx"
      const { headers } = parseCSV(csv)
      expect(headers).toEqual(['order_type', 'qty'])
    })
  })
})
