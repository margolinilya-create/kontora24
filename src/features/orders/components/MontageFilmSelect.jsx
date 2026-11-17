import { LaminationSelect } from './LaminationSelect'
import { MONTAGE_MATERIAL_CODE } from '@/shared/constants'

// Константы на уровне модуля — стабильные ссылки для useMemo внутри LaminationSelect.
const MONTAGE_CODES = [MONTAGE_MATERIAL_CODE]

/**
 * R25.4 (ТЗ 4.3): выбор позиции монтажной плёнки (material_code='transfer').
 * Пустое значение — позиция по умолчанию (триггер списания возьмёт позицию
 * с кодом transfer). onChange отдаёт { materialId, code }.
 */
export function MontageFilmSelect({ value, onChange, expected, id = 'montage_material_id', label = '' }) {
  return (
    <LaminationSelect
      id={id}
      label={label}
      value={value}
      onChange={onChange}
      expected={expected}
      onlyCodes={MONTAGE_CODES}
      includeOutOfStock
      emptyLabel="Позиция по умолчанию"
    />
  )
}
