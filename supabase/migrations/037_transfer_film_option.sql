-- 037_transfer_film_option — R8.2 (серия 25.05)
--
-- Бриф: добавить опцию «Монтажная плёнка ширина 1.26 м» в селект ламинации
-- (лейбл «Ламинация» → «Ламинация/перенос на монтаж»).
--
-- Технологически перенос на монтажную плёнку проходит на стадии lamination,
-- поэтому материал размещаем как type='lam_film' с material_code='transfer'.
-- Триггер deduct_materials_from_log (миграция 025) уже ищет
-- WHERE type='lam_film' AND material_code = v_lam_type, поэтому списание
-- сработает автоматически когда lam_type='transfer'.

BEGIN;

INSERT INTO k24_materials (type, name, unit, stock_qty, min_qty, unit_cost, material_code) VALUES
  ('lam_film', 'Монтажная плёнка 1.26 м', 'м', 0, 1, 232, 'transfer')
ON CONFLICT (lower(name)) DO UPDATE
  SET material_code = EXCLUDED.material_code,
      unit_cost = COALESCE(k24_materials.unit_cost, EXCLUDED.unit_cost);

COMMIT;
