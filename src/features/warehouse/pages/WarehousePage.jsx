import { useState, useMemo, lazy, Suspense } from 'react'
import { useMaterials } from '../hooks/useMaterials'
import { usePlannedConsumption } from '../hooks/usePlannedConsumption'
import { MaterialCard } from '../components/MaterialCard'
import { StockModal } from '../components/StockModal'
import { MaterialForm } from '../components/MaterialForm'
import { MaterialsTable } from '../components/MaterialsTable'
import { TransactionsHistory } from '../components/TransactionsHistory'
import { InventoryTab } from '../components/InventoryTab'
import { WarehouseFilterBar } from '../components/WarehouseFilterBar'
import { MATERIAL_TYPES, getMaterialCategory, getStockStatus } from '@/shared/constants'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import Button from '@/shared/components/Button'
import Spinner from '@/shared/components/Spinner'
import Tabs from '@/shared/components/Tabs'
import DropdownMenu from '@/shared/components/DropdownMenu'
import ErrorState from '@/shared/components/ErrorState'

// Lazy: Recharts весит ~395 KB. Грузим только при открытии вкладки «Аналитика».
const ConsumptionChart = lazy(() => import('../components/ConsumptionChart').then((m) => ({ default: m.ConsumptionChart })))

export default function WarehousePage() {
  const [showArchived, setShowArchived] = useState(false)
  const { materials, loading, error, refetch } = useMaterials({ includeArchived: showArchived })
  // План трат: сумма прогноза forecastMaterials по активным заказам без логов.
  const { plan: planMap } = usePlannedConsumption(materials)
  const canCreateMaterial = useCanDo('material:manage') // создание новых позиций — для admin/manager (UI guard)
  const [selectedMaterial, setSelectedMaterial] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [tab, setTab] = useState('stock') // 'stock' | 'table' | 'inventory' | 'history' | 'analytics'

  // Общий стейт фильтра — переиспользуется на табах stock и table.
  const [filter, setFilter] = useState({ search: '', category: 'all', status: 'all' })

  const lowStockCount = materials.filter(
    (m) => m.min_qty > 0 && Number(m.stock_qty) <= Number(m.min_qty)
  ).length

  // Фильтрация для таба «Состояние склада» (bento + карточки).
  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      if (filter.category !== 'all' && getMaterialCategory(m) !== filter.category) return false
      if (filter.status !== 'all' && getStockStatus(m).key !== filter.status) return false
      if (filter.search && !(m.name || '').toLowerCase().includes(filter.search.toLowerCase())) return false
      return true
    })
  }, [materials, filter])

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
          {canCreateMaterial && (
            <Button onClick={() => setShowCreateForm(true)}>
              + Материал
            </Button>
          )}
        </div>
      </div>

      {/* Tabs (desktop) / Dropdown (mobile) */}
      {(() => {
        const tabItems = [
          { key: 'stock', label: 'Состояние склада' },
          { key: 'table', label: 'Список' },
          { key: 'inventory', label: 'Инвентаризация' },
          { key: 'history', label: 'История операций' },
          { key: 'analytics', label: 'Расход и прогноз' },
        ]
        return (
          <>
            <div className="hidden md:inline-block">
              <Tabs items={tabItems} active={tab} onChange={setTab} />
            </div>
            <DropdownMenu items={tabItems} active={tab} onChange={setTab} className="md:hidden" align="left" />
          </>
        )
      })()}

      {tab === 'analytics' ? (
        <Suspense fallback={<Spinner />}>
          <ConsumptionChart />
        </Suspense>
      ) : tab === 'table' ? (
        <MaterialsTable
          materials={materials}
          onSelect={setSelectedMaterial}
          filter={filter}
          onFilter={setFilter}
          onUpdated={refetch}
          showArchived={showArchived}
          onToggleArchived={setShowArchived}
          planMap={planMap}
        />
      ) : tab === 'inventory' ? (
        <InventoryTab materials={materials} onSaved={refetch} />
      ) : tab === 'history' ? (
        <TransactionsHistory />
      ) : (
        <>
          <WarehouseFilterBar
            search={filter.search}
            onSearch={(v) => setFilter({ ...filter, search: v })}
            category={filter.category}
            onCategory={(v) => setFilter({ ...filter, category: v })}
            status={filter.status}
            onStatus={(v) => setFilter({ ...filter, status: v })}
            showArchived={showArchived}
            onToggleArchived={setShowArchived}
          />

          {/* Summary tiles — суммы остатков по типам, агрегируем по отфильтрованным */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {Object.entries(MATERIAL_TYPES).map(([type, info]) => {
              const items = filteredMaterials.filter((m) => m.type === type)
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
          ) : filteredMaterials.length === 0 ? (
            <div className="bg-surface rounded-2xl border border-border shadow-card p-12 text-center text-text-muted">
              Нет материалов под выбранные фильтры
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredMaterials.map((m) => (
                <MaterialCard
                  key={m.id}
                  material={m}
                  onAddStock={() => setSelectedMaterial(m)}
                  onUpdated={refetch}
                  plannedInfo={planMap?.get(m.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Модалки вне дерева табов — открываются с любого таба */}
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
      {showCreateForm && (
        <MaterialForm
          onClose={() => setShowCreateForm(false)}
          onCreated={() => { setShowCreateForm(false); refetch() }}
        />
      )}
    </div>
  )
}
