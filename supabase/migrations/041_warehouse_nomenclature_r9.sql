-- 041 — R9 (бриф 26.05): ревизия номенклатуры склада.
--
-- Менеджер прислал каталог из ~50 позиций с себестоимостями и порогами.
-- Эта миграция:
--   1) UPDATE существующих позиций (переименование под бренды Duckson/Dickson/Orajet,
--      проставление unit_cost, обновление min_qty). material_code сохраняется —
--      lookup плёнки/ламинации по коду в триггере deduct_materials_from_log не сломается.
--   2) INSERT новых позиций (плёнки Orajet, краски CMYK, БОПП размеры из брифа,
--      хоз. товары + жидкость для чистки + безворсовые палочки).
--   3) RLS k24_materials_worker_select расширяется на роль designer (бриф:
--      «Открыть доступ к складу всем ролям»).
--   4) k24_role_permissions: view:warehouse=true для designer/printer/post_printer.
--
-- Stock_qty не трогаем (остатки реальные с инвентаризации 11.05 и последующих движений).
-- Тех. долг: FILM_TYPES enum в constants.js пока не расширен — новые плёнки
-- (Orajet, Светоотражающая, Монтажная 1.6м) не имеют material_code и не попадут
-- в FilmSelect формы заказа до отдельного R9.6.

BEGIN;

-- ===========================================================================
-- 1) UPDATE существующих плёнок: бренды + unit_cost.
--    material_code сохраняем (G/M/Transparent_G/Transparent_M/Holo/Gold/Chrome) —
--    триггер ищет по нему, не по name.
-- ===========================================================================
UPDATE k24_materials
   SET name      = 'Duckson белая 3640 (Глянцевая) 1.26 м',
       unit_cost = 130,
       min_qty   = 1,
       updated_at = now()
 WHERE material_code = 'G' AND type = 'film';

UPDATE k24_materials
   SET name      = 'Duckson белая 3640 (Матовая) 1.26 м',
       unit_cost = 130,
       min_qty   = 1,
       updated_at = now()
 WHERE material_code = 'M' AND type = 'film';

UPDATE k24_materials
   SET name      = 'Dickson прозрачная 3640 (Глянцевая) 1.26 м',
       unit_cost = 130,
       min_qty   = 1,
       updated_at = now()
 WHERE material_code = 'Transparent_G' AND type = 'film';

UPDATE k24_materials
   SET name      = 'Dickson прозрачная 3640 (Матовая) 1.26 м',
       unit_cost = 130,
       min_qty   = 1,
       updated_at = now()
 WHERE material_code = 'Transparent_M' AND type = 'film';

UPDATE k24_materials
   SET name      = 'Голография 1.22 м',
       unit_cost = 240,
       min_qty   = 1,
       updated_at = now()
 WHERE material_code = 'Holo' AND type = 'film';

UPDATE k24_materials
   SET name      = 'Oracal 352 Золото 1 м',
       unit_cost = 670,
       min_qty   = 1,
       updated_at = now()
 WHERE material_code = 'Gold' AND type = 'film';

UPDATE k24_materials
   SET name      = 'Oracal 352 Серебро 1 м',
       unit_cost = 555,
       min_qty   = 1,
       updated_at = now()
 WHERE material_code = 'Chrome' AND type = 'film';

-- ===========================================================================
-- 2) INSERT новых плёнок из брифа (без material_code — FILM_TYPES enum
--    ещё не расширен; появятся на /warehouse, но не в селекте формы заказа).
-- ===========================================================================
INSERT INTO k24_materials (type, name, unit, stock_qty, min_qty, unit_cost) VALUES
  ('film', 'Orajet 3640 белая (Глянцевая) 1.26 м',     'м', 0, 1, 235),
  ('film', 'Orajet 3640 белая (Матовая) 1.26 м',       'м', 0, 1, 235),
  ('film', 'Orajet 3640 прозрачная (Глянцевая) 1.26 м','м', 0, 1, 235),
  ('film', 'Orajet 3640 прозрачная (Матовая) 1.26 м',  'м', 0, 1, 235),
  ('film', 'Светоотражающая плёнка 0.5 м',             'м', 0, 1, 1400),
  ('film', 'Монтажная плёнка 1.6 м',                   'м', 0, 1, NULL)
