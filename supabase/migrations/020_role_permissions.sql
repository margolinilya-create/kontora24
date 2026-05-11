-- 020: Editable role permissions (L2 RBAC)
-- Админ через UI настраивает что может делать каждая роль.
-- 5 ролей остаются фиксированными (CHECK-constraint не трогаем).
-- RLS-политики БД продолжают хардкодить admin/manager — это L3.

CREATE TABLE IF NOT EXISTS k24_role_permissions (
  role TEXT NOT NULL,
  permission TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  PRIMARY KEY (role, permission)
);

COMMENT ON TABLE k24_role_permissions IS 'Динамические разрешения для ролей. Загружается в zustand на стороне клиента. Менять через UI /settings.';

ALTER TABLE k24_role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rp_select_authenticated" ON k24_role_permissions;
CREATE POLICY "rp_select_authenticated" ON k24_role_permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "rp_write_admin" ON k24_role_permissions;
CREATE POLICY "rp_write_admin" ON k24_role_permissions
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Сид: текущие значения из ROLE_STAGE_PERMISSIONS, NAV_ITEMS, canSeeFinance
INSERT INTO k24_role_permissions (role, permission, allowed) VALUES
  -- === Этапы (продвижение) ===
  ('admin', 'stage:design', true),       ('admin', 'stage:prepress', true),
  ('admin', 'stage:print', true),        ('admin', 'stage:lamination', true),
  ('admin', 'stage:cutting', true),      ('admin', 'stage:pouring', true),
  ('admin', 'stage:selection_pouring', true), ('admin', 'stage:assembly_3d', true),
  ('admin', 'stage:packaging', true),    ('admin', 'stage:otk', true),

  ('manager', 'stage:design', true),     ('manager', 'stage:prepress', true),
  ('manager', 'stage:print', true),      ('manager', 'stage:lamination', true),
  ('manager', 'stage:cutting', true),    ('manager', 'stage:pouring', true),
  ('manager', 'stage:selection_pouring', true), ('manager', 'stage:assembly_3d', true),
  ('manager', 'stage:packaging', true),  ('manager', 'stage:otk', true),

  ('designer', 'stage:design', true),    ('designer', 'stage:prepress', true),

  ('printer', 'stage:prepress', true),   ('printer', 'stage:print', true),
  ('printer', 'stage:lamination', true), ('printer', 'stage:cutting', true),
  ('printer', 'stage:pouring', true),    ('printer', 'stage:selection_pouring', true),
  ('printer', 'stage:assembly_3d', true),('printer', 'stage:packaging', true),

  ('post_printer', 'stage:print', true), ('post_printer', 'stage:lamination', true),
  ('post_printer', 'stage:cutting', true),('post_printer', 'stage:pouring', true),
  ('post_printer', 'stage:selection_pouring', true),
  ('post_printer', 'stage:assembly_3d', true), ('post_printer', 'stage:packaging', true),

  -- === Видимость разделов ===
  ('admin', 'view:dashboard', true),     ('manager', 'view:dashboard', true),
  ('admin', 'view:analytics', true),     ('manager', 'view:analytics', true),
  ('admin', 'view:finance', true),       ('manager', 'view:finance', true),
  ('admin', 'view:warehouse', true),     ('manager', 'view:warehouse', true),
  ('admin', 'view:clients', true),       ('manager', 'view:clients', true),
  ('admin', 'view:reports', true),
  ('admin', 'view:settings', true),

  -- === Действия ===
  ('admin', 'order:create', true),       ('manager', 'order:create', true),
  ('admin', 'order:edit', true),         ('manager', 'order:edit', true),
  ('admin', 'order:cancel', true),       ('manager', 'order:cancel', true),
  ('admin', 'material:manage', true),    ('manager', 'material:manage', true),
  ('admin', 'user:manage', true)
ON CONFLICT (role, permission) DO NOTHING;
