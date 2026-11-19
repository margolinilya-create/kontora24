import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

vi.mock('@/features/auth/hooks/useCanDo', () => ({ useCanDo: () => true }))

const { CalcSnapshotCard } = await import('./CalcSnapshotCard')

const SNAP = {
  version: 1,
  calculated_at: '2026-11-17T10:00:00.000Z',
  calculated_by: { id: 'u1', name: 'Анна' },
  input: {
    product: 'pack', width_mm: 105, height_mm: 148, film_group: 'holo',
    film_material_id: 'f2', film_name: 'Голографическая плёнка',
    lam_material_id: null, lam_name: null, views: [200], options: { resin3d: true },
  },
  product_label: '3D стикерпак',
  qty: 200,
  price_per_unit: 178.75,
  total_rounded: 35751,
}

function CalcProbe() {
  const loc = useLocation()
  return <div data-testid="calc-state">{JSON.stringify(loc.state?.calcRestore)}</div>
}

function renderCard(order, items) {
  return render(
    <MemoryRouter initialEntries={['/orders/o1']}>
      <Routes>
        <Route path="/orders/o1" element={<CalcSnapshotCard order={order} items={items} />} />
        <Route path="/calculator" element={<CalcProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('CalcSnapshotCard', () => {
  it('без снимка ничего не рисует', () => {
    const { container } = renderCard({ price_final: 1000, calc_snapshot: null })
    expect(container.textContent).toBe('')
  })

  it('показывает расчёт; цена совпадает — без пометки', () => {
    renderCard({ price_final: 35751, calc_snapshot: SNAP })
    expect(screen.getByText('Расчёт из калькулятора')).toBeInTheDocument()
    expect(screen.getByText('3D стикерпак')).toBeInTheDocument()
    expect(screen.getByText('35 751 ₽')).toBeInTheDocument()
    expect(screen.queryByText(/Цена изменена вручную/)).toBeNull()
  })

  it('ручная смена цены → оранжевая пометка с суммой расчёта', () => {
    renderCard({ price_final: 30000, calc_snapshot: SNAP })
    expect(screen.getByText('Цена изменена вручную: в расчёте 35 751 ₽')).toBeInTheDocument()
  })

  it('«Открыть в калькуляторе» передаёт восстановленный расчёт через state роутера', () => {
    renderCard({ price_final: 35751, calc_snapshot: SNAP })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть в калькуляторе' }))
    const state = JSON.parse(screen.getByTestId('calc-state').textContent)
    expect(state).toMatchObject({ product: 'pack', width: '105', height: '148', filmId: 'f2', views: [200] })
    expect(state.options.resin3d).toBe(true)
  })

  it('R27.0: виды изменены после расчёта — пометка; в калькулятор уходят текущие виды', () => {
    renderCard({ price_final: 35751, calc_snapshot: SNAP }, [
      { idx: 2, qty: 50, width_mm: 105, height_mm: 148 },
      { idx: 1, qty: 150, width_mm: 105, height_mm: 148 },
    ])
    expect(screen.getByText('Виды изменены после расчёта: сейчас 150 + 50 шт')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Открыть в калькуляторе' }))
    const state = JSON.parse(screen.getByTestId('calc-state').textContent)
    expect(state.views).toEqual([150, 50])
  })

  it('R27.0: виды совпадают с расчётом — без пометки', () => {
    renderCard({ price_final: 35751, calc_snapshot: SNAP }, [{ idx: 1, qty: 200, width_mm: 105, height_mm: 148 }])
    expect(screen.queryByText(/Виды изменены после расчёта/)).toBeNull()
  })
})
