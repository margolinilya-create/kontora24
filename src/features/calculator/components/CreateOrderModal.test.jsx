// R25.6: попап «Создать заказ» — реальная форма CreateOrderForm, внешние
// зависимости (Supabase, склад, селекты позиций) замоканы.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { calculate, DEFAULT_CALC_SETTINGS } from '../lib/calc'

let canFinance = false
const createOrder = vi.fn()
const replaceOrderItems = vi.fn()
const findOrCreateClientByName = vi.fn()

vi.mock('@/features/auth/hooks/useAuth', () => ({ useAuth: () => ({ profile: { id: 'u1', role: 'manager', display_name: 'Анна' } }) }))
vi.mock('@/features/auth/hooks/useCanDo', () => ({ useCanDo: (p) => (p === 'view:finance' ? canFinance : true) }))
vi.mock('@/features/orders/hooks/useOrders', () => ({ createOrder: (...a) => createOrder(...a) }))
vi.mock('@/features/orders/hooks/useOrderItems', () => ({ replaceOrderItems: (...a) => replaceOrderItems(...a) }))
vi.mock('@/features/clients/hooks/useClients', () => ({ findOrCreateClientByName: (...a) => findOrCreateClientByName(...a) }))
vi.mock('@/features/production/hooks/usePackDesigns', () => ({ applyPackShapes: vi.fn() }))
vi.mock('@/features/warehouse/hooks/useMaterials', () => ({ useMaterials: () => ({ materials: [] }) }))
vi.mock('@/features/orders/lib/material-forecast', () => ({ forecastMaterials: () => [] }))
vi.mock('@/features/orders/lib/order-attachments', () => ({ uploadAttachment: vi.fn(), validatePreviewFile: () => null }))
vi.mock('@/features/orders/components/MaterialForecast', () => ({ MaterialForecast: () => null }))
vi.mock('@/features/orders/components/FilmSelect', () => ({
  FilmSelect: ({ label, value }) => <div data-testid="film-select">{label}:{value}</div>,
}))
vi.mock('@/features/orders/components/LaminationSelect', () => ({
  LaminationSelect: ({ label, value }) => <div data-testid="lam-select">{label}:{value || ''}</div>,
}))
vi.mock('@/features/orders/components/MontageFilmSelect', () => ({ MontageFilmSelect: () => null }))
vi.mock('@/features/contractors/components/ContractorSelect', () => ({ ContractorSelect: () => null }))
vi.mock('@/shared/lib/supabase', () => {
  const chain = {
    select: () => chain, lte: () => chain, order: () => chain, limit: () => chain,
    maybeSingle: () => Promise.resolve({ data: { id: 7 }, error: null }),
  }
  return { supabase: { from: () => chain } }
})

const { CreateOrderModal } = await import('./CreateOrderModal')

// jsdom не реализует scrollIntoView (форма прокручивает к первой ошибке).
Element.prototype.scrollIntoView = vi.fn()

const FILM = { id: 'f1', material_code: 'G', name: 'Orajet G' }

function renderModal(input, onClose = vi.fn()) {
  const result = calculate({
    product: 'sticker', widthMm: 100, heightMm: 100, filmGroup: 'white', views: [500], options: {}, ...input,
  }, DEFAULT_CALC_SETTINGS)
  const utils = render(
    <MemoryRouter>
      <CreateOrderModal result={result} film={FILM} lam={null} labels={{ material: 'Белая плёнка' }} onClose={onClose} />
    </MemoryRouter>,
  )
  return { ...utils, result, onClose }
}

describe('CreateOrderModal', () => {
  beforeEach(() => {
    canFinance = false
    createOrder.mockReset().mockResolvedValue({ id: 'o1', number: 42, custom_number: null })
    replaceOrderItems.mockReset().mockResolvedValue()
    findOrCreateClientByName.mockReset().mockResolvedValue({ id: 'c1' })
  })

  it('форма заполнена из расчёта и помечена «из расчёта»; цена скрыта без права на финансы', () => {
    const { container } = renderModal({ options: { resin3d: true, urgent: true } })
    expect(screen.getByText('Новый заказ из расчёта')).toBeInTheDocument()
    expect(screen.getAllByText('из расчёта').length).toBeGreaterThan(3)
    expect(container.querySelector('input[name="width_mm"]').value).toBe('100')
    expect(container.querySelector('input[name="qty"]').value).toBe('500')
    expect(container.querySelector('input[name="is_urgent"]').checked).toBe(true)
    expect(screen.getByTestId('film-select').textContent).toContain('f1')
    expect(container.querySelector('input[name="price_final"]')).toBeNull()
  })

  it('3 вида 100/200/200 → заказ с тремя видами и тиражом 500; цена и снимок пишутся без права на финансы', async () => {
    const { container, result, onClose } = renderModal({ views: [100, 200, 200], options: { resin3d: true, designEdit: true } })
    expect(container.querySelector('#items_count').value).toBe('3')
    fireEvent.change(screen.getByPlaceholderText('Имя или название компании'), { target: { value: 'ООО Ромашка' } })
    fireEvent.change(container.querySelector('input[name="deadline"]'), { target: { value: '2026-12-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Создать заказ' }))

    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1))
    const payload = createOrder.mock.calls[0][0]
    expect(payload).toMatchObject({
      order_type: 'sticker3D',
      qty: 500,
      width_mm: 100,
      height_mm: 100,
      film_material_id: 'f1',
      film_type: 'G',
      design_status: 'needs_edit',
      price_final: result.totalRounded,
      client_id: 'c1',
    })
    expect(payload.price_per_unit).toBeCloseTo(result.pricePerUnit, 2)
    expect(payload.calc_snapshot).toMatchObject({
      settings_history_id: 7,
      total_rounded: result.totalRounded,
      calculated_by: { id: 'u1', name: 'Анна' },
      input: { views: [100, 200, 200], film_material_id: 'f1' },
    })
    expect(payload.calc_snapshot.detailed_text).toContain('Итого:')
    await waitFor(() => expect(replaceOrderItems).toHaveBeenCalledWith('o1', [
      { width_mm: 100, height_mm: 100, qty: 100 },
      { width_mm: 100, height_mm: 100, qty: 200 },
      { width_mm: 100, height_mm: 100, qty: 200 },
    ]))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('R27.3: ручные операции → примечание заказа; часы и ставка — в снимке', () => {
    const { container } = renderModal({ manualHours: 2, options: { manual: true } })
    expect(container.querySelector('textarea[name="notes"]').value).toBe('Ручные операции по расчёту: 2 ч')
  })

  it('те же проверки, что на странице: без заказчика и срока заказ не создаётся', async () => {
    renderModal({})
    fireEvent.click(screen.getByRole('button', { name: 'Создать заказ' }))
    expect((await screen.findAllByText('Укажите заказчика')).length).toBeGreaterThan(0)
    expect(createOrder).not.toHaveBeenCalled()
  })

  it('закрытие без изменений — сразу; с изменениями — подтверждение «Закрыть без сохранения?»', () => {
    const first = renderModal({})
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(first.onClose).toHaveBeenCalledTimes(1)
    first.unmount()

    const second = renderModal({})
    fireEvent.change(screen.getByPlaceholderText('Имя или название компании'), { target: { value: 'Клиент' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Закрыть' })[0])
    expect(second.onClose).not.toHaveBeenCalled()
    expect(screen.getByText('Закрыть без сохранения?')).toBeInTheDocument()
  })
})
