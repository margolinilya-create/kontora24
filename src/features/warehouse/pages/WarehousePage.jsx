import { useState } from 'react'
import { useMaterials } from '../hooks/useMaterials'
import { MaterialCard } from '../components/MaterialCard'
import { StockModal } from '../components/StockModal'
import { MaterialForm } from '../components/MaterialForm'
import { ConsumptionChart } from '../components/ConsumptionChart'
import { MATERIAL_TYPES } from '@/shared/constants'

export default function WarehousePage() {
  const { materials, loading, refetch } = useMaterials()
  const [selectedMaterial, setSelectedMaterial] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showLowOnly, setShowLowOnly] = useState(false)
  const [tab, setTab] = useState('stock') // 'stock' | 'analytics'

  const lowStockCount = materials.filter(
    (m) => m.min_qty > 0 && Number(m.stock_qty) <= Number(m.min_qty)
  ).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Склад</h1>
          <p className="text-text-muted">
            {materials.length} материалов
            {lowStockCount > 0 && (
              <span className="text-danger ml-2">({lowStockCount} с низким остатком)</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lowStockCount > 0 && (
            <button
              onClick={() => setShowLowOnly(!showLowOnly)}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${showLowOnly ? 'bg-danger text-white' : 'border border-border text-text-muted hover:bg-surface-dim'}`}
            >
              {showLowOnly ? 'Все' : 'Мало на складе'}
            </button>
          )}
          <button
            onClick={() => setShowCreateForm(true)}
            className="bg-accent hover:bg-accent-hover text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors"
          >
            + Материал
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab('stock')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'stock' ? 'bg-primary text-white' : 'bg-surface border border-border text-text-muted hover:bg-surface-dim'}`}>
          Остатки
        </button>
        <button onClick={() => setTab('analytics')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'analytics' ? 'bg-primary text-white' : 'bg-surface border border-border text-text-muted hover:bg-surface-dim'}`}>
          Расход и прогноз
        </button>
      </div>

      {tab === 'analytics' ? (
        <ConsumptionChart />
      ) : (
      <>
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Object.entries(MATERIAL_TYPES).map(([type, info]) => {
          const items = materials.filter((m) => m.type === type)
          const total = items.reduce((sum, m) => sum + Number(m.stock_qty), 0)
          return (
            <div key={type} className="bg-surface rounded-xl border border-border p-4">
              <p className="text-sm text-text-muted">{info.label}</p>
              <p className="text-xl font-bold mt-1">
                {total.toFixed(1)} <span className="text-sm font-normal text-text-muted">{info.unit}</span>
              </p>
            </div>
          )
        })}
      </div>

      {/* Material list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent" />
        </div>
      ) : materials.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-12 text-center">
          <p className="text-text-muted">Нет материалов. Запустите seed.sql в Supabase для начальных данных.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {materials.filter((m) => !showLowOnly || (m.min_qty > 0 && Number(m.stock_qty) <= Number(m.min_qty))).map((m) => (
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
