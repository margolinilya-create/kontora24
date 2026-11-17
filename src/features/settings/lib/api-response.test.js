import { describe, it, expect } from 'vitest'
import { readApiResponse, apiErrorMessage } from './api-response'

const mkRes = (body, status = 200) => ({ status, text: async () => body })

describe('readApiResponse', () => {
  it('parses JSON', async () => {
    expect(await readApiResponse(mkRes('{"error":"Ошибка"}'))).toEqual({ error: 'Ошибка' })
  })
  it('returns {} for HTML / empty body', async () => {
    expect(await readApiResponse(mkRes('<html>502</html>', 502))).toEqual({})
    expect(await readApiResponse(mkRes(''))).toEqual({})
  })
})

describe('apiErrorMessage', () => {
  it('passes russian server message', () => {
    expect(apiErrorMessage({ status: 400 }, { error: 'Имя не может быть пустым' }, 'x')).toBe('Имя не может быть пустым')
  })
  it('hides english/technical message and maps status', () => {
    expect(apiErrorMessage({ status: 502 }, { error: 'Bad gateway' }, 'x')).toMatch(/Сервер/)
    expect(apiErrorMessage({ status: 403 }, {}, 'x')).toMatch(/прав/)
    expect(apiErrorMessage({ status: 400 }, {}, 'Не удалось')).toBe('Не удалось')
  })
})
