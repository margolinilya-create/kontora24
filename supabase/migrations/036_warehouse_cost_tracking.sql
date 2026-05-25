-- 036_warehouse_cost_tracking — R8 (серия 25.05)
--
-- 1. Переименовать k24_materials.price_per_unit → unit_cost (один источник).
-- 2. На k24_material_transactions добавить total_cost (что ввёл пользователь
--    при приходе) и unit_cost (снимок total_cost/delta на момент прихода).
-- 3. Триггер recalc_material_wac пересчитывает weighted-average себестоимости
--    единицы при каждом приходе (delta>0 AND total_cost IS NOT NULL).
--    Списания и инвентаризации unit_cost не двигают.
-- 4. Новый type='blade' для категории «Ножи для плоттера» + сид двух позиций.
-- 5. RLS: расширить update_stock + material:manage на designer/post_printer.
-- 6. Permission material:manage для всех production-ролей.

BEGIN;

-- ===========================================================================
-- 1. Rename price_per_unit → unit_cost (на k24_materials)
--    Внимание: orders.price_per_unit (цена за штуку готового изделия) — это
--    другое поле, его НЕ трогаем.
-- ===========================================================================
ALTER TABLE k24_materials RENAME COLUMN price_per_unit TO unit_cost;
COMMENT ON COLUMN k24_materials.unit_cost IS
  'Средневзвешенная себестоимость 1 ед. (WAC). Обновляется триггером recalc_material_wac при приходах.';

-- ===========================================================================
-- 2. total_cost + unit_cost на транзакциях
-- ===========================================================================
ALTER TABLE k24_material_transactions
  ADD COLUMN IF NOT EXISTS total_cost NUMERIC,
  ADD COLUMN IF NOT EXISTS unit_cost  NUMERIC;
COMMENT ON COLUMN k24_material_transactions.total_cost IS
  'Стоимость всех поступивших единиц (₽). Заполняется только на приходах.';
COMMENT ON COLUMN k24_material_transactions.unit_cost IS
  'Снимок total_cost/delta на момент прихода (для аудита и пересчёта WAC).';

-- ===========================================================================
-- 3. WAC trigger. BEFORE INSERT — stock_qty ещё «старый» (update_stock RPC
--    вызывается ПОСЛЕ INSERT в клиенте useMaterials.addMaterialTransaction),
--    поэтому формула (old_qty*old_cost + total_cost) / (old_qty + delta)
--    корректна. Это инвариант — не менять порядок без переписки клиента.
-- ===========================================================================
CREATE OR REPLACE FUNCTION recalc_material_wac()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_qty   NUMERIC;
  v_old_cost  NUMERIC;
  v_new_qty   NUMERIC;
  v_new_avg   NUMERIC;
BEGIN
  IF NEW.delta IS NULL OR NEW.delta <= 0 OR NEW.total_cost IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT stock_qty, COALESCE(unit_cost, 0)
    INTO v_old_qty, v_old_cost
  FROM k24_materials
  WHERE id = NEW.material_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_new_qty := COALESCE(v_old_qty, 0) + NEW.delta;
  IF v_new_qty > 0 THEN
    v_new_avg := (COALESCE(v_old_qty, 0) * v_old_cost + NEW.total_cost) / v_new_qty;
  ELSE
    v_new_avg := NEW.total_cost / NULLIF(NEW.delta, 0);
  END IF;

  NEW.unit_cost := NEW.total_cost / NEW.delta;

  UPDATE k24_materials
     SET unit_cost = v_new_avg,
         updated_at = now()
   WHERE id = NEW.material_id;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_recalc_material_wac ON k24_material_transactions;
CREATE TRIGGER trg_recalc_material_wac
  BEFORE INSERT ON k24_material_transactions
  FOR EACH ROW EXECUTE FUNCTION recalc_material_wac();

-- ===========================================================================
-- 4. Категория «Ножи для плоттера» (новый type='blade').
-- ===========================================================================
INSERT INTO k24_materials (type, name, unit, stock_qty, min_qty, unit_cost) VALUES
  ('blade', 'Нож для Summa S1 D120',  'шт', 0, 1, 4600),
  ('blade', 'Нож для Summa S3 TC160', 'шт', 0, 1, 5600)
ON CONFLICT (lower(name)) DO NOTHING;

-- ===========================================================================
-- 5. RLS: расширить update_stock на все production-роли.
--    Бриф 25.05: «Возможность вносить приходы и расходы есть у всех ролей».
-- ===========================================================================
CREATE OR REPLACE FUNCTION update_stock(p_material_id uuid, p_delta numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM k24_profiles
     WHERE id = auth.uid()
       AND role IN ('admin','manager','designer','printer','post_printer')
  ) THEN
    RAISE EXCEPTION 'Access denied: insufficient role for stock update';
  END IF;

  UPDATE k24_materials
     SET stock_qty = stock_qty + p_delta,
         updated_at = now()
   WHERE id = p_material_id;
END
$$;

-- ===========================================================================
-- 6. Permission material:manage для всех production-ролей.
--    Создание новых материалов остаётся за admin/manager (guard в UI),
--    приходы/расходы — у всех. RLS на INSERT k24_material_transactions
--    уже допускает WITH CHECK (created_by = auth.uid()).
-- ===========================================================================
INSERT INTO k24_role_permissions (role, permission, allowed) VALUES
  ('designer',     'material:manage', true),
  ('printer',      'material:manage', true),
  ('post_printer', 'material:manage', true)
ON CONFLICT (role, permission) DO UPDATE SET allowed = EXCLUDED.allowed;

COMMIT;
