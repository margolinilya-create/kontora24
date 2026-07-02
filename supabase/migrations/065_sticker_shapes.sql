-- Migration 065: R19 — типы (формы) стикеров + дифференцированная оплата заливки
--
-- Бриф 30.06 (пункты 9–10): у стикеров есть форма (стандартная / сложная /
-- большая / сложная+большая), и заливка оплачивается по-разному:
--   стандартная 1.0 ₽ · сложная 1.5 ₽ · большая 1.5 ₽ · сложная+большая 2.0 ₽.
--
-- Форма хранится там, куда джойнится лог заливки (k24_production_logs несёт
-- design_index, но НЕ item_idx):
--   • k24_pack_designs.shape_type — по design_index (номер стикера в паке /
--     дизайн-вид sticker3D);
--   • k24_orders.sticker_shape    — order-level для одиночного sticker3D.
--
-- Дефолт 'standard' сохраняет текущее поведение (1.0 ₽) без backfill.

BEGIN;

ALTER TABLE k24_pack_designs
  ADD COLUMN IF NOT EXISTS shape_type TEXT NOT NULL DEFAULT 'standard'
  CHECK (shape_type IN ('standard','complex','big','complex_big'));

ALTER TABLE k24_orders
  ADD COLUMN IF NOT EXISTS sticker_shape TEXT NOT NULL DEFAULT 'standard'
  CHECK (sticker_shape IN ('standard','complex','big','complex_big'));

-- Сид bonus_rates: ставки заливки по формам редактируются через /settings.
-- Если строка уже есть — доливаем поле pouring_shapes, не затирая остальное.
INSERT INTO k24_settings (key, value)
VALUES ('bonus_rates', jsonb_build_object(
  'pouring', 1,
  'selection', 0.5,
  'assembly_3d', 0.5,
  'packaging', 1.5,
  'pouring_shapes', jsonb_build_object(
    'standard', 1.0, 'complex', 1.5, 'big', 1.5, 'complex_big', 2.0
  )
))
ON CONFLICT (key) DO UPDATE SET value =
  k24_settings.value || jsonb_build_object(
    'pouring_shapes', COALESCE(k24_settings.value->'pouring_shapes', jsonb_build_object(
      'standard', 1.0, 'complex', 1.5, 'big', 1.5, 'complex_big', 2.0
    ))
  );

COMMIT;
