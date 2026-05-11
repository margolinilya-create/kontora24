-- 019: custom_number, film_type_stickers, lamination_qty
-- Часть большого R-апдейта (тех-карта v2, прогресс v2, 3D-стикерпак, финансы).
-- Превью макета берётся из существующих attachments — отдельного поля не вводим.

-- Произвольный «человекочитаемый» номер. NULL → используется автоинкремент number.
ALTER TABLE k24_orders ADD COLUMN IF NOT EXISTS custom_number TEXT;
CREATE INDEX IF NOT EXISTS idx_k24_orders_custom_number
  ON k24_orders(custom_number) WHERE custom_number IS NOT NULL;
COMMENT ON COLUMN k24_orders.custom_number IS
  'Произвольный отображаемый номер (суффикс/префикс). NULL → используется числовой number.';

-- Раздельная плёнка для 3D-стикерпака. NULL для всех остальных типов.
-- film_type — единственная плёнка обычного заказа или плёнка ФОНОВ для stickerpack3D.
ALTER TABLE k24_orders ADD COLUMN IF NOT EXISTS film_type_stickers TEXT;
COMMENT ON COLUMN k24_orders.film_type_stickers IS
  'Только для stickerpack3D: плёнка стикеров. NULL для остальных типов.';
COMMENT ON COLUMN k24_orders.film_type IS
  'Единственная плёнка заказа. Для stickerpack3D — плёнка фонов.';

-- Заламинировано в штуках (на этапе lamination — дополнительно к метражу).
ALTER TABLE k24_production_logs ADD COLUMN IF NOT EXISTS lamination_qty INT DEFAULT 0;
COMMENT ON COLUMN k24_production_logs.lamination_qty IS
  'Заламинировано (шт) на этапе lamination, отдельно от метража.';