ON CONFLICT (lower(name)) DO UPDATE
  SET unit_cost = COALESCE(k24_materials.unit_cost, EXCLUDED.unit_cost),
      min_qty   = EXCLUDED.min_qty,
      updated_at = now();

-- ===========================================================================
-- 3) UPDATE химии: смола / отвердитель / клей-спрей / газ — цены и пороги из брифа.
-- ===========================================================================
UPDATE k24_materials
   SET unit_cost = 2350, min_qty = 4, updated_at = now()
 WHERE name = 'Смола (1кг)' AND type = 'resin';

UPDATE k24_materials
   SET unit_cost = 2350, min_qty = 4, updated_at = now()
 WHERE name = 'Отвердитель (1кг)' AND type = 'resin';

UPDATE k24_materials
   SET unit_cost = 1300, min_qty = 2, updated_at = now()
 WHERE name = 'Клей спрей' AND type = 'resin';

UPDATE k24_materials
   SET min_qty = 2, updated_at = now()
 WHERE name = 'Газ' AND type = 'resin';

-- ===========================================================================
-- 4) Краски CMYK в литрах (новые позиции — отдельно от существующей
--    «Краска (экосольвент)» в мл, которая остаётся для legacy-логики).
--    type='ink', unit='л', 3800₽/л.
-- ===========================================================================
INSERT INTO k24_materials (type, name, unit, stock_qty, min_qty, unit_cost) VALUES
  ('ink', 'Краска (экосольвент) Cyan 1 л',    'л', 0, 1, 3800),
  ('ink', 'Краска (экосольвент) Magenta 1 л', 'л', 0, 1, 3800),
  ('ink', 'Краска (экосольвент) Yellow 1 л',  'л', 0, 1, 3800),
  ('ink', 'Краска (экосольвент) Black 1 л',   'л', 0, 1, 3800)
ON CONFLICT (lower(name)) DO UPDATE
  SET unit_cost = EXCLUDED.unit_cost,
      min_qty   = EXCLUDED.min_qty,
      updated_at = now();

-- ===========================================================================
-- 5) Жидкость для чистки принтера (новый расходник).
-- ===========================================================================
INSERT INTO k24_materials (type, name, unit, stock_qty, min_qty, unit_cost) VALUES
  ('utensils', 'Жидкость для чистки принтера', 'л', 0, 1, NULL)
ON CONFLICT (lower(name)) DO NOTHING;

-- ===========================================================================
-- 6) Упаковочные коробки: проставить unit_cost для 270:160:190.
-- ===========================================================================
UPDATE k24_materials
   SET unit_cost = 42.7, min_qty = 5, updated_at = now()
 WHERE name = 'Коробка 270:160:190 (25 шт)' AND type = 'box';

UPDATE k24_materials
   SET min_qty = 5, updated_at = now()
 WHERE name = 'Коробка 280:160:50 (50 шт)' AND type = 'box';

-- ===========================================================================
-- 7) БОПП пакеты: unit_cost и min_qty по брифу. Имена в БД уже совпадают
--    («БОПП А6 (110х150) 1000 шт» — суффикс «1000 шт» — упаковка-единица, не трогаем).
-- ===========================================================================
UPDATE k24_materials SET unit_cost = 0.55, min_qty = 500, updated_at = now()
 WHERE name = 'БОПП А6 (110х150) 1000 шт' AND type = 'packaging_bag';

UPDATE k24_materials SET unit_cost = 0.86, min_qty = 500, updated_at = now()
 WHERE name = 'БОПП А5 (160х210) 1000 шт' AND type = 'packaging_bag';

