-- R17.0: update_stock RPC — фикс RBAC.
-- Бриф 5.06 #Настройки: «галка «Вносить приход/расход на складе» стоит, но
-- у сотрудников всплывает «нет прав»». Корневая причина — миграция
-- 20260503_security_hardening хардкодит в update_stock роли
-- `IN ('admin', 'manager', 'printer', 'assembler', 'resin_pourer')`. Роли
-- `assembler`/`resin_pourer` — устаревшие (отсутствуют в k24_profiles), а
-- `designer` и `post_printer` отсутствуют в списке → они падают с «Access
-- denied» при попытке внести приход/расход.
--
-- Решение: проверять не статический список ролей, а право
-- `material:add_transaction` через L2 RBAC (k24_role_permissions). Любая
-- роль с allowed=true может внести транзакцию. Конкретные галки управляются
-- через /settings → Права ролей.

BEGIN;

-- Право material:add_transaction для всех production-ролей по умолчанию.
-- Менеджер может выключить через UI индивидуально.
INSERT INTO k24_role_permissions (role, permission, allowed) VALUES
  ('admin',        'material:add_transaction', true),
  ('manager',      'material:add_transaction', true),
  ('designer',     'material:add_transaction', true),
  ('printer',      'material:add_transaction', true),
  ('post_printer', 'material:add_transaction', true)
ON CONFLICT (role, permission) DO UPDATE SET allowed = EXCLUDED.allowed;

-- update_stock: проверка через L2 RBAC вместо хардкода ролей.
CREATE OR REPLACE FUNCTION update_stock(p_material_id uuid, p_delta numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_allowed BOOLEAN;
BEGIN
  -- Берём роль вызывающего из k24_profiles
  SELECT role INTO v_role FROM k24_profiles WHERE id = auth.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Access denied: profile not found';
  END IF;

  -- Проверяем динамическое право через k24_role_permissions
  SELECT allowed INTO v_allowed
    FROM k24_role_permissions
    WHERE role = v_role AND permission = 'material:add_transaction';

  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'Access denied: no material:add_transaction permission for role %', v_role;
  END IF;

  -- Validate input
  IF p_material_id IS NULL THEN
    RAISE EXCEPTION 'material_id is required';
  END IF;

  -- Atomic stock update
  UPDATE k24_materials
    SET stock_qty = stock_qty + p_delta
    WHERE id = p_material_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material not found: %', p_material_id;
  END IF;
END
$$;

REVOKE ALL ON FUNCTION update_stock(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_stock(uuid, numeric) TO authenticated;

COMMIT;
