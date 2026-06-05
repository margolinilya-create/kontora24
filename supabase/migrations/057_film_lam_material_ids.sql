-- 057_film_lam_material_ids.sql
-- R16.1 (бриф 04-05.06 #1): дать заказу хранить КОНКРЕТНЫЕ позиции склада
-- для плёнки фонов / плёнки стикеров / ламинации. До R16.1 триггер
-- deduct_materials_from_log при списании делал
-- `WHERE material_code = X LIMIT 1` без ORDER BY — если на складе было
-- несколько позиций с одним кодом (несколько брендов Orajet/Duckson/...),
-- списывал с первой попавшейся (зависит от плана PostgreSQL).
--
-- Менеджер на скриншоте видел только агрегированный остаток «Глянцевая · 75 м»,
-- хотя на складе физически 2 позиции «Duckson 3640 G» + «Orajet 3640 G».
-- Теперь форма создания заказа покажет per-position опции, и каждая будет
-- сохранена в k24_orders.{film_material_id, film_stickers_material_id,
-- lam_material_id}. Триггер списывает с этой позиции; legacy-фоллбек на
-- material_code остаётся для старых заказов где material_id IS NULL.

ALTER TABLE k24_orders
  ADD COLUMN IF NOT EXISTS film_material_id UUID REFERENCES k24_materials(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS film_stickers_material_id UUID REFERENCES k24_materials(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lam_material_id UUID REFERENCES k24_materials(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_film_material_id ON k24_orders(film_material_id);
CREATE INDEX IF NOT EXISTS idx_orders_film_stickers_material_id ON k24_orders(film_stickers_material_id);
CREATE INDEX IF NOT EXISTS idx_orders_lam_material_id ON k24_orders(lam_material_id);

-- Обновлённый триггер.
CREATE OR REPLACE FUNCTION public.deduct_materials_from_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID := COALESCE(NEW.order_id, OLD.order_id);
  v_user UUID := COALESCE(NEW.worker_id, OLD.worker_id);
  v_track TEXT := COALESCE(NEW.track, OLD.track);
  v_film_bg TEXT;
  v_film_st TEXT;
  v_lam_type TEXT;
  v_order_type TEXT;
  v_film_bg_mid UUID;
  v_film_st_mid UUID;
  v_lam_mid UUID;
  v_film_code TEXT;
  v_target_film_mid UUID;
  v_material_id UUID;
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
  -- Берём поля заказа: типы + новые material_id (R16.1)
  SELECT
    film_type, film_type_stickers, lam_type, order_type,
    film_material_id, film_stickers_material_id, lam_material_id
    INTO
    v_film_bg, v_film_st, v_lam_type, v_order_type,
    v_film_bg_mid, v_film_st_mid, v_lam_mid
  FROM k24_orders WHERE id = v_order_id;

  -- R14.7 warning: stickerpack3D + track='stickers' + film_type_stickers NULL
  -- (логируется когда менеджер забыл указать плёнку стикеров для 3D-пака).
  IF v_track = 'stickers'
     AND v_order_type = 'stickerpack3D'
     AND v_film_st IS NULL
     AND v_film_st_mid IS NULL
     AND (v_new_film - v_old_film) <> 0
  THEN
    INSERT INTO k24_integration_log (direction, endpoint, status, error_message, payload, order_id)
    VALUES (
      'incoming',
      'deduct_materials_from_log',
      'warning',
      'film_type_stickers и film_stickers_material_id пусты — плёнка списана с film_type/film_material_id (фонов). Дозаполните в редакторе заказа.',
      jsonb_build_object(
        'log_id', COALESCE(NEW.id, OLD.id),
        'track', v_track,
        'film_type_bg', v_film_bg,
        'film_bg_mid', v_film_bg_mid,
        'meters_delta', (v_new_film - v_old_film)
      ),
      v_order_id
    );
  END IF;

  -- R16.1: определяем КОНКРЕТНУЮ позицию склада для текущего лога.
  -- 1) Сначала пытаемся через material_id заказа (приоритет — точный выбор менеджера).
  -- 2) Если material_id NULL — fallback на material_code (legacy).
  IF v_track = 'stickers' THEN
    v_target_film_mid := v_film_st_mid;
    v_film_code := COALESCE(v_film_st, v_film_bg);
    -- Если для трека stickers нет ID и нет film_type_stickers — используем плёнку фонов
    IF v_target_film_mid IS NULL AND v_film_st IS NULL THEN
      v_target_film_mid := v_film_bg_mid;
    END IF;
  ELSE
    v_target_film_mid := v_film_bg_mid;
    v_film_code := v_film_bg;
  END IF;

  -- Плёнка ---------------------------------------------------------------
  v_delta := v_new_film - v_old_film;
  IF v_delta <> 0 THEN
    -- Приоритет 1: явно выбранная позиция склада
    v_material_id := v_target_film_mid;

    -- Приоритет 2: lookup по material_code (legacy fallback для старых заказов)
    IF v_material_id IS NULL AND v_film_code IS NOT NULL THEN
      SELECT id INTO v_material_id
      FROM k24_materials
      WHERE type = 'film' AND material_code = v_film_code
      LIMIT 1;
    END IF;

    -- Приоритет 3: любая первая плёнка на складе (последний fallback)
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
    v_material_id := v_lam_mid;

    IF v_material_id IS NULL AND v_lam_type IS NOT NULL THEN
      SELECT id INTO v_material_id
      FROM k24_materials
      WHERE type = 'lam_film' AND material_code = v_lam_type
      LIMIT 1;
    END IF;

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
