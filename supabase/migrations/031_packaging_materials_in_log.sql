-- Migration 031: расход БОПП-пакетов и коробок при упаковке
--
-- Фидбэк менеджера 17.05: «Добавить возможность вносить расход по следующим
-- пунктам: Кол-во БОПП-пакетов (тип выбирается из выпадающего списка) и
-- Кол-во коробок (тип также из списка)».
--
-- Колонки на k24_production_logs указывают на конкретные позиции в k24_materials
-- (packaging_bag и box). Триггер deduct_materials_from_log расширен — при
-- INSERT/UPDATE/DELETE логов упаковки автоматически создаются транзакции
-- расхода с FOR UPDATE lock (как в миграции 027).
--
-- БЕЗОПАСНОСТЬ: только ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE FUNCTION.

ALTER TABLE k24_production_logs
  ADD COLUMN IF NOT EXISTS packaging_bag_material_id UUID REFERENCES k24_materials(id),
  ADD COLUMN IF NOT EXISTS box_material_id UUID REFERENCES k24_materials(id),
  ADD COLUMN IF NOT EXISTS boxes_used INT;

CREATE INDEX IF NOT EXISTS idx_prod_logs_packaging_bag
  ON k24_production_logs(packaging_bag_material_id)
  WHERE packaging_bag_material_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prod_logs_box
  ON k24_production_logs(box_material_id)
  WHERE box_material_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.deduct_materials_from_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- Packaging materials: качество x material_id. Дельта считается отдельно
  -- по каждой паре (qty, material_id) — при UPDATE если поменялся material_id
  -- старая позиция получает +qty, новая получает -qty.
  v_old_bag_id UUID := CASE WHEN v_old_active THEN OLD.packaging_bag_material_id ELSE NULL END;
  v_new_bag_id UUID := CASE WHEN v_new_active THEN NEW.packaging_bag_material_id ELSE NULL END;
  v_old_bag_qty NUMERIC := CASE WHEN v_old_active THEN COALESCE(OLD.packs_packaged, 0) ELSE 0 END;
  v_new_bag_qty NUMERIC := CASE WHEN v_new_active THEN COALESCE(NEW.packs_packaged, 0) ELSE 0 END;
  v_old_box_id UUID := CASE WHEN v_old_active THEN OLD.box_material_id ELSE NULL END;
  v_new_box_id UUID := CASE WHEN v_new_active THEN NEW.box_material_id ELSE NULL END;
  v_old_box_qty NUMERIC := CASE WHEN v_old_active THEN COALESCE(OLD.boxes_used, 0) ELSE 0 END;
  v_new_box_qty NUMERIC := CASE WHEN v_new_active THEN COALESCE(NEW.boxes_used, 0) ELSE 0 END;
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

  -- film
  v_delta := v_new_film - v_old_film;
  IF v_delta <> 0 THEN
    SELECT id INTO v_material_id
    FROM k24_materials
    WHERE type = 'film' AND material_code = v_film_code
    LIMIT 1 FOR UPDATE;
    IF v_material_id IS NULL THEN
      SELECT id INTO v_material_id FROM k24_materials WHERE type = 'film' ORDER BY name LIMIT 1 FOR UPDATE;
    END IF;
    IF v_material_id IS NOT NULL THEN
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by)
      VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: плёнка', v_user);
      UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_material_id;
    END IF;
  END IF;

  -- lam_film
  v_delta := v_new_lam - v_old_lam;
  IF v_delta <> 0 THEN
    SELECT id INTO v_material_id
    FROM k24_materials
    WHERE type = 'lam_film' AND material_code = v_lam_type
    LIMIT 1 FOR UPDATE;
    IF v_material_id IS NULL THEN
      SELECT id INTO v_material_id FROM k24_materials WHERE type = 'lam_film' ORDER BY name LIMIT 1 FOR UPDATE;
    END IF;
    IF v_material_id IS NOT NULL THEN
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by)
      VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: ламинация', v_user);
      UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_material_id;
    END IF;
  END IF;

  -- resin
  v_delta := v_new_resin - v_old_resin;
  IF v_delta <> 0 THEN
    SELECT id INTO v_material_id
    FROM k24_materials
    WHERE type = 'resin' AND material_code = 'resin'
    LIMIT 1 FOR UPDATE;
    IF v_material_id IS NULL THEN
      SELECT id INTO v_material_id FROM k24_materials WHERE type = 'resin' AND unit = 'g' ORDER BY name LIMIT 1 FOR UPDATE;
    END IF;
    IF v_material_id IS NOT NULL THEN
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by)
      VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: смола', v_user);
      UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_material_id;
    END IF;
  END IF;

  -- packaging_bag (BOPP). Списываем по packs_packaged.
  -- Если material_id или qty изменились — старая позиция возвращает разницу.
  IF v_old_bag_id IS NOT DISTINCT FROM v_new_bag_id THEN
    -- Один и тот же материал — простая дельта по qty
    v_delta := v_new_bag_qty - v_old_bag_qty;
    IF v_new_bag_id IS NOT NULL AND v_delta <> 0 THEN
      PERFORM 1 FROM k24_materials WHERE id = v_new_bag_id FOR UPDATE;
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by)
      VALUES (v_new_bag_id, v_order_id, -v_delta, 'Списание по факту: БОПП-пакет', v_user);
      UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_new_bag_id;
    END IF;
  ELSE
    -- Материал сменился: вернуть старому, списать новому
    IF v_old_bag_id IS NOT NULL AND v_old_bag_qty <> 0 THEN
      PERFORM 1 FROM k24_materials WHERE id = v_old_bag_id FOR UPDATE;
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by)
      VALUES (v_old_bag_id, v_order_id, v_old_bag_qty, 'Возврат: смена БОПП-пакета', v_user);
      UPDATE k24_materials SET stock_qty = stock_qty + v_old_bag_qty, updated_at = now() WHERE id = v_old_bag_id;
    END IF;
    IF v_new_bag_id IS NOT NULL AND v_new_bag_qty <> 0 THEN
      PERFORM 1 FROM k24_materials WHERE id = v_new_bag_id FOR UPDATE;
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by)
      VALUES (v_new_bag_id, v_order_id, -v_new_bag_qty, 'Списание по факту: БОПП-пакет', v_user);
      UPDATE k24_materials SET stock_qty = stock_qty - v_new_bag_qty, updated_at = now() WHERE id = v_new_bag_id;
    END IF;
  END IF;

  -- box. Списываем по boxes_used.
  IF v_old_box_id IS NOT DISTINCT FROM v_new_box_id THEN
    v_delta := v_new_box_qty - v_old_box_qty;
    IF v_new_box_id IS NOT NULL AND v_delta <> 0 THEN
      PERFORM 1 FROM k24_materials WHERE id = v_new_box_id FOR UPDATE;
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by)
      VALUES (v_new_box_id, v_order_id, -v_delta, 'Списание по факту: коробка', v_user);
      UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_new_box_id;
    END IF;
  ELSE
    IF v_old_box_id IS NOT NULL AND v_old_box_qty <> 0 THEN
      PERFORM 1 FROM k24_materials WHERE id = v_old_box_id FOR UPDATE;
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by)
      VALUES (v_old_box_id, v_order_id, v_old_box_qty, 'Возврат: смена коробки', v_user);
      UPDATE k24_materials SET stock_qty = stock_qty + v_old_box_qty, updated_at = now() WHERE id = v_old_box_id;
    END IF;
    IF v_new_box_id IS NOT NULL AND v_new_box_qty <> 0 THEN
      PERFORM 1 FROM k24_materials WHERE id = v_new_box_id FOR UPDATE;
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by)
      VALUES (v_new_box_id, v_order_id, -v_new_box_qty, 'Списание по факту: коробка', v_user);
      UPDATE k24_materials SET stock_qty = stock_qty - v_new_box_qty, updated_at = now() WHERE id = v_new_box_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
