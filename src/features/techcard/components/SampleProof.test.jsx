import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SampleProof } from './SampleProof'

// R23.2 (ТЗ 23.07 Фаза 3) — образец-цветопроба A4: проверяем текстовое
// наполнение (номер, дата из created_at, 7 полей инфо-таблицы, легенда).

const ORDER = {
  number: 1042,
  custom_number: null,
  order_type: 'stickerpack3D',
  created_at: '2026-07-15T09:30:00Z',
  film_type: 'G',
  film_material: { name: 'Duckson G глянцевая' },
  width_mm: 74,
  height_mm: 105,
  qty: 500,
  client: { name: 'ООО Ромашка' },
  assignee: { display_name: 'Иван Петров' },
  attachments: [],
}

describe('SampleProof', () => {
  it('показывает номер заказа с решёткой', () => {
    render(<SampleProof order={ORDER} />)
    expect(screen.getByText('#1042')).toBeInTheDocument()
  })

  it('дата берётся из created_at, а не из сегодня', () => {
    render(<SampleProof order={ORDER} />)
    // Капсула даты — формат ДД/ММ/ГГ
    expect(screen.getByText('15/07/26')).toBeInTheDocument()
    // Инфо-таблица — локализованная дата создания
    expect(screen.getByText('15.07.2026')).toBeInTheDocument()
  })

  it('рендерит все 7 полей инфо-таблицы', () => {
    render(<SampleProof order={ORDER} />)
    expect(screen.getByText('3D стикерпак')).toBeInTheDocument()
    expect(screen.getByText('Duckson G глянцевая')).toBeInTheDocument()
    expect(screen.getByText('74×105 мм')).toBeInTheDocument()
    expect(screen.getByText('500 шт')).toBeInTheDocument()
    expect(screen.getByText('ООО Ромашка')).toBeInTheDocument()
    expect(screen.getByText('Иван Петров')).toBeInTheDocument()
  })

  it('показывает легенду надсечка/сквозной рез', () => {
    render(<SampleProof order={ORDER} />)
    expect(screen.getByText('НАДСЕЧКА')).toBeInTheDocument()
    expect(screen.getByText('СКВОЗНОЙ РЕЗ')).toBeInTheDocument()
  })

  it('плейсхолдер если нет превью изделия', () => {
    render(<SampleProof order={ORDER} />)
    expect(screen.getByText('Нет изображения изделия')).toBeInTheDocument()
  })

  it('материал берётся из film_type если нет film_material', () => {
    render(<SampleProof order={{ ...ORDER, film_material: null }} />)
    // FILM_TYPES['G'].label
    expect(screen.getByText(/Глянцевая|G/)).toBeInTheDocument()
  })
})
