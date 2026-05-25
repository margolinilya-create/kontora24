import { useMemo, useState } from 'react'
import { bulkInventory } from '../hooks/useMaterials'
import { MATERIAL_TYPES, getMaterialCategory, MATERIAL_CATEGORIES } from '@/shared/constants'
import { formatNumber } from '@/shared/lib/utils'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { WarehouseFilterBar } from './WarehouseFilterBar'

/**
 * Массовая инвентаризация остатков.
 * Менеджер вводит фактические остатки по каждой строке → нажимает «Сохранить».
 * Для каждой изменённой строки создаётся material_transaction с reason='Инвентаризация'
 * и дельтой (факт − текущий). Пустые ячейки игнорируются.
 */
export function InventoryTab({ materials, onSaved }) {
  // map<materialId, factualQty (string)>
  const [values, setValues] = useState({})
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')

  // Сгруппированные по категории (UI-категория из getMaterialCategory)
  const grouped = useMemo(() => {
    const groups = {}
    for (const m of materials) {
      if (search.trim()) {
        const q = search.toLowerCase()
        if (!m.name?.toLowerCase().includes(q)) continue
      }
      const cat = getMaterialCategory(m) || 'utensils'
      if (category !== 'all' && cat !== category) continue
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(m)
    }
    // Сортировка внутри группы по имени
    for (const cat of Object.keys(groups)) {
      groups[cat].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    }
    return groups
  }, [materials, search, category])

  // Сколько строк изменено относительно текущих остатков
  const changedCount = useMemo(() => {
    let n = 0
    for (const m of materials) {
      const raw = values[m.id]
      if (raw === undefined || raw === '') continue
      const fact = Number(raw)
      const current = Number(m.stock_qty) || 0
      if (!isNaN(fact) && Math.abs(fact - current) >= 0.0001) n++
    }
    return n
  }, [values, materials])

  function update(id, val) {
    setValues((prev) => ({ ...prev, [id]: val }))
  }

  function resetAll() {
    setValues({})
  }

  async function handleSave() {
    if (changedCount === 0) {
      toast.error('Нет изменений — введите фактические остатки')
      return
    }
    setSaving(true)
    try {
      const items = materials
        .filter((m) => {
          const raw = values[m.id]
          if (raw === undefined || raw === '') return false
          const fact = Number(raw)
          const current = Number(m.stock_qty) || 0
          return !isNaN(fact) && Math.abs(fact - current) >= 0.0001
        })
        .map((m) => ({
          materialId: m.id,
          currentQty: m.stock_qty,
          factualQty: Number(values[m.id]),
        }))
      const result = await bulkInventory(items)
      toast.success(`Инвентаризация: ${result.updated} ${result.updated === 1 ? 'позиция' : 'позиций'} обновлено`)
      setValues({})
      onSaved?.()
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header — поиск + категория + действия */}
      <div className="bg-surface rounded-2xl border border-border shadow-card p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex-1">
            <h2 className="font-semibold">Инвентаризация остатков</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Введите фактические остатки по позициям и сохраните. Транзакции создаются с типом «Инвентаризация».
              Пустые поля и неизменённые позиции игнорируются.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {Object.keys(values).length > 0 && (
              <Button variant="secondary" size="sm" onClick={resetAll}>
                Сбросить
              </Button>
            )}
            <Button onClick={handleSave} loading={saving} disabled={changedCount === 0}>
              Сохранить {changedCount > 0 && `(${changedCount})`}
            </Button>
          </div>
        </div>
        <WarehouseFilterBar
          search={search}
          onSearch={setSearch}
          category={category}
          onCategory={setCategory}
          showStatus={false}
        />
      </div>

      {/* Группы материалов */}
      {Object.keys(grouped).length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border shadow-card p-10 text-center text-text-muted">
          Нет материалов по запросу
        </div>
      ) : (
        Object.entries(grouped).map(([cat, items]) => (
          <div key={cat} className="bg-surface rounded-2xl border border-border shadow-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-surface-2">
              <h3 className="font-semibold text-sm">
                {MATERIAL_CATEGORIES[cat]?.label || cat}
                <span className="text-text-muted font-normal ml-2">· {items.length}</span>
              </h3>
            </div>
            <div className="divide-y divide-border">
              {items.map((m) => {
                const raw = values[m.id]
                const fact = raw === '' || raw === undefined ? null : Number(raw)
                const current = Number(m.stock_qty) || 0
                const unit = m.unit || MATERIAL_TYPES[m.type]?.unit || ''
                const delta = fact != null && !isNaN(fact) ? fact - current : null
                const negative = delta !== null && delta < 0
                const positive = delta !== null && delta > 0
                return (
                  <div key={m.id} className="grid grid-cols-12 items-center gap-3 px-4 py-2.5">
                    <div className="col-span-12 sm:col-span-5">
                      <p className="text-sm font-medium truncate">{m.name}</p>
                      <p className="text-xs text-text-muted">{MATERIAL_TYPES[m.type]?.label || m.type}</p>
                    </div>
                    <div className="col-span-4 sm:col-span-2 text-sm text-text-muted tabular-nums">
                      <span className="text-xs text-text-muted">Сейчас:</span>{' '}
                      <span className="font-medium text-text">{formatNumber(current, 2)}</span>{' '}
                      <span className="text-xs">{unit}</span>
                    </div>
                    <div className="col-span-5 sm:col-span-3">
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min="0"
                        value={raw ?? ''}
                        onChange={(e) => update(m.id, e.target.value)}
                        placeholder="Факт"
                        aria-label={`Фактический остаток ${m.name}`}
                      />
                    </div>
                    <div className="col-span-3 sm:col-span-2 text-right text-xs tabular-nums">
                      {delta !== null && (
                        <span className={positive ? 'text-success font-medium' : negative ? 'text-danger font-medium' : 'text-text-muted'}>
                          {delta > 0 ? '+' : ''}{formatNumber(delta, 2)} {unit}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}

      {/* Floating save bar внизу — для длинных списков */}
      {changedCount > 0 && (
        <div className="sticky bottom-4 bg-surface rounded-2xl border border-border shadow-card p-3 flex items-center justify-between">
          <span className="text-sm">
            Изменено позиций: <strong>{changedCount}</strong>
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={resetAll}>Сбросить</Button>
            <Button onClick={handleSave} loading={saving}>Сохранить инвентаризацию</Button>
          </div>
        </div>
      )}
    </div>
  )
}
