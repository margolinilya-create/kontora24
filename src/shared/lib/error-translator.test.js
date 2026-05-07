import { describe, it, expect } from 'vitest'
import { translateError } from './error-translator'

describe('translateError', () => {
  describe('case 0 — cyrillic passthrough (own throws)', () => {
    it('returns message as-is for Error with cyrillic message', () => {
      const r = translateError(new Error('Заказ уже взят другим сотрудником'))
      expect(r).toEqual({ title: 'Ошибка', message: 'Заказ уже взят другим сотрудником' })
    })

    it('passes through cyrillic plain object', () => {
      const r = translateError({ message: 'Нет доступа к Kontora24' })
      expect(r.message).toBe('Нет доступа к Kontora24')
      expect(r.title).toBe('Ошибка')
    })

    it('passthrough wins over code (cyrillic message + 23505)', () => {
      const r = translateError({ code: '23505', message: 'Ё-тест' })
      expect(r.title).toBe('Ошибка')
      expect(r.message).toBe('Ё-тест')
    })

    it('does not match latin uppercase as cyrillic (regex specificity)', () => {
      // Гарантирует что /^[А-ЯЁ]/ проверяет ИМЕННО кириллицу, а не любую заглавную.
      // Этот тест упадёт если кто-то изменит регэксп на /^[A-ZА-ЯЁ]/ или /^[\p{Lu}]/.
      const r = translateError({ message: 'Some english error' })
      // Title — generic «Что-то пошло не так», а не кириллический passthrough «Ошибка»
      expect(r.title).toBe('Что-то пошло не так')
      // Message — оригинал (теперь fallback показывает его, чтобы не терять информацию)
      expect(r.message).toBe('Some english error')
    })

    it('fallback path is reachable for unknown error codes', () => {
      // Защита: fallback всегда возвращает {title:'Что-то пошло не так'},
      // даже если в FALLBACK.message появится кириллица.
      const r = translateError({ code: 'UNKNOWN_CODE_XYZ_999' })
      expect(r.title).toBe('Что-то пошло не так')
      expect(r.message).toBe('Попробуйте ещё раз.')
      expect(r.action).toBeUndefined()
    })
  })

  describe('case 1 — unique violation (23505)', () => {
    it('maps 23505 to friendly text', () => {
      const r = translateError({ code: '23505', message: 'duplicate key value violates unique constraint' })
      expect(r).toEqual({
        title: 'Уже существует',
        message: 'Запись с такими данными уже есть. Проверьте поля или откройте существующую.',
      })
    })
  })

  describe('case 2 — foreign key violation (23503)', () => {
    it('maps 23503 to friendly text', () => {
      const r = translateError({ code: '23503', message: 'fk violation' })
      expect(r.title).toBe('Не удалось сохранить')
      expect(r.message).toBe('Связанные данные изменились. Обновите страницу и попробуйте снова.')
    })
  })

  describe('case 3 — not null violation (23502)', () => {
    it('maps 23502 to friendly text', () => {
      const r = translateError({ code: '23502', message: 'null value in column' })
      expect(r.title).toBe('Заполните обязательное поле')
    })
  })

  describe('case 4 — RLS / permission denied', () => {
    it('maps 42501 to "Нет прав"', () => {
      const r = translateError({ code: '42501', message: 'permission denied' })
      expect(r).toEqual({ title: 'Нет прав', message: 'У вас нет прав на это действие.' })
    })

    it('maps PGRST301 to "Нет прав"', () => {
      const r = translateError({ code: 'PGRST301', message: 'jwt' })
      expect(r.title).toBe('Нет прав')
    })

    it('matches "row-level security" in message regardless of code', () => {
      const r = translateError({ message: 'new row violates row-level security policy for table' })
      expect(r.title).toBe('Нет прав')
    })
  })

  describe('case 5 — auth expired', () => {
    it('maps status 401 to "Сессия устарела"', () => {
      const r = translateError({ status: 401, message: 'unauthorized' })
      expect(r).toEqual({ title: 'Сессия устарела', message: 'Обновите страницу.', action: 'reauth' })
    })

    it('matches "JWT expired" message', () => {
      const r = translateError({ message: 'JWT expired' })
      expect(r.title).toBe('Сессия устарела')
      expect(r.action).toBe('reauth')
    })

    it('matches "jwt invalid" message', () => {
      const r = translateError({ message: 'jwt invalid signature' })
      expect(r.action).toBe('reauth')
    })

    it('matches "Not authenticated" exact', () => {
      const r = translateError({ message: 'Not authenticated' })
      expect(r.action).toBe('reauth')
    })
  })

  describe('case 6 — network failure', () => {
    it('maps TypeError "Failed to fetch"', () => {
      const err = new TypeError('Failed to fetch')
      const r = translateError(err)
      expect(r).toEqual({
        title: 'Не удалось отправить',
        message: 'Проверьте интернет и попробуйте ещё раз.',
        action: 'retry',
      })
    })

    it('maps TypeError with NetworkError', () => {
      const err = new TypeError('NetworkError when attempting to fetch resource')
      const r = translateError(err)
      expect(r.title).toBe('Не удалось отправить')
    })

    it('does NOT match plain TypeError without network text', () => {
      const err = new TypeError('Cannot read property foo of undefined')
      const r = translateError(err)
      expect(r.title).toBe('Что-то пошло не так')
    })
  })

  describe('case 7 — abort', () => {
    it('maps AbortError', () => {
      const err = new Error('aborted')
      err.name = 'AbortError'
      const r = translateError(err)
      expect(r).toEqual({ title: 'Запрос отменён', message: 'Попробуйте ещё раз.', action: 'retry' })
    })
  })

  describe('case 8 — no rows (PGRST116)', () => {
    it('maps PGRST116 to "Ничего не найдено"', () => {
      const r = translateError({ code: 'PGRST116', message: 'no rows' })
      expect(r).toEqual({ title: 'Ничего не найдено', message: 'Запись не существует или была удалена.' })
    })
  })

  describe('case 9 — payload too large', () => {
    it('maps status 413', () => {
      const r = translateError({ status: 413, message: 'too large' })
      expect(r.title).toBe('Файл слишком большой')
    })

    it('matches "payload too large" in message', () => {
      const r = translateError({ message: 'Payload too large' })
      expect(r.title).toBe('Файл слишком большой')
    })

    it('matches "file size" in message', () => {
      const r = translateError({ message: 'file size exceeds limit' })
      expect(r.title).toBe('Файл слишком большой')
    })
  })

  describe('case 10 — fallback', () => {
    it('handles null', () => {
      const r = translateError(null)
      expect(r).toEqual({ title: 'Что-то пошло не так', message: 'Попробуйте ещё раз.' })
    })

    it('handles undefined', () => {
      const r = translateError(undefined)
      expect(r.title).toBe('Что-то пошло не так')
    })

    it('handles plain string', () => {
      const r = translateError('something broke')
      expect(r.title).toBe('Что-то пошло не так')
    })

    it('handles empty object', () => {
      const r = translateError({})
      expect(r.title).toBe('Что-то пошло не так')
    })

    it('handles unknown postgres code', () => {
      const r = translateError({ code: '99999', message: 'whatever' })
      expect(r.title).toBe('Что-то пошло не так')
    })

    it('always returns title and message as strings', () => {
      const r = translateError({})
      expect(typeof r.title).toBe('string')
      expect(typeof r.message).toBe('string')
      expect(r.title.length).toBeGreaterThan(0)
      expect(r.message.length).toBeGreaterThan(0)
    })
  })
})
