-- 027: триггер материалов берёт row-lock на k24_materials через SELECT … FOR UPDATE.
--
-- Без локов одновременный INSERT двух production_logs мог терять одно из обновлений
-- stock_qty (read-modify-write race). С командой 3 постпечатника + 1 печатник
-- вероятность низкая, но при инвентаризации с автоподстановкой по факту это
-- быстро накапливается в расхождение.
--
-- Решение: SELECT id INTO v_material_id ... FOR UPDATE — Postgres держит блокировку
-- до конца транзакции. Параллельный триггер по тому же материалу будет ждать.

CREATE OR REPLACE FUNCTION deduct_materials_from_log()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_material_id UUID;
  v_order_id UUID := COALESCE(NEW.order_id, OLD.order_id);
  v_user UUID := COALESCE(NEW.worker_id, OLD.worker_id);
  v_track TEXT := COALESCE(NEW.track, OLD.track);
  v_film_bg TEXT;
  v_film_st TEXT;
  v_lam_type TEXT;
  v_film_code TEXT;
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
  SELECT film_type, film_type_stickers, lam_type
    INTO v_film_bg, v_film_st, v_lam_type
  FROM k24_orders WHERE id = v_order_id;

  IF v_track = 'stickers' AND v_film_st IS NOT NULL THEN
    v_film_code := v_film_st;
  ELSE
    v_film_code := v_film_bg;
  END IF;

  -- Плёнка: лок через FOR UPDATE на найденной строке материала
  v_delta := v_new_film - v_old_film;
  IF v_delta <> 0 THEN
    SELECT id INTO v_material_id
    FROM k24_materials
    WHERE type = 'film' AND material_code = v_film_code
    LIMIT 1
    FOR UPDATE;

    IF v_material_id IS NULL THEN
      SELECT id INTO v_material_id FROM k24_materials WHERE type = 'film' ORDER BY name LIMIT 1 FOR UPDATE;
    END IF;

    IF v_material_id IS NOT NULL THEN
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by)
      VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: плёнка', v_user);
      UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_material_id;
    END IF;
  END IF;

  -- Ламинация
  v_delta := v_new_lam - v_old_lam;
  IF v_delta <> 0 THEN
    SELECT id INTO v_material_id
    FROM k24_materials
    WHERE type = 'lam_film' AND material_code = v_lam_type
    LIMIT 1
    FOR UPDATE;

    IF v_material_id IS NULL THEN
      SELECT id INTO v_material_id FROM k24_materials WHERE type = 'lam_film' ORDER BY name LIMIT 1 FOR UPDATE;
    END IF;

    IF v_material_id IS NOT NULL THEN
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by)
      VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: ламинация', v_user);
      UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_material_id;
    END IF;
  END IF;

  -- Эпоксидная смола
  v_delta := v_new_resin - v_old_resin;
  IF v_delta <> 0 THEN
    SELECT id INTO v_material_id
    FROM k24_materials
    WHERE type = 'resin' AND material_code = 'resin'
    LIMIT 1
    FOR UPDATE;

    IF v_material_id IS NULL THEN
      SELECT id INTO v_material_id FROM k24_materials WHERE type = 'resin' AND unit = 'g' ORDER BY name LIMIT 1 FOR UPDATE;
    END IF;

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

-- То же для auto_deduct_materials (краска) — лок на ink-материал
CREATE OR REPLACE FUNCTION auto_deduct_materials(p_order_id UUID, p_changed_by UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order RECORD;
  v_ink_id UUID;
  v_ink_ml NUMERIC;
BEGIN
  SELECT width_mm, height_mm, qty, ink_deducted_at INTO v_order
  FROM k24_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_order.ink_deducted_at IS NOT NULL THEN RETURN; END IF;

  v_ink_ml := (v_order.qty * v_order.width_mm * v_order.height_mm)::NUMERIC / 1000000.0 * 12;

  SELECT id INTO v_ink_id FROM k24_materials WHERE type = 'ink' ORDER BY name LIMIT 1 FOR UPDATE;

  IF v_ink_id IS NOT NULL AND v_ink_ml > 0 THEN
    INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by)
    VALUES (v_ink_id, p_order_id, -v_ink_ml, 'Авто: печать заказа (краска)', p_changed_by);
    UPDATE k24_materials SET stock_qty = stock_qty - v_ink_ml, updated_at = now() WHERE id = v_ink_id;
    UPDATE k24_orders SET ink_deducted_at = now() WHERE id = p_order_id;
  END IF;
END;
$$;

ALTER FUNCTION public.auto_deduct_materials(uuid, uuid) SET search_path = public, pg_temp;
