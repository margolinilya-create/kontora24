-- 092 (фидбэк 24.07) — восстановление списания БОПП-пакетов и коробок в
-- deduct_materials_from_log().
--
-- Контекст: блок списания упаковки был добавлен в миграции 031, но затёрт
-- переопределениями функции в 043/055/057 (там остались только плёнка/
-- ламинация/смола). В проде проверено (pg_get_functiondef): списание БОПП
-- отсутствует → форма упаковки писала packaging_bag_material_id / boxes_used
-- в лог, но склад не трогался — ни для обычной упаковки, ни для подзадач.
--
-- Задача 1 брифа: на упаковке подзадачи-допечатки (и вообще на упаковке) склад
-- списывает БОПП-пакеты по количеству упакованного (packs_packaged) и коробки
-- по boxes_used. Триггер trg_deduct_materials_from_log_iu/_d уже висит на ВСЕХ
-- k24_production_logs без фильтра по subtask_id — restore автоматически
-- покрывает и обычную упаковку заказа, и упаковку подзадачи.
--
-- Тело = актуальная версия из 057 (плёнка/ламинация/смола сохранены дословно)
-- + добавлены блоки БОПП/коробок перед RETURN. Дельта NEW−OLD с учётом
-- deleted_at (реверс на soft-delete/DELETE отрабатывает штатно). Материал —
-- COALESCE(new_mid, old_mid), чтобы DELETE-реверс нашёл позицию из OLD.

CREATE OR REPLACE FUNCTION public.deduct_materials_from_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- R24: упаковка — БОПП-пакеты (по packs_packaged) и коробки (по boxes_used).
  v_old_bag NUMERIC := CASE WHEN v_old_active THEN COALESCE(OLD.packs_packaged, 0) ELSE 0 END;
  v_new_bag NUMERIC := CASE WHEN v_new_active THEN COALESCE(NEW.packs_packaged, 0) ELSE 0 END;
  v_old_box NUMERIC := CASE WHEN v_old_active THEN COALESCE(OLD.boxes_used, 0) ELSE 0 END;
  v_new_box NUMERIC := CASE WHEN v_new_active THEN COALESCE(NEW.boxes_used, 0) ELSE 0 END;
  v_old_bag_mid UUID := CASE WHEN v_old_active THEN OLD.packaging_bag_material_id ELSE NULL END;
  v_new_bag_mid UUID := CASE WHEN v_new_active THEN NEW.packaging_bag_material_id ELSE NULL END;
  v_old_box_mid UUID := CASE WHEN v_old_active THEN OLD.box_material_id ELSE NULL END;
  v_new_box_mid UUID := CASE WHEN v_new_active THEN NEW.box_material_id ELSE NULL END;
  v_delta NUMERIC;
BEGIN
  SELECT
    film_type, film_type_stickers, lam_type, order_type,
    film_material_id, film_stickers_material_id, lam_material_id
    INTO
    v_film_bg, v_film_st, v_lam_type, v_order_type,
    v_film_bg_mid, v_film_st_mid, v_lam_mid
  FROM k24_orders WHERE id = v_order_id;

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

  IF v_track = 'stickers' THEN
    v_target_film_mid := v_film_st_mid;
    v_film_code := COALESCE(v_film_st, v_film_bg);
    IF v_target_film_mid IS NULL AND v_film_st IS NULL THEN
      v_target_film_mid := v_film_bg_mid;
    END IF;
  ELSE
    v_target_film_mid := v_film_bg_mid;
    v_film_code := v_film_bg;
  END IF;

  v_delta := v_new_film - v_old_film;
  IF v_delta <> 0 THEN
    v_material_id := v_target_film_mid;
    IF v_material_id IS NULL AND v_film_code IS NOT NULL THEN
      SELECT id INTO v_material_id
      FROM k24_materials
      WHERE type = 'film' AND material_code = v_film_code
      LIMIT 1;
    END IF;
    IF v_material_id IS NULL THEN
      SELECT id INTO v_material_id FROM k24_materials WHERE type = 'film' ORDER BY name LIMIT 1;
    END IF;
    IF v_material_id IS NOT NULL THEN
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by)
      VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: плёнка', v_user);
      UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_material_id;
    END IF;
  END IF;

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

  -- R24: БОПП-пакеты — списываем по количеству упакованного (packs_packaged).
  -- Материал берём из NEW (или OLD при DELETE-реверсе). Дельта NEW−OLD.
  v_material_id := COALESCE(v_new_bag_mid, v_old_bag_mid);
  v_delta := v_new_bag - v_old_bag;
  IF v_material_id IS NOT NULL AND v_delta <> 0 THEN
    INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by)
    VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: БОПП-пакет', v_user);
    UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_material_id;
  END IF;

  -- R24: коробки — списываем по введённому числу (boxes_used).
  v_material_id := COALESCE(v_new_box_mid, v_old_box_mid);
  v_delta := v_new_box - v_old_box;
  IF v_material_id IS NOT NULL AND v_delta <> 0 THEN
    INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by)
    VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: коробка', v_user);
    UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_material_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