UPDATE k24_materials SET min_qty = 500, updated_at = now()
 WHERE name = 'БОПП А4 (220х300) 1000 шт' AND type = 'packaging_bag';

UPDATE k24_materials SET min_qty = 300, updated_at = now()
 WHERE type = 'packaging_bag'
   AND name LIKE 'БОПП %'
   AND name NOT IN (
     'БОПП А6 (110х150) 1000 шт',
     'БОПП А5 (160х210) 1000 шт',
     'БОПП А4 (220х300) 1000 шт'
   );

-- ===========================================================================
-- 8) Хоз. товары: переименовать на ед. число + проставить unit_cost.
-- ===========================================================================
UPDATE k24_materials
   SET unit_cost = 257, unit = 'л', min_qty = 1, updated_at = now()
 WHERE name = 'Растворитель' AND type = 'household';

UPDATE k24_materials
   SET min_qty = 8, updated_at = now()
 WHERE name = 'Бумажные полотенца' AND type = 'household';

UPDATE k24_materials
   SET min_qty = 4, updated_at = now()
 WHERE name = 'Влажные салфетки' AND type = 'household';

UPDATE k24_materials
   SET unit_cost = 260, min_qty = 2, updated_at = now()
 WHERE name = 'Скотч прозрачный' AND type = 'household';

INSERT INTO k24_materials (type, name, unit, stock_qty, min_qty, unit_cost) VALUES
  ('household', 'Стрейч плёнка 0.5 м',                          'м', 0, 1, NULL),
  ('utensils',  'Безворсовая палочка для чистки принтера',      'шт', 0, 100, 8)
ON CONFLICT (lower(name)) DO UPDATE
  SET unit_cost = COALESCE(k24_materials.unit_cost, EXCLUDED.unit_cost),
      min_qty   = EXCLUDED.min_qty,
      updated_at = now();

-- ===========================================================================
-- 9) Утварь (шприц/ватные палочки/стаканчики): unit_cost + min_qty по брифу.
-- ===========================================================================
UPDATE k24_materials
   SET unit_cost = 6.1, min_qty = 20, updated_at = now()
 WHERE name = 'Шприцы (720 шт)' AND type = 'utensils';

UPDATE k24_materials
   SET min_qty = 500, updated_at = now()
 WHERE name = 'Ватные палочки (200 шт)' AND type = 'utensils';

UPDATE k24_materials
   SET min_qty = 100, updated_at = now()
 WHERE name = 'Одноразовые стаканчики (100 шт)' AND type = 'utensils';

-- ===========================================================================
-- 10) Ножи плоттера: уже сидились в 036 (4600/5600). Обновим min_qty=2 по брифу.
-- ===========================================================================
UPDATE k24_materials
   SET min_qty = 2, updated_at = now()
 WHERE type = 'blade';

-- ===========================================================================
-- 11) RLS: расширить SELECT на k24_materials для designer.
--     Бриф: «Открыть доступ к складу всем ролям».
-- ===========================================================================
DROP POLICY IF EXISTS k24_materials_worker_select ON k24_materials;
CREATE POLICY k24_materials_worker_select ON k24_materials FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM k24_profiles
     WHERE id = auth.uid()
       AND role IN ('admin', 'manager', 'designer', 'printer', 'post_printer')
  ));

-- ===========================================================================
-- 12) Default permission view:warehouse для production-ролей.
--     Админ всё ещё может выключить через /settings → Права ролей.
-- ===========================================================================
INSERT INTO k24_role_permissions (role, permission, allowed) VALUES
  ('designer',     'view:warehouse', true),
  ('printer',      'view:warehouse', true),
  ('post_printer', 'view:warehouse', true)
ON CONFLICT (role, permission) DO UPDATE SET allowed = EXCLUDED.allowed;

COMMIT;
