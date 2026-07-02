-- Migration 063: R18.2 — прозрачные плёнки доступны для печати
--
-- Бриф 30.06: «При оформлении заказа невозможно выбрать для печати прозрачную
-- плёнку. Нужно добавить в выпадающий список позиции со склада: Dickson
-- прозрачная (Матовая) 1.26 м, Oraguart прозрачная (Глянцевая) 1.55 м,
-- Orajet 3640 прозрачная (Матовая) 1.52 м».
--
-- FilmSelect скрывает архивные позиции (WHERE archived_at IS NULL) и — в форме
-- создания заказа (после R18.2) — показывает нулевой остаток. Поэтому:
--   1) разархивируем Dickson прозрачную (Матовую) — была в архиве;
--   2) заводим Oraguart прозрачную (Глянцевую) 1.55 м — её не было в номенклатуре;
--   3) Orajet 3640 прозрачная (Матовая) уже активна — появится сама после
--      передачи includeOutOfStock в CreateOrderPage (код R18.2).
-- Остаток менеджер оприходует через /warehouse при первом приходе.

BEGIN;

-- 1) Разархивировать Dickson прозрачную матовую (была отправлена в архив 03.06).
UPDATE k24_materials
   SET archived_at = NULL
 WHERE type = 'film'
   AND archived_at IS NOT NULL
   AND name ILIKE '%dickson%прозрачн%'
   AND name ILIKE '%матов%';

-- 2) Oraguart прозрачная глянцевая 1.55 м — должна быть плёнкой для ПЕЧАТИ.
--    На проде уже была заведена как lam_film (ламинация) без использования —
--    переводим в type='film' (Transparent_G), если позиция не задействована.
UPDATE k24_materials m
   SET type = 'film', material_code = COALESCE(material_code, 'Transparent_G')
 WHERE lower(m.name) = lower('Oraguart прозрачная (Глянцевая) 1.55 м')
   AND m.type <> 'film'
   AND NOT EXISTS (SELECT 1 FROM k24_material_transactions t WHERE t.material_id = m.id)
   AND NOT EXISTS (SELECT 1 FROM k24_orders o WHERE o.lam_material_id = m.id);

-- Если позиции нет вовсе — создаём как плёнку для печати.
INSERT INTO k24_materials (type, name, unit, stock_qty, min_qty, material_code)
SELECT 'film', 'Oraguart прозрачная (Глянцевая) 1.55 м', 'м', 0, 0, 'Transparent_G'
WHERE NOT EXISTS (
  SELECT 1 FROM k24_materials
   WHERE lower(name) = lower('Oraguart прозрачная (Глянцевая) 1.55 м') AND type = 'film'
);

COMMIT;
