import { useMemo } from 'react'
import { useOrderTypesStore } from '../store'
import { ORDER_TYPES } from '@/shared/constants'

/**
 * R25.7C (ТЗ 7.1): варианты «Тип продукции» для форм заказа — активные
 * (неархивные) типы реестра k24_order_types (встроенные + свои) в порядке
 * sort_order. Реестр пуст (до загрузки / без миграции 102) → константы
 * ORDER_TYPES. Текущее значение заказа показывается, даже если тип в архиве.
 * @param {string} [currentValue]
 * @returns {{ key: string, label: string, isSet: boolean, builtin: boolean }[]}
 */
export function buildOrderTypeOptions(types, currentValue) {
  if (!types || types.length === 0) {
    return Object.entries(ORDER_TYPES).map(([key, { label }]) => ({
      key, label, isSet: key === 'stickerpack' || key === 'stickerpack3D', builtin: true,
    }))
  }
  return [...types]
    .filter((t) => !t.archived_at || t.key === currentValue)
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
    .map((t) => ({ key: t.key, label: t.name, isSet: !!t.is_set, builtin: !!t.is_builtin }))
}

export function useOrderTypeOptions(currentValue) {
  const types = useOrderTypesStore((s) => s.types)
  return useMemo(() => buildOrderTypeOptions(types, currentValue), [types, currentValue])
}
