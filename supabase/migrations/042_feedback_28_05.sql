-- 042_feedback_28_05 — R10 серии 25.05
--
-- Бриф менеджера 28.05 (5 правок одним PR):
--   1. (frontend) — убрать «Хорошо залитых» из формы Заливки.
--   2. Заливка по видам для sticker3D с design_variants > 1 — через
--      существующий механизм k24_pack_designs + PackDesignsForm.
--   3. (frontend) — sticker3D всегда требует упаковки.
--   4. Новое право material:edit_name + RLS UPDATE на k24_materials.
--   5. Фикс регрессии k24_order_subtasks: миграция 040 заменила полный
--      UNIQUE (order_id, track) на partial unique index, но триггер
--      fn_create_3dpack_subtasks использовал ON CONFLICT (order_id, track)
--      без предиката → подзадачи не создавались для stickerpack3D, созданных
--      после 26.05. Бэкфилл для уже существующих заказов.

BEGIN;

-- ===========================================================================
-- 1. Расширить create_pack_designs_for_order на sticker3D + design_variants>1
-- ===========================================================================

CREATE OR REPLACE FUNCTION create_pack_designs_for_order()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE i INT; v_count INT; v_qty_per INT;
BEGIN
  IF NEW.order_type IN ('stickerpack', 'stickerpack3D')
     AND NEW.stickers_per_pack IS NOT NULL
     AND NEW.stickers_per_pack > 0 THEN
    v_count := NEW.stickers_per_pack;
    v_qty_per := COALESCE(NEW.qty, 0);
    FOR i IN 1..v_count LOOP
      INSERT INTO k24_pack_designs (order_id, design_index, qty_target)
      VALUES (NEW.id, i, v_qty_per)
      ON CONFLICT (order_id, design_index) DO NOTHING;
    END LOOP;
  ELSIF NEW.order_type = 'sticker3D'
     AND COALESCE(NEW.design_variants, 1) > 1 THEN
    v_count := NEW.design_variants;
    -- qty_target = qty / variants, округляя вверх чтобы сумма ≥ qty
    v_qty_per := CEIL(COALESCE(NEW.qty, 0)::NUMERIC / v_count)::INT;
    FOR i IN 1..v_count LOOP
      INSERT INTO k24_pack_designs (order_id, design_index, qty_target)
      VALUES (NEW.id, i, v_qty_per)
      ON CONFLICT (order_id, design_index) DO NOTHING;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

-- sync на UPDATE: расширяем тоже на sticker3D
CREATE OR REPLACE FUNCTION sync_pack_designs_on_order_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE i INT; v_old_count INT; v_new_count INT; v_qty_per INT;
BEGIN
  IF NEW.order_type IN ('stickerpack', 'stickerpack3D') THEN
    v_old_count := COALESCE(OLD.stickers_per_pack, 0);
    v_new_count := COALESCE(NEW.stickers_per_pack, 0);
    IF NEW.qty IS DISTINCT FROM OLD.qty THEN
      UPDATE k24_pack_designs SET qty_target = COALESCE(NEW.qty, 0)
        WHERE order_id = NEW.id;
    END IF;
  ELSIF NEW.order_type = 'sticker3D' THEN
    v_old_count := CASE WHEN COALESCE(OLD.design_variants, 1) > 1
                        THEN OLD.design_variants ELSE 0 END;
    v_new_count := CASE WHEN COALESCE(NEW.design_variants, 1) > 1
                        THEN NEW.design_variants ELSE 0 END;
    IF NEW.qty IS DISTINCT FROM OLD.qty OR v_new_count <> v_old_count THEN
      v_qty_per := CASE WHEN v_new_count > 0
                        THEN CEIL(COALESCE(NEW.qty, 0)::NUMERIC / v_new_count)::INT
                        ELSE 0 END;
      UPDATE k24_pack_designs SET qty_target = v_qty_per
        WHERE order_id = NEW.id;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  -- Добавить новые виды если число увеличилось
  IF v_new_count > v_old_count THEN
    v_qty_per := CASE
      WHEN NEW.order_type IN ('stickerpack','stickerpack3D') THEN COALESCE(NEW.qty, 0)
      ELSE CEIL(COALESCE(NEW.qty, 0)::NUMERIC / v_new_count)::INT
    END;
    FOR i IN (v_old_count + 1)..v_new_count LOOP
      INSERT INTO k24_pack_designs (order_id, design_index, qty_target)
      VALUES (NEW.id, i, v_qty_per)
      ON CONFLICT (order_id, design_index) DO NOTHING;
    END LOOP;
  END IF;
  -- Удалить лишние при уменьшении
  IF v_new_count < v_old_count THEN
    DELETE FROM k24_pack_designs
     WHERE order_id = NEW.id AND design_index > v_new_count;
  END IF;

  RETURN NEW;
END;
$$;

-- Триггер уже навешан в 010 — на UPDATE OF qty, stickers_per_pack.
-- Расширим на design_variants чтобы sync срабатывал и при его изменении.
DROP TRIGGER IF EXISTS trg_sync_pack_designs ON k24_orders;
CREATE TRIGGER trg_sync_pack_designs
AFTER UPDATE OF qty, stickers_per_pack, design_variants ON k24_orders
FOR EACH ROW EXECUTE FUNCTION sync_pack_designs_on_order_update();

