-- 025: списание материалов выбирает корректную позицию по film_type / lam_type.
--
-- Проблема: триггер deduct_materials_from_log делал `SELECT ... WHERE type='film' ORDER BY name LIMIT 1`.
-- Это всегда указывало на первую по алфавиту плёнку («Белая глянцевая 1260»). Если печатник
-- работал с Голографической, Gold или Chrome — списание шло на «Белая глянцевая». Через неделю
-- одна позиция уходит в минус, а Holo/Gold/Chrome остаются с фиктивно полным стоком.
--
-- Решение: добавляем k24_materials.material_code и сопоставляем по коду из k24_orders.
-- Для 3D-стикерпака track='stickers' — берём film_type_stickers, иначе film_type.
-- Ламинация: matte / glossy → конкретная позиция.
-- Если кода нет (новая плёнка или закодирована частично) — fallback на старую логику
-- «первая по name», чтобы не падать.

ALTER TABLE k24_materials ADD COLUMN IF NOT EXISTS material_code TEXT;

CREATE INDEX IF NOT EXISTS idx_k24_materials_code ON k24_materials(type, material_code);

-- Коды плёнки соответствуют FILM_TYPES в src/shared/constants.js
UPDATE k24_materials SET material_code = 'G'             WHERE name = 'Белая глянцевая 1260 (50м)';
UPDATE k24_materials SET material_code = 'M'             WHERE name = 'Белая матовая 1260 (50м)';
UPDATE k24_materials SET material_code = 'Transparent_G' WHERE name = 'Прозрачная глянцевая 1260 (50м)';
UPDATE k24_materials SET material_code = 'Transparent_M' WHERE name = 'Прозрачная матовая 1260 (50м)';
UPDATE k24_materials SET material_code = 'Holo'          WHERE name = 'Голографическая плёнка';
UPDATE k24_materials SET material_code = 'Gold'          WHERE name = 'Золотая плёнка';
UPDATE k24_materials SET material_code = 'Chrome'        WHERE name = 'Серебрянная плёнка';

-- Коды ламинации — matte / glossy (значения k24_orders.lam_type)
UPDATE k24_materials SET material_code = 'matte'  WHERE name = 'Матовая плёнка для ламинации';
UPDATE k24_materials SET material_code = 'glossy' WHERE name = 'Глянцевая плёнка для ламинации';

-- Смола — единый код для эпоксидки в граммах
UPDATE k24_materials SET material_code = 'resin' WHERE name = 'Эпоксидная смола';

-- ---------------------------------------------------------------------------
-- Обновлённый триггер: ищет материал по коду из заказа
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
  v_old_lam NUMERIC := CASE WHEN v_old_active THEN COALESCE(OLD.lamination_meters, 0) ELSE 0 END;
  v_new_lam NUMERIC := CASE WHEN v_new_active THEN COALESCE(NEW.lamination_meters, 0) ELSE 0 END;
  v_old_resin NUMERIC := CASE WHEN v_old_active THEN COALESCE(OLD.resin_grams, 0) ELSE 0 END;
  v_new_resin NUMERIC := CASE WHEN v_new_active THEN COALESCE(NEW.resin_grams, 0) ELSE 0 END;
  v_delta NUMERIC;
BEGIN
  -- Берём film_type / lam_type из заказа (в форме они больше не вводятся, R-апдейт 11.05)
  SELECT film_type, film_type_stickers, lam_type
    INTO v_film_bg, v_film_st, v_lam_type
  FROM k24_orders WHERE id = v_order_id;

  -- Какая плёнка использовалась в этом логе:
  -- track='stickers' и film_type_stickers задан → плёнка стикеров (только для stickerpack3D)
  -- иначе → плёнка фонов / основная
  IF v_track = 'stickers' AND v_film_st IS NOT NULL THEN
    v_film_code := v_film_st;
  ELSE
    v_film_code := v_film_bg;
  END IF;

  -- Плёнка ---------------------------------------------------------------
  v_delta := v_new_film - v_old_film;
  IF v_delta <> 0 THEN
    SELECT id INTO v_material_id
    FROM k24_materials
    WHERE type = 'film' AND material_code = v_film_code
    LIMIT 1;

    -- Fallback: если код не нашёлся (новая плёнка без кода) — старая логика
    IF v_material_id IS NULL THEN
      SELECT id INTO v_material_id FROM k24_materials WHERE type = 'film' ORDER BY name LIMIT 1;
    END IF;

    IF v_material_id IS NOT NULL THEN
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by)
      VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: плёнка', v_user);
      UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_material_id;
    END IF;
  END IF;

  -- Ламинация ------------------------------------------------------------
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

  -- Эпоксидная смола -----------------------------------------------------
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
