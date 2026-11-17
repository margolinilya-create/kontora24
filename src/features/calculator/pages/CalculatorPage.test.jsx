import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DEFAULT_CALC_SETTINGS } from '../lib/calc'

let canFinance = true
let canCreate = true
vi.mock('@/features/auth/hooks/useAuth', () => ({ useAuth: () => ({ profile: { id: 'u1', role: 'manager' } }) }))
vi.mock('@/features/auth/hooks/useCanDo', () => ({ useCanDo: (p) => (p === 'view:finance' ? canFinance : p === 'order:create' ? canCreate : true) }))
// Попап с формой заказа проверяется отдельно (CreateOrderModal.test.jsx).
vi.mock('../components/CreateOrderModal', () => ({
  CreateOrderModal: ({ result, film, lam }) => (
    <div role="dialog" data-testid="create-order-modal">
      {result.orderType}|{result.qty}|{result.totalRounded}|{film?.id}|{lam?.id || 'none'}
    </div>
  ),
}))
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

function render(ui, { state } = {}) {
  return rtlRender(<MemoryRouter initialEntries={[{ pathname: '/calculator', state }]}>{ui}</MemoryRouter>)
}

describe('CalculatorPage', () => {
  beforeEach(() => { canFinance = true; canCreate = true; localStorage.clear() })

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

  it('«Создать заказ» открывает попап с текущим расчётом (право order:create)', () => {
    render(<CalculatorPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Создать заказ' }))
    expect(screen.getByTestId('create-order-modal').textContent).toBe('sticker_kiss|500|10651|f1|none')
  })

  it('без order:create кнопки «Создать заказ» нет', () => {
    canCreate = false
    render(<CalculatorPage />)
    expect(screen.queryByRole('button', { name: 'Создать заказ' })).toBeNull()
  })

  it('«Открыть в калькуляторе»: расчёт восстанавливается из state роутера', () => {
    const calcRestore = {
      product: 'sticker', width: '100', height: '100', filmId: 'f1', lamId: null,
      views: [100, 200, 200], options: { designEdit: true, montage: true },
    }
    render(<CalculatorPage />, { state: { calcRestore } })
    expect(screen.getByLabelText('Вид 3, шт').value).toBe('200')
    expect(screen.getByLabelText('Тираж, шт').value).toBe('500')
    // Контрольный расчёт А.4 №5 (3 вида + правка + монтаж) — 17 151 ₽.
    expect(screen.getAllByText('17 151 ₽').length).toBeGreaterThan(0)
  })
})
