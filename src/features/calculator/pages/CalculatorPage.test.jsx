import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DEFAULT_CALC_SETTINGS } from '../lib/calc'

let canFinance = true
vi.mock('@/features/auth/hooks/useAuth', () => ({ useAuth: () => ({ profile: { id: 'u1', role: 'manager' } }) }))
vi.mock('@/features/auth/hooks/useCanDo', () => ({ useCanDo: (p) => (p === 'view:finance' ? canFinance : true) }))
vi.mock('../hooks/useCalculatorSettings', () => ({
  useCalculatorSettings: () => ({
    settings: DEFAULT_CALC_SETTINGS,
    films: [
      { id: 'f1', type: 'film', name: 'Orajet 3640 G 1.26', calc_price_group: 'white', calc_display_name: 'Белая глянцевая плёнка' },
      { id: 'f2', type: 'film', name: 'Holo 1.0', calc_price_group: 'holo', calc_display_name: null },
      { id: 'f3', type: 'film', name: 'Без группы', calc_price_group: null },
    ],
    laminations: [{ id: 'l1', type: 'lam_film', name: 'Lam M', material_code: 'matte' }],
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}))

const { default: CalculatorPage } = await import('./CalculatorPage')

describe('CalculatorPage', () => {
  beforeEach(() => { canFinance = true; localStorage.clear() })

  it('по умолчанию считает контрольный расчёт 1 (100×100, 500 шт)', () => {
    render(<CalculatorPage />)
    expect(screen.getAllByText('10 651 ₽').length).toBeGreaterThan(0)
    expect(screen.getAllByText('21,3 ₽').length).toBeGreaterThan(0)
    // плёнка без группы не показывается
    expect(screen.queryByRole('option', { name: 'Без группы' })).toBeNull()
  })

  it('без view:finance себестоимости и наценки нет', () => {
    canFinance = false
    render(<CalculatorPage />)
    expect(screen.queryByText(/Себест/)).toBeNull()
    expect(screen.queryByText('Наценка')).toBeNull()
  })

  it('с view:finance себестоимость видна и скрывается глазом', () => {
    render(<CalculatorPage />)
    expect(screen.getByText('Себест. 1 шт')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Скрыть себестоимость' }))
    expect(screen.queryByText('Себест. 1 шт')).toBeNull()
  })

  it('тираж «15» на выходе из поля становится 20; «150» набирается', () => {
    render(<CalculatorPage />)
    const qty = screen.getByLabelText('Тираж, шт')
    fireEvent.change(qty, { target: { value: '150' } })
    expect(qty.value).toBe('150')
    fireEvent.change(qty, { target: { value: '15' } })
    fireEvent.blur(qty)
    expect(qty.value).toBe('20')
  })

  it('+ вид делит тираж и добавляет 1 000 ₽', () => {
    render(<CalculatorPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Больше видов' }))
    expect(screen.getByLabelText('Вид 1, шт').value).toBe('250')
    expect(screen.getAllByText('11 651 ₽').length).toBeGreaterThan(0)
  })
})
