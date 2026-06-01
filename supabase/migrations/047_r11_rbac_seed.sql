-- Migration 047: R11.4 — сид новых прав в k24_role_permissions
--
-- R11.0/R11.1/R11.2 добавили новые stage:* permissions в константы фронта, но
-- записи в k24_role_permissions не было — динамический стор возвращал false
-- для всех ролей кроме admin/manager (true в ROLE_STAGE_PERMISSIONS legacy).
-- Сейчас сидируем дефолтные значения.
--
-- Распределение (бриф 31.05):
--   • sample_layout / batch_layout → designer (verstka)
--   • sample_print  → printer (печать образца — печатник)
--   • color_approval → только manager/admin (согласование с заказчиком)
--   • drying / selection → post_printer (заливка/выборка)
--   • material:add_transaction → всем 5 ролям (приход/расход на складе всем)
--
-- ON CONFLICT — обновляем allowed (если правo уже есть, перезаписываем
-- на дефолт; админ при необходимости отзывает через UI).

INSERT INTO k24_role_permissions (role, permission, allowed)
VALUES
  -- admin: все новые этапы + material:add_transaction
  ('admin', 'stage:sample_layout',   true),
  ('admin', 'stage:sample_print',    true),
  ('admin', 'stage:color_approval',  true),
  ('admin', 'stage:batch_layout',    true),
  ('admin', 'stage:drying',          true),
  ('admin', 'stage:selection',       true),
  ('admin', 'material:add_transaction', true),

  -- manager: все новые этапы + material:add_transaction
  ('manager', 'stage:sample_layout',  true),
  ('manager', 'stage:sample_print',   true),
  ('manager', 'stage:color_approval', true),
  ('manager', 'stage:batch_layout',   true),
  ('manager', 'stage:drying',         true),
  ('manager', 'stage:selection',      true),
  ('manager', 'material:add_transaction', true),

  -- designer: sample_layout + batch_layout (verstka), material:add_transaction
  ('designer', 'stage:sample_layout',  true),
  ('designer', 'stage:sample_print',   false),
  ('designer', 'stage:color_approval', false),
  ('designer', 'stage:batch_layout',   true),
  ('designer', 'stage:drying',         false),
  ('designer', 'stage:selection',      false),
  ('designer', 'material:add_transaction', true),

  -- printer: sample_print (печать образца), material:add_transaction
  ('printer', 'stage:sample_layout',  false),
  ('printer', 'stage:sample_print',   true),
  ('printer', 'stage:color_approval', false),
  ('printer', 'stage:batch_layout',   false),
  ('printer', 'stage:drying',         false),
  ('printer', 'stage:selection',      false),
  ('printer', 'material:add_transaction', true),

  -- post_printer: drying + selection (3D), material:add_transaction
  ('post_printer', 'stage:sample_layout',  false),
  ('post_printer', 'stage:sample_print',   false),
  ('post_printer', 'stage:color_approval', false),
  ('post_printer', 'stage:batch_layout',   false),
  ('post_printer', 'stage:drying',         true),
  ('post_printer', 'stage:selection',      true),
  ('post_printer', 'material:add_transaction', true)

ON CONFLICT (role, permission) DO UPDATE SET allowed = EXCLUDED.allowed;
