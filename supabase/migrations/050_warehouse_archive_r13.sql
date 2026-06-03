-- 050_warehouse_archive_r13 — R13.1 серии 02.06
--
-- Бриф менеджера 02.06 (правки на /warehouse):
--   1. Менеджер может архивировать/разархивировать позиции
--   2. Менеджер может полностью удалить позицию (если нет связанных транзакций)
--   3. Менеджер может редактировать позицию полностью (name, type, unit)
--   4. Архивные позиции не участвуют в работе (фильтр на фронте)
--
-- Архивация — мягкое удаление: archived_at IS NOT NULL означает что позиция
-- скрыта из основных списков, но все исторические транзакции и unit_cost
-- сохраняются. Разархивация = UPDATE archived_at=NULL.
--
-- Hard delete (DELETE FROM k24_materials) — только если нет связанных
-- транзакций. Эту проверку делает фронтенд через COUNT перед DELETE.

BEGIN;

-- ===========================================================================
-- 1. archived_at колонка + partial index для быстрого выбора активных
-- ===========================================================================

ALTER TABLE k24_materials
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

-- partial index — основной запрос фронта это `WHERE archived_at IS NULL`,
-- остальные 5-10% запросов (показать архив) могут идти по seq scan.
CREATE INDEX IF NOT EXISTS idx_k24_materials_active
  ON k24_materials (id) WHERE archived_at IS NULL;

-- ===========================================================================
-- 2. Новые права material:archive + material:delete
-- ===========================================================================

INSERT INTO k24_role_permissions (role, permission, allowed) VALUES
  ('admin',        'material:archive', true),
  ('manager',      'material:archive', true),
  ('designer',     'material:archive', false),
  ('printer',      'material:archive', false),
  ('post_printer', 'material:archive', false),
  ('admin',        'material:delete',  true),
  ('manager',      'material:delete',  true),
  ('designer',     'material:delete',  false),
  ('printer',      'material:delete',  false),
  ('post_printer', 'material:delete',  false)
ON CONFLICT (role, permission) DO NOTHING;

-- ===========================================================================
-- 3. RLS UPDATE для архивации/редактирования полей менеджером.
--
-- Существующая materials_update_name даёт UPDATE только по name. Новая
-- materials_update_archive разрешает менеджеру (с material:archive) править
-- любые поля — это нужно для смены type/unit/archived_at через MaterialEditModal.
-- Колонок мало, риск воркера-злоумышленника низкий (только manager).
-- ===========================================================================

DROP POLICY IF EXISTS k24_materials_update_archive ON k24_materials;
CREATE POLICY k24_materials_update_archive ON k24_materials FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM k24_profiles p
    JOIN k24_role_permissions rp ON rp.role = p.role
    WHERE p.id = auth.uid()
      AND rp.permission = 'material:archive'
      AND rp.allowed = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM k24_profiles p
    JOIN k24_role_permissions rp ON rp.role = p.role
    WHERE p.id = auth.uid()
      AND rp.permission = 'material:archive'
      AND rp.allowed = true
  ));

-- ===========================================================================
-- 4. RLS DELETE для удаления позиции (hard delete) — только material:delete
-- ===========================================================================

DROP POLICY IF EXISTS k24_materials_delete ON k24_materials;
CREATE POLICY k24_materials_delete ON k24_materials FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM k24_profiles p
    JOIN k24_role_permissions rp ON rp.role = p.role
    WHERE p.id = auth.uid()
      AND rp.permission = 'material:delete'
      AND rp.allowed = true
  ));

COMMIT;
