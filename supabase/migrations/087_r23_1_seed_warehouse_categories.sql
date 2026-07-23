-- ============================================================
-- R23.1 (ТЗ 23.07.2026, Фаза 7) — сид категорий склада + backfill
-- ============================================================
-- Засеиваем 9 фиксированных категорий (из MATERIAL_CATEGORIES в constants.js)
-- и проставляем category_id всем существующим материалам по их type/имени
-- (та же логика, что getMaterialCategory). Данные не теряем — только ADD FK.
--
-- Rollback: DELETE FROM k24_warehouse_categories WHERE name IN (...);
--           UPDATE k24_materials SET category_id = NULL;

-- 1. Сид 9 категорий (порядок = как в UI).
INSERT INTO k24_warehouse_categories (name, sort_order) VALUES
  ('Плёнка для печати',            0),
  ('Плёнка для ламинации',         1),
  ('Химические вещества',          2),
  ('Утварь',                       3),
  ('Ножи для плоттера',            4),
  ('Упаковка (коробки)',           5),
  ('БОПП пакеты ширина >100 мм',   6),
  ('БОПП пакеты ширина ≤100 мм',   7),
  ('Хоз. товары',                  8)
ON CONFLICT (name) DO NOTHING;

-- 2. Backfill category_id по type (+ ширина для БОПП). Только там, где ещё NULL.
WITH cat AS (
  SELECT name, id FROM k24_warehouse_categories
),
mapped AS (
  SELECT m.id AS material_id,
    CASE
      WHEN m.type = 'film'      THEN 'Плёнка для печати'
      WHEN m.type = 'lam_film'  THEN 'Плёнка для ламинации'
      WHEN m.type IN ('resin','ink') THEN 'Химические вещества'
      WHEN m.type = 'blade'     THEN 'Ножи для плоттера'
      WHEN m.type = 'box'       THEN 'Упаковка (коробки)'
      WHEN m.type = 'utensils'  THEN 'Утварь'
      WHEN m.type = 'household' THEN 'Хоз. товары'
      WHEN m.type = 'packaging_bag' THEN
        CASE
          WHEN COALESCE(NULLIF(substring(m.name FROM '(\d+)\s*[xхX×]'), '')::int, 0) > 100
            THEN 'БОПП пакеты ширина >100 мм'
          ELSE 'БОПП пакеты ширина ≤100 мм'
        END
      ELSE 'Утварь'
    END AS cat_name
  FROM k24_materials m
  WHERE m.category_id IS NULL
)
UPDATE k24_materials m
  SET category_id = cat.id
  FROM mapped, cat
  WHERE m.id = mapped.material_id AND cat.name = mapped.cat_name;
