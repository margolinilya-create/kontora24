-- Migration 034: вместимость коробок (capacity_per_box) для авто-расчёта boxes_used
--
-- Tech debt из R6.1: на упаковке менеджер вводил boxes_used вручную, хотя
-- информация о вместимости (X шт) уже зашита в названии коробки —
-- «Коробка 280:160:50 (50 шт)». Теперь UI автоматически предлагает
-- boxes_used = ceil(packs_packaged / capacity_per_box).
--
-- Колонка nullable: если capacity_per_box NULL → авто-расчёта нет,
-- работает старая ручная логика.

ALTER TABLE k24_materials
  ADD COLUMN IF NOT EXISTS capacity_per_box INT;

COMMENT ON COLUMN k24_materials.capacity_per_box IS
  'Вместимость для коробок (type=box). Используется на упаковке для авто-расчёта boxes_used = ceil(packs_packaged / capacity).';

-- Бэкфилл существующих коробок: парсим «(N шт)» из конца названия
UPDATE k24_materials
  SET capacity_per_box = (regexp_match(name, '\((\d+)\s*шт\)'))[1]::INT
  WHERE type = 'box'
    AND capacity_per_box IS NULL
    AND name ~ '\((\d+)\s*шт\)';
