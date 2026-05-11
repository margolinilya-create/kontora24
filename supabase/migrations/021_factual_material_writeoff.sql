-- Migration 021: списание материалов по фактическим цифрам из production logs
--
-- Что меняем:
-- 1. auto_deduct_materials упрощаем — оставляем только краску (на этапе print по нормативу).
--    Плёнка / ламинация / смола больше не считаются по нормативу — списываются по факту из логов.
-- 2. Новый trigger deduct_materials_from_log на k24_production_logs:
--    при insert/update/soft-delete пишет дельту в k24_material_transactions
--    и пересчитывает k24_materials.stock_qty.
-- 3. Чистим артефакты старой системы по заказу #1 — снимаем «Резерв под заказ» по плёнке/ink/смоле
--    и «Авто: печать заказа» по плёнке, возвращая остаток в исходное состояние.
--    Краску -155.4 оставляем как есть (она теперь и есть наш норматив auto_deduct).
-- 4. reserve_materials / release_materials / consume_reservations остаются в БД как noop
--    (на случай если их кто-то вызывает) — JS перестаёт их дёргать.

-- ---------------------------------------------------------------------------
-- 1. Упрощённый auto_deduct_materials: только краска
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auto_deduct_materials(p_order_id UUID, p_changed_by UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order RECORD;
  v_ink_id UUID;
  v_ink_ml NUMERIC;
BEGIN
  SELECT width_mm, height_mm, qty INTO v_order
  FROM k24_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- 50 мл краски на 1 м² площади стикеров
  v_ink_ml := (v_order.qty * v_order.width_mm * v_order.height_mm)::NUMERIC / 1000000.0 * 50;

  SELECT id INTO v_ink_id FROM k24_materials WHERE type = 'ink' ORDER BY name LIMIT 1;

  IF v_ink_id IS NOT NULL AND v_ink_ml > 0 THEN
    INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by)
    VALUES (v_ink_id, p_order_id, -v_ink_ml, 'Авто: печать заказа (краска)', p_changed_by);
    UPDATE k24_materials SET stock_qty = stock_qty - v_ink_ml, updated_at = now() WHERE id = v_ink_id;
  END IF;
END;
$$;

ALTER FUNCTION public.auto_deduct_materials(uuid, uuid) SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 2. Trigger: списание материалов по факту из k24_production_logs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION deduct_materials_from_log()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_material_id UUID;
  v_order_id UUID := COALESCE(NEW.order_id, OLD.order_id);
  v_user UUID := COALESCE(NEW.worker_id, OLD.worker_id);
  v_old_active BOOLEAN := (TG_OP IN ('UPDATE','DELETE')) AND (OLD.deleted_at IS NULL);
  v_new_active BOOLEAN := (TG_OP IN ('INSERT','UPDATE')) AND (NEW.deleted_at IS NULL);
  v_old_film NUMERIC := CASE WHEN v_old_active THEN COALESCE(OLD.film_meters, 0) ELSE 0 END;
  v_new_film NUMERIC := CASE WHEN v_new_active THEN COALESCE(NEW.film_meters, 0) ELSE 0 END;
  v_old_lam NUMERIC := CASE WHEN v_old_active THEN COALESCE(OLD.lamination_meters, 0) ELSE 0 END;
  v_new_lam NUMERIC := CASE WHEN v_new_active THEN COALESCE(NEW.lamination_meters, 0) ELSE 0 END;
  v_old_resin NUMERIC := CASE WHEN v_old_active THEN COALESCE(OLD.resin_grams, 0) ELSE 0 END;
  v_new_resin NUMERIC := CASE WHEN v_new_active THEN COALESCE(NEW.resin_grams, 0) ELSE 0 END;
  v_delta NUMERIC;
BEGIN
  -- Плёнка
  v_delta := v_new_film - v_old_film;
  IF v_delta <> 0 THEN
    SELECT id INTO v_material_id FROM k24_materials WHERE type = 'film' ORDER BY name LIMIT 1;
    IF v_material_id IS NOT NULL THEN
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by)
      VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: плёнка', v_user);
      UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_material_id;
    END IF;
  END IF;

  -- Ламинация
  v_delta := v_new_lam - v_old_lam;
  IF v_delta <> 0 THEN
    SELECT id INTO v_material_id FROM k24_materials WHERE type = 'lam_film' ORDER BY name LIMIT 1;
    IF v_material_id IS NOT NULL THEN
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by)
      VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: ламинация', v_user);
      UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_material_id;
    END IF;
  END IF;

  -- Эпоксидная смола (граммы)
  v_delta := v_new_resin - v_old_resin;
  IF v_delta <> 0 THEN
    SELECT id INTO v_material_id FROM k24_materials WHERE type = 'resin' AND unit = 'g' ORDER BY name LIMIT 1;
    IF v_material_id IS NOT NULL THEN
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by)
      VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: смола', v_user);
      UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_material_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

ALTER FUNCTION public.deduct_materials_from_log() SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.deduct_materials_from_log() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_deduct_materials_from_log_iu ON k24_production_logs;
CREATE TRIGGER trg_deduct_materials_from_log_iu
AFTER INSERT OR UPDATE ON k24_production_logs
FOR EACH ROW EXECUTE FUNCTION deduct_materials_from_log();

DROP TRIGGER IF EXISTS trg_deduct_materials_from_log_d ON k24_production_logs;
CREATE TRIGGER trg_deduct_materials_from_log_d
AFTER DELETE ON k24_production_logs
FOR EACH ROW EXECUTE FUNCTION deduct_materials_from_log();

-- ---------------------------------------------------------------------------
-- 3. Чистим артефакты по заказу #1
--    - все 3 «Резерв под заказ» транзакции (они не трогали stock, можно просто удалить)
--    - «Авто: печать заказа» по плёнке (была -4.4 м², stock_qty упал — возвращаем)
--    Краску оставляем (она и есть новая норма auto_deduct).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_order_id UUID;
  v_film_id UUID;
  v_film_delta NUMERIC;
BEGIN
  SELECT id INTO v_order_id FROM k24_orders WHERE number = 1;
  IF v_order_id IS NULL THEN RETURN; END IF;

  -- Удаляем резервы (stock они не меняли)
  DELETE FROM k24_material_transactions
  WHERE order_id = v_order_id AND reason = 'Резерв под заказ';

  -- Возвращаем плёнку: ищем старое авто-списание плёнки и откатываем stock_qty
  SELECT m.id, t.delta INTO v_film_id, v_film_delta
  FROM k24_material_transactions t
  JOIN k24_materials m ON m.id = t.material_id
  WHERE t.order_id = v_order_id
    AND t.reason = 'Авто: печать заказа'
    AND m.type = 'film'
  ORDER BY t.created_at ASC
  LIMIT 1;

  IF v_film_id IS NOT NULL THEN
    UPDATE k24_materials SET stock_qty = stock_qty - v_film_delta, updated_at = now() WHERE id = v_film_id;
    DELETE FROM k24_material_transactions
    WHERE order_id = v_order_id AND reason = 'Авто: печать заказа' AND material_id = v_film_id;
  END IF;
END $$;
