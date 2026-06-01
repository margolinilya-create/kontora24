-- Migration 043: R11.0 Foundation — новые этапы производства
-- Добавляем колонки для таймера сушки и расхода плёнки на образец, расширяем
-- check_stage_completion и deduct_materials_from_log для новых stages.
-- В этой миграции НЕ меняем ORDER_ROUTES (это R11.1). Существующие маршруты
-- продолжают работать; новые этапы появятся в маршрутах после R11.1.
--
-- Новые этапы (для всех типов заказа):
--   sample_layout    — Вёрстка образца (без данных)
--   sample_print     — Печать образца (фиксирует расход sample_film_meters)
--   color_approval   — Утверждение цвета (без данных, ручной advance)
--   batch_layout     — Вёрстка тиража (без данных)
--   drying           — Сушка 36 часов (таймер; advance через pg_cron в R11.2)
--   selection        — Выборка штучных стикеров (для sticker3D после сушки)

-- ---------------------------------------------------------------------------
-- 1. Колонки для таймера сушки
-- ---------------------------------------------------------------------------
ALTER TABLE k24_orders ADD COLUMN IF NOT EXISTS drying_started_at TIMESTAMPTZ;
ALTER TABLE k24_order_subtasks ADD COLUMN IF NOT EXISTS drying_started_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 2. Поле для расхода плёнки на этапе sample_print
-- ---------------------------------------------------------------------------
ALTER TABLE k24_production_logs ADD COLUMN IF NOT EXISTS sample_film_meters NUMERIC DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 3. Расширяем check_stage_completion новыми ветками
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_stage_completion(p_order_id UUID, p_stage TEXT, p_track TEXT DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_target INT;
  v_total NUMERIC;
BEGIN
  SELECT qty INTO v_target FROM k24_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Order not found'); END IF;

  -- R11.0 — новые этапы без обязательных производственных данных.
  -- sample_layout / color_approval / batch_layout / drying — advance разрешён
  -- без production_log (UI добавит свои контролы в R11.1/R11.2).
  IF p_stage IN ('sample_layout', 'color_approval', 'batch_layout', 'drying') THEN
    RETURN json_build_object('total', 0, 'target', v_target, 'is_complete', true);

  ELSIF p_stage = 'sample_print' THEN
    -- На печати образца фиксируется только sample_film_meters. Готовность —
    -- наличие хотя бы одной записи (плёнка списана).
    SELECT COALESCE(SUM(sample_film_meters), 0) INTO v_total
    FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'sample_print';
    RETURN json_build_object('total', v_total, 'target', v_target, 'is_complete', v_total > 0);

  ELSIF p_stage = 'selection' THEN
    SELECT COALESCE(SUM(qty_selected), 0) INTO v_total
    FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'selection';

  -- Существующие этапы (без изменений, скопировано из миграции 008)
  ELSIF p_stage = 'print' THEN
    IF p_track = 'backgrounds' THEN
      SELECT COALESCE(SUM(backgrounds_printed), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'print' AND track = 'backgrounds';
    ELSIF p_track = 'stickers' THEN
      SELECT COALESCE(SUM(stickers_printed), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'print' AND track = 'stickers';
    ELSE
      SELECT COALESCE(SUM(stickers_printed), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'print';
    END IF;
  ELSIF p_stage = 'lamination' THEN
    SELECT COALESCE(SUM(lamination_meters), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'lamination';
    RETURN json_build_object('total', v_total, 'target', v_target, 'is_complete', v_total > 0);
  ELSIF p_stage = 'cutting' THEN
    IF p_track IS NOT NULL THEN
      SELECT COALESCE(SUM(qty_cut), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'cutting' AND track = p_track;
    ELSE
      SELECT COALESCE(SUM(qty_cut), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'cutting';
    END IF;
  ELSIF p_stage = 'pouring' THEN
    SELECT COALESCE(SUM(stickers_good), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'pouring';
  ELSIF p_stage = 'selection_pouring' THEN
    IF p_track = 'backgrounds' THEN
      SELECT COALESCE(SUM(qty_selected), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'selection_pouring' AND track = 'backgrounds';
    ELSIF p_track = 'stickers' THEN
      SELECT COALESCE(SUM(stickers_good), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'selection_pouring' AND track = 'stickers';
    ELSE
      SELECT COALESCE(SUM(qty_selected), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'selection_pouring';
    END IF;
  ELSIF p_stage = 'assembly_3d' THEN
    SELECT COALESCE(SUM(packs_assembled), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'assembly_3d';
  ELSIF p_stage = 'packaging' THEN
    SELECT COALESCE(SUM(packs_packaged), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'packaging';
  ELSE
    v_total := 0;
  END IF;

  RETURN json_build_object('total', v_total, 'target', v_target, 'is_complete', v_total >= v_target);
END;
$$;

ALTER FUNCTION public.check_stage_completion(UUID, TEXT, TEXT) SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 4. Расширяем deduct_materials_from_log — добавляем списание sample_film_meters
--    с той же логикой что у film_meters (по material_code из заказа).
-- ---------------------------------------------------------------------------
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
  v_old_sample NUMERIC := CASE WHEN v_old_active THEN COALESCE(OLD.sample_film_meters, 0) ELSE 0 END;
  v_new_sample NUMERIC := CASE WHEN v_new_active THEN COALESCE(NEW.sample_film_meters, 0) ELSE 0 END;
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

  -- Плёнка тиража -------------------------------------------------------
  v_delta := v_new_film - v_old_film;
  IF v_delta <> 0 THEN
    SELECT id INTO v_material_id
    FROM k24_materials
    WHERE type = 'film' AND material_code = v_film_code
    LIMIT 1;
    IF v_material_id IS NULL THEN
      SELECT id INTO v_material_id FROM k24_materials WHERE type = 'film' ORDER BY name LIMIT 1;
    END IF;
    IF v_material_id IS NOT NULL THEN
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by)
      VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: плёнка', v_user);
      UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_material_id;
    END IF;
  END IF;

  -- Плёнка образца (R11.0) ----------------------------------------------
  v_delta := v_new_sample - v_old_sample;
  IF v_delta <> 0 THEN
    SELECT id INTO v_material_id
    FROM k24_materials
    WHERE type = 'film' AND material_code = v_film_code
    LIMIT 1;
    IF v_material_id IS NULL THEN
      SELECT id INTO v_material_id FROM k24_materials WHERE type = 'film' ORDER BY name LIMIT 1;
    END IF;
    IF v_material_id IS NOT NULL THEN
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by)
      VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: плёнка образца', v_user);
      UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_material_id;
    END IF;
  END IF;

  -- Ламинация -----------------------------------------------------------
  v_delta := v_new_lam - v_old_lam;
  IF v_delta <> 0 THEN
    SELECT id INTO v_material_id
    FROM k24_materials
    WHERE type = 'lam_film' AND material_code = v_lam_type
    LIMIT 1;
    IF v_material_id IS NULL THEN
      SELECT id INTO v_material_id FROM k24_materials WHERE type = 'lam_film' ORDER BY name LIMIT 1;
    END IF;
    IF v_material_id IS NOT NULL THEN
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by)
      VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: ламинация', v_user);
      UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_material_id;
    END IF;
  END IF;

  -- Смола ---------------------------------------------------------------
  v_delta := v_new_resin - v_old_resin;
  IF v_delta <> 0 THEN
    SELECT id INTO v_material_id
    FROM k24_materials
    WHERE type = 'resin' AND material_code = 'resin'
    LIMIT 1;
    IF v_material_id IS NULL THEN
      SELECT id INTO v_material_id FROM k24_materials WHERE type = 'resin' AND unit = 'g' ORDER BY name LIMIT 1;
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
