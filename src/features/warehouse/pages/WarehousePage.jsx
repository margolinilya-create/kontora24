import { useState } from 'react'
import { useMaterials } from '../hooks/useMaterials'
import { MaterialCard } from '../components/MaterialCard'
import { StockModal } from '../components/StockModal'
import { MaterialForm } from '../components/MaterialForm'
import { ConsumptionChart } from '../components/ConsumptionChart'
import { MaterialsTable } from '../components/MaterialsTable'
import { TransactionsHistory } from '../components/TransactionsHistory'
import { InventoryTab } from '../components/InventoryTab'
import { MATERIAL_TYPES } from '@/shared/constants'
import Button from '@/shared/components/Button'
import Spinner from '@/shared/components/Spinner'
import Tabs from '@/shared/components/Tabs'
import DropdownMenu from '@/shared/components/DropdownMenu'
import ErrorState from '@/shared/components/ErrorState'

export default function WarehousePage() {
  const { materials, loading, error, refetch } = useMaterials()
  const [selectedMaterial, setSelectedMaterial] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showLowOnly, setShowLowOnly] = useState(false)
  const [showReservedOnly, setShowReservedOnly] = useState(false)
  const [tab, setTab] = useState('stock') // 'stock' | 'table' | 'history' | 'analytics'

  const lowStockCount = materials.filter(
    (m) => m.min_qty > 0 && Number(m.stock_qty) <= Number(m.min_qty)
  ).length
  const reservedCount = materials.filter((m) => m.reserved > 0).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight">Склад</h1>
          <p className="text-text-muted">
            {materials.length} материалов
            {lowStockCount > 0 && (
              <span className="text-danger ml-2">({lowStockCount} с низким остатком)</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {reservedCount > 0 && (
            <Button
              variant={showReservedOnly ? 'primary' : 'secondary'}
              size="md"
              onClick={() => { setShowReservedOnly(!showReservedOnly); if (!showReservedOnly) setShowLowOnly(false) }}
            >
              {showReservedOnly ? 'Все' : 'Зарезервированные'}
            </Button>
          )}
          {lowStockCount > 0 && (
            <Button
              variant={showLowOnly ? 'danger' : 'secondary'}
              size="md"
              onClick={() => { setShowLowOnly(!showLowOnly); if (!showLowOnly) setShowReservedOnly(false) }}
            >
              {showLowOnly ? 'Все' : 'Мало на складе'}
            </Button>
          )}
          <Button onClick={() => setShowCreateForm(true)}>
            + Материал
          </Button>
        </div>
      </div>

      {/* Tabs (desktop) / Dropdown (mobile) */}
      {(() => {
        const tabItems = [
          { key: 'stock', label: 'Виджеты' },
          { key: 'table', label: 'Список' },
          { key: 'inventory', label: 'Инвентаризация' },
          { key: 'history', label: 'История операций' },
          { key: 'analytics', label: 'Расход и прогноз' },
        ]
        return (
          <>
            <Tabs items={tabItems} active={tab} onChange={setTab} className="hidden md:inline-flex" />
            <DropdownMenu items={tabItems} active={tab} onChange={setTab} className="md:hidden" align="left" />
          </>
        )
      })()}

      {tab === 'analytics' ? (
        <ConsumptionChart />
      ) : tab === 'table' ? (
        <MaterialsTable materials={materials} onSelect={setSelectedMaterial} />
      ) : tab === 'inventory' ? (
        <InventoryTab materials={materials} onSaved={refetch} />
      ) : tab === 'history' ? (
        <TransactionsHistory />
      ) : (
      <>
      {/* Summary cards — bento tiles. Wide Onder numerals don't fit in
          6-column grid; 3-col on large keeps room for tail units. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {Object.entries(MATERIAL_TYPES).map(([type, info]) => {
          const items = materials.filter((m) => m.type === type)
          const total = items.reduce((sum, m) => sum + Number(m.stock_qty), 0)
          const display = total.toFixed(1)
          const shrinkValue = display.length > 8
          return (
            <div key={type} className="bg-surface rounded-2xl border border-border shadow-card p-4">
              <p className="text-sm text-text-muted">{info.label}</p>
              <p className="mt-1 flex items-baseline gap-1 min-w-0">
                <span className={`font-bold font-display tracking-tight truncate ${shrinkValue ? 'text-base' : 'text-xl'} ${total < 0 ? 'text-danger' : ''}`} title={total < 0 ? 'Отрицательный остаток' : undefined}>
                  {display}
                </span>
                <span className="text-sm font-normal text-text-muted font-sans">{info.unit}</span>
              </p>
            </div>
          )
        })}
      </div>

      {/* Material list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : materials.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border shadow-card p-12 text-center">
          <p className="text-text-muted">Нет материалов. Запустите seed.sql в Supabase для начальных данных.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {materials.filter((m) => {
            if (showLowOnly) return m.min_qty > 0 && Number(m.stock_qty) <= Number(m.min_qty)
            if (showReservedOnly) return m.reserved > 0
            return true
          }).map((m) => (
            <MaterialCard
              key={m.id}
              material={m}
              onAddStock={() => setSelectedMaterial(m)}
            />
          ))}
        </div>
      )}

      {/* Stock modal */}
      {selectedMaterial && (
        <StockModal
          material={selectedMaterial}
          onClose={() => setSelectedMaterial(null)}
          onDone={() => {
            setSelectedMaterial(null)
            refetch()
          }}
        />
      )}

      {/* Create material form */}
      {showCreateForm && (
        <MaterialForm
          onClose={() => setShowCreateForm(false)}
          onCreated={() => { setShowCreateForm(false); refetch() }}
        />
      )}
      </>
      )}
    </div>
  )
}
