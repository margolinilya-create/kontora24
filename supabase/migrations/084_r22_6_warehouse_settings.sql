-- ============================================================
-- R22.6 (ТЗ 20.07.2026, Фаза 7) — настройки склада: категории + статусы
-- ============================================================
-- Новые справочники: категории материалов и складские статусы
-- (В наличии / Заказано / Ожидает поставки). CRUD из /settings → «Настройки
-- склада». k24_materials получают опциональные FK на них.
--
-- Rollback: DROP колонок k24_materials; DROP таблиц.

CREATE TABLE IF NOT EXISTS k24_warehouse_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS k24_warehouse_statuses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  color      TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Сид складских статусов из ТЗ.
INSERT INTO k24_warehouse_statuses (name, color, sort_order) VALUES
  ('В наличии',        '#22c55e', 0),
  ('Заказано',         '#eab308', 1),
  ('Ожидает поставки', '#f97316', 2)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE k24_materials
  ADD COLUMN IF NOT EXISTS category_id  UUID REFERENCES k24_warehouse_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wh_status_id UUID REFERENCES k24_warehouse_statuses(id)  ON DELETE SET NULL;

-- RLS: чтение всем authenticated, мутации — admin/manager.
ALTER TABLE k24_warehouse_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE k24_warehouse_statuses   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wh_cat_select ON k24_warehouse_categories;
CREATE POLICY wh_cat_select ON k24_warehouse_categories FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS wh_cat_write ON k24_warehouse_categories;
CREATE POLICY wh_cat_write ON k24_warehouse_categories FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM k24_profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM k24_profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','manager')));

DROP POLICY IF EXISTS wh_status_select ON k24_warehouse_statuses;
CREATE POLICY wh_status_select ON k24_warehouse_statuses FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS wh_status_write ON k24_warehouse_statuses;
CREATE POLICY wh_status_write ON k24_warehouse_statuses FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM k24_profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM k24_profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','manager')));

-- Гранты (075 отозвал у anon; выдаём authenticated явно).
REVOKE ALL ON k24_warehouse_categories FROM anon;
REVOKE ALL ON k24_warehouse_statuses   FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON k24_warehouse_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON k24_warehouse_statuses   TO authenticated;

-- Нефинансовые колонки k24_orders не трогаем; для k24_materials новые
-- колонки читаются authenticated (у таблицы уже полный грант).
