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
let extra = {}
vi.mock('../hooks/useCalculatorSettings', () => ({
  useCalculatorSettings: () => ({
    settings: DEFAULT_CALC_SETTINGS,
    materials: [],
    prices: new Map(),
    nfcRow: null,
    films: [
      { id: 'f1', type: 'film', name: 'Orajet 3640 G 1.26', calc_price_group: 'white', calc_display_name: 'Белая глянцевая плёнка' },
      { id: 'f2', type: 'film', name: 'Holo 1.0', calc_price_group: 'holo', calc_display_name: null },
      { id: 'f3', type: 'film', name: 'Без группы', calc_price_group: null },
    ],
    laminations: [{ id: 'l1', type: 'lam_film', name: 'Lam M', material_code: 'matte' }],
    loading: false,
    error: null,
    refetch: vi.fn(),
    ...extra,
  }),
}))

const { default: CalculatorPage } = await import('./CalculatorPage')

function render(ui, { state } = {}) {
  return rtlRender(<MemoryRouter initialEntries={[{ pathname: '/calculator', state }]}>{ui}</MemoryRouter>)
}

describe('CalculatorPage', () => {
  beforeEach(() => { canFinance = true; canCreate = true; extra = {}; localStorage.clear() })

  it('по умолчанию считает контрольный расчёт 1 (100×100, 500 шт)', () => {
    render(<CalculatorPage />)
    expect(screen.getAllByText('10 651 ₽').length).toBeGreaterThan(0)
    expect(screen.getAllByText('21,3 ₽').length).toBeGreaterThan(0)
    // R27.2: позиция без группы и без цены склада — неактивна, с подсказкой
    expect(screen.getByRole('option', { name: 'Без группы — единица не м/м²' })).toBeDisabled()
    expect(screen.getByLabelText('Материал').tagName).toBe('SELECT')
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

  describe('R27: материал по цене склада, NFC, ручные операции', () => {
    const PAPER = { id: 'p1', type: 'paper', name: 'Бумага Ситилайт', unit: 'm', roll_width_m: 1.27, calc_price_group: null, group: 'Бумага в рулонах', groupRank: 1 }
    const NFC = { id: 'nfc', name: 'NFC-метки (NTAG216)', stock_qty: 303, category_id: 'kit' }
    const prices = new Map([['p1', { id: 'p1', unit: 'm', roll_width_m: 1.27, price_cm2_raw: 185.35 / 12700 }]])

    function withWarehouse(more = {}) {
      extra = {
        films: [PAPER, { id: 'f1', type: 'film', name: 'Orajet', calc_price_group: 'white' }],
        prices,
        materials: [NFC],
        ...more,
      }
    }

    it('бумага по цене склада: 50×50, 300 шт, резка → 1 866 ₽; серая ₽/см² с view:finance', () => {
      withWarehouse()
      render(<CalculatorPage />, {
        state: { calcRestore: { product: 'sticker', width: '50', height: '50', filmId: 'p1', views: [300], options: { cut: true } } },
      })
      expect(screen.getAllByText('1 866 ₽').length).toBeGreaterThan(0)
      expect(screen.getByText(/0,0219 ₽\/см² · по цене склада/)).toBeInTheDocument()
      expect(screen.getByText('Разбивка себестоимости 1 см²')).toBeInTheDocument()
    })

    it('без view:finance ₽/см² и разбивки нет', () => {
      canFinance = false
      withWarehouse()
      render(<CalculatorPage />)
      expect(screen.queryByText(/₽\/см²/)).toBeNull()
      expect(screen.queryByText('Разбивка себестоимости 1 см²')).toBeNull()
    })

    it('NFC без позиции в настройках — переключатель неактивен с подсказкой', () => {
      render(<CalculatorPage />)
      expect(screen.getByLabelText(/NFC-метка/)).toBeDisabled()
      expect(screen.getByText('Позиция NFC-метки не задана в настройках')).toBeInTheDocument()
    })

    it('NFC с ценой: надбавка в итоге, строка NFC в разбивке, «На складе N шт» при нехватке', () => {
      withWarehouse({
        settings: { ...DEFAULT_CALC_SETTINGS, nfc_material_id: 'nfc' },
        nfcRow: { id: 'nfc', is_nfc: true, nfc_unit_price: 6.82, archived: false },
      })
      render(<CalculatorPage />)
      const toggle = screen.getByLabelText(/NFC-метка/)
      expect(toggle).not.toBeDisabled()
      fireEvent.click(toggle)
      expect(screen.getByText('NFC-метка, ₽/шт')).toBeInTheDocument()
      expect(screen.getByText('На складе 303 шт — меньше тиража')).toBeInTheDocument()
      expect(screen.getByText('Дополнительно:')).toBeInTheDocument()
    })

    it('ручные операции: поле «Часов», сумма в итоге', () => {
      render(<CalculatorPage />)
      fireEvent.click(screen.getByLabelText(/Ручные операции/))
      const hours = screen.getByLabelText('Часов')
      expect(hours.value).toBe('1')
      fireEvent.change(hours, { target: { value: '2' } })
      fireEvent.blur(hours)
      // 10 651 + 2 × 500
      expect(screen.getAllByText('11 651 ₽').length).toBeGreaterThan(0)
      expect(screen.getByText('2 ч × 500 ₽')).toBeInTheDocument()
    })
  })
})
