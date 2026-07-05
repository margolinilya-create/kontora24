import { useState } from 'react'
import { createMaterial } from '../hooks/useMaterials'
import { MATERIAL_TYPES } from '@/shared/constants'
import { UNIT_OPTIONS } from './MaterialEditModal'
import { FilmFields } from './FilmFields'
import { composeMaterialName, isStructuredFilmType } from '../lib/material-name'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import Modal from '@/shared/components/Modal'
import Input from '@/shared/components/Input'
import Button from '@/shared/components/Button'

const EMPTY_FILM = { manufacturer: '', product_line: '', roll_width_m: '', finish: null, color: '' }

export function MaterialForm({ onClose, onCreated }) {
  const [form, setForm] = useState({
    type: 'film', name: '', unit: 'м', stockQty: 0, minQty: 0, unitCost: 0, ...EMPTY_FILM,
  })
  const [loading, setLoading] = useState(false)

  function update(k, v) { setForm((p) => ({ ...p, [k]: v })) }
  const isFilm = isStructuredFilmType(form.type)

  // Auto-set unit when type changes (но можно переопределить через select).
  // Плёнка/ламинация — погонные метры ('м').
  function handleTypeChange(type) {
    const unitMap = { film: 'м', lam_film: 'м', ink: 'ml', resin: 'g', blade: 'шт' }
    update('type', type)
    update('unit', unitMap[type] || 'шт')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    // Для плёнки/ламинации имя собирается из структурных полей, иначе — свободный текст.
    const name = isFilm ? composeMaterialName(form) : form.name.trim()
    if (!name) {
      toast.error(isFilm ? 'Заполните параметры плёнки (хотя бы производителя/серию)' : 'Укажите название')
      return
    }
    setLoading(true)
    try {
      await createMaterial({
        type: form.type, name, unit: form.unit,
        stockQty: form.stockQty, minQty: form.minQty, unitCost: form.unitCost,
        ...(isFilm ? {
          manufacturer: form.manufacturer || null,
          product_line: form.product_line || null,
          roll_width_m: form.roll_width_m ? Number(form.roll_width_m) : null,
          finish: form.finish || null,
          color: form.color || null,
        } : {}),
      })
      toast.success('Материал добавлен')
      onCreated()
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={true} onClose={onClose} title="Новый материал" maxWidth="max-w-sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="mat-type" className="block text-sm font-medium text-text mb-1">Тип</label>
            <select
              id="mat-type"
              value={form.type}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              {Object.entries(MATERIAL_TYPES).map(([key, m]) => (
                <option key={key} value={key}>{m.label}</option>
              ))}
            </select>
          </div>
          {/* R13.1: dropdown вместо хардкода — менеджер может переопределить
              автозаполнение из unitMap (например, плёнка в погонных метрах). */}
          <div>
            <label htmlFor="mat-unit" className="block text-sm font-medium text-text mb-1">Ед. измерения</label>
            <select
              id="mat-unit"
              value={form.unit}
              onChange={(e) => update('unit', e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              {UNIT_OPTIONS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>

        {isFilm ? (
          <FilmFields value={form} onChange={update} />
        ) : (
          <Input
            label="Название *"
            id="mat-name"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="Смола эпоксидная"
            autoFocus
          />
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input
            label={`Остаток (${form.unit})`}
            id="mat-stock"
            type="number"
            value={form.stockQty}
            onChange={(e) => update('stockQty', Number(e.target.value))}
            min="0"
            step="any"
          />
          <Input
            label="Минимум"
            id="mat-min"
            type="number"
            value={form.minQty}
            onChange={(e) => update('minQty', Number(e.target.value))}
            min="0"
            step="any"
          />
        </div>

        <Input
          label="Себестоимость 1 ед. (₽)"
          id="mat-cost"
          type="number"
          value={form.unitCost}
          onChange={(e) => update('unitCost', Number(e.target.value))}
          min="0"
          step="any"
        />
        <p className="text-xs text-text-muted -mt-2">
          Стартовое значение. При следующих приходах с указанной стоимостью пересчитается автоматически.
        </p>

        <Button type="submit" loading={loading} className="w-full">
          Добавить материал
        </Button>
      </form>
    </Modal>
  )
}
