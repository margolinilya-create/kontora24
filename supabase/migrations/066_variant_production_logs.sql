-- Migration 066: R20.5 (бриф 3.07) — поэвидовой учёт работы по размерным
-- видам изделий (k24_order_items).
--
-- «Если при оформлении заказа учитывается несколько видов изделий, то на всех
-- этапах производства необходимо создать строки учёта работы и прогресс-бары
-- для каждого вида» — сотрудник вводит количество и расход материала по
-- каждому виду на печати / резке / заливке / выборке / упаковке.
--
-- item_idx = k24_order_items.idx (1-based). БЕЗ FK: replaceOrderItems
-- (useOrderItems.js) делает DELETE+INSERT видов при редактировании заказа —
-- FK ломал бы либо редактирование, либо историю логов. Зеркало миграции 029
-- (design_index для видов стикеров в паке).
--
-- Триггер deduct_materials_from_log (057) — per-row delta-based: N поэвидовых
-- логов с собственными film_meters/resin_grams списывают корректно без правок.
-- check_stage_completion (058) — SUM-based: сумма по видам проходит как раньше.

ALTER TABLE k24_production_logs ADD COLUMN IF NOT EXISTS item_idx INT;

CREATE INDEX IF NOT EXISTS idx_prod_logs_item
  ON k24_production_logs(order_id, stage, item_idx)
  WHERE item_idx IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN k24_production_logs.item_idx IS
  'R20.5: индекс размерного вида (k24_order_items.idx) для поэвидового учёта';