-- Backfill для существующих sticker3D с design_variants > 1
INSERT INTO k24_pack_designs (order_id, design_index, qty_target)
SELECT o.id, i.idx,
       CEIL(COALESCE(o.qty, 0)::NUMERIC / o.design_variants)::INT
  FROM k24_orders o
  CROSS JOIN LATERAL generate_series(1, o.design_variants) AS i(idx)
 WHERE o.order_type = 'sticker3D'
   AND COALESCE(o.design_variants, 1) > 1
   AND NOT EXISTS (
     SELECT 1 FROM k24_pack_designs pd
      WHERE pd.order_id = o.id AND pd.design_index = i.idx
   );

-- ===========================================================================
-- 2. material:edit_name — новое право + RLS UPDATE на k24_materials
-- ===========================================================================

INSERT INTO k24_role_permissions (role, permission, allowed) VALUES
  ('admin',        'material:edit_name', true),
  ('manager',      'material:edit_name', true),
  ('designer',     'material:edit_name', false),
  ('printer',      'material:edit_name', false),
  ('post_printer', 'material:edit_name', false)
ON CONFLICT (role, permission) DO NOTHING;

DROP POLICY IF EXISTS k24_materials_update_name ON k24_materials;
CREATE POLICY k24_materials_update_name ON k24_materials FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM k24_profiles p
    JOIN k24_role_permissions rp ON rp.role = p.role
    WHERE p.id = auth.uid()
      AND rp.permission = 'material:edit_name'
      AND rp.allowed = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM k24_profiles p
    JOIN k24_role_permissions rp ON rp.role = p.role
    WHERE p.id = auth.uid()
      AND rp.permission = 'material:edit_name'
      AND rp.allowed = true
  ));

-- ===========================================================================
-- 3. Регрессия subtask: фикс ON CONFLICT с предикатом + бэкфилл
-- ===========================================================================

CREATE OR REPLACE FUNCTION fn_create_3dpack_subtasks() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.order_type = 'stickerpack3D' THEN
    INSERT INTO k24_order_subtasks (order_id, track, status)
    VALUES (NEW.id, 'backgrounds', 'pending'), (NEW.id, 'stickers', 'pending')
    ON CONFLICT (order_id, track)
      WHERE track IN ('backgrounds','stickers')
      DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Бэкфилл всех stickerpack3D у которых нет подзадач backgrounds/stickers.
-- Маппинг order.status → subtask.status тот же что в миграции 032.
INSERT INTO k24_order_subtasks (order_id, track, status, completed_at)
SELECT o.id, 'backgrounds',
  CASE o.status
    WHEN 'new'                THEN 'pending'
    WHEN 'design'             THEN 'pending'
    WHEN 'prepress'           THEN 'pending'
    WHEN 'print'              THEN 'printing'
    WHEN 'lamination'         THEN 'laminating'
    WHEN 'cutting'            THEN 'cutting'
    WHEN 'selection_pouring'  THEN 'selecting'
    WHEN 'assembly_3d'        THEN 'ready'
    WHEN 'packaging'          THEN 'ready'
    WHEN 'otk'                THEN 'ready'
    WHEN 'done'               THEN 'ready'
    WHEN 'cancelled'          THEN 'cancelled'
    ELSE 'pending'
  END,
  CASE WHEN o.status IN ('assembly_3d','packaging','otk','done') THEN NOW() ELSE NULL END
FROM k24_orders o
WHERE o.order_type = 'stickerpack3D'
  AND NOT EXISTS (
    SELECT 1 FROM k24_order_subtasks st
     WHERE st.order_id = o.id AND st.track = 'backgrounds'
  );

INSERT INTO k24_order_subtasks (order_id, track, status, completed_at)
SELECT o.id, 'stickers',
  CASE o.status
    WHEN 'new'                THEN 'pending'
    WHEN 'design'             THEN 'pending'
    WHEN 'prepress'           THEN 'pending'
    WHEN 'print'              THEN 'printing'
    WHEN 'lamination'         THEN 'cutting'  -- стикеры пропускают ламинацию
    WHEN 'cutting'            THEN 'cutting'
    WHEN 'selection_pouring'  THEN 'pouring'
    WHEN 'assembly_3d'        THEN 'ready'
    WHEN 'packaging'          THEN 'ready'
    WHEN 'otk'                THEN 'ready'
    WHEN 'done'               THEN 'ready'
    WHEN 'cancelled'          THEN 'cancelled'
    ELSE 'pending'
  END,
  CASE WHEN o.status IN ('assembly_3d','packaging','otk','done') THEN NOW() ELSE NULL END
FROM k24_orders o
WHERE o.order_type = 'stickerpack3D'
  AND NOT EXISTS (
    SELECT 1 FROM k24_order_subtasks st
     WHERE st.order_id = o.id AND st.track = 'stickers'
  );

COMMIT;
