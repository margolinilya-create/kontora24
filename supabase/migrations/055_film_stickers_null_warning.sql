-- 055_film_stickers_null_warning.sql
-- R14.7 (code-review 03.06): мягкая защита от тихого списания плёнки стикеров
-- со склада плёнки фонов.
--
-- Сценарий бага: stickerpack3D с film_type='Holo' (фоны), film_type_stickers
-- забыли указать (NULL). Печатник вводит лог print track='stickers',
-- film_meters=80. Триггер deduct_materials_from_log (миграция 025) делает
-- fallback v_film_st IS NULL → v_film_code := v_film_bg → списывает с Holo.
-- Через неделю Holo в минусе, фактическая плёнка стикеров не уменьшается,
-- никто не понимает причину расхождения.
--
-- Решение: НЕ блокируем INSERT (это бы остановило прод). Вместо этого пишем
-- запись в k24_integration_log с reason='WARNING: film_type_stickers NULL'.
-- Менеджер видит в /settings → Логи интеграций какие заказы попали в fallback
-- и может задним числом проставить film_type_stickers в редакторе.
--
-- Когда менеджер выработает привычку всегда заполнять поле — можно поднять
-- до ERROR в отдельной миграции.

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
  v_film_code TEXT;
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
  -- Берём film_type / lam_type / order_type из заказа
  SELECT film_type, film_type_stickers, lam_type, order_type
    INTO v_film_bg, v_film_st, v_lam_type, v_order_type
  FROM k24_orders WHERE id = v_order_id;

  -- R14.7 warning: stickerpack3D + track='stickers' + film_type_stickers NULL →
  -- списываем по плёнке фонов (legacy fallback), но логируем в integration_log
  -- чтобы менеджер увидел расхождение и дозаполнил поле.
  IF v_track = 'stickers'
     AND v_order_type = 'stickerpack3D'
     AND v_film_st IS NULL
     AND (v_new_film - v_old_film) <> 0
  THEN
    INSERT INTO k24_integration_log (direction, endpoint, status, error_message, payload, order_id)
    VALUES (
      'incoming',
      'deduct_materials_from_log',
      'warning',
      'film_type_stickers пустой — плёнка списана с film_type (фонов). Дозаполните film_type_stickers в редакторе заказа.',
      jsonb_build_object(
        'log_id', COALESCE(NEW.id, OLD.id),
        'track', v_track,
        'film_type_bg', v_film_bg,
        'meters_delta', (v_new_film - v_old_film)
      ),
      v_order_id
    );
  END IF;

  -- Какая плёнка использовалась в этом логе:
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
