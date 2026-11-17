-- ============================================================
-- R25.7B (ТЗ 17.11, Фаза 7, раздел 7.5) — категории склада в заказе
--                                          + дополнительные материалы
-- ============================================================
-- Аддитивная и идемпотентная миграция (можно прогнать повторно):
--   1. k24_warehouse_categories: show_in_order, order_field (print /
--      lamination / extra), consume_stage, norm_per_item, count_in_costs.
--      Сид по таблице 7.5 (по именам из 087) — только при ПЕРВОМ добавлении
--      колонок: повторный прогон не перетирает настройки администратора.
--   2. k24_order_materials — дополнительный материал заказа (одна позиция на
--      категорию). RLS: чтение всем authenticated, запись — order:create или
--      order:edit (k24_role_permissions). anon — ничего.
--   3. k24_production_logs.extra_consumption jsonb {material_id: qty} +
--      BEFORE-валидация: новый/изменённый положительный расход допустим только
--      по позиции, выбранной в заказе (k24_order_materials).
--   4. k24_material_transactions: production_log_id (БЕЗ FK — триггер
--      списания работает и AFTER DELETE записи) + индекс; in_order_costs
--      (NULL у всех прежних операций; true/false — у списаний доп. материалов).
--      После 098 у таблицы колоночные гранты → GRANT SELECT на 2 колонки.
--   5. deduct_materials_from_log — тело 099 ДОСЛОВНО + production_log_id во
--      всех INSERT + блок дополнительных материалов (дельта NEW − OLD).
--   6. RPC order_extra_materials(order_ids, from, to) — расход доп. материалов
--      по заказам; стоимость (qty × средняя цена) = NULL без view:finance.
--
-- Списание плёнки/ламинации/смолы/упаковки и их расчёт в отчётах НЕ меняются.
-- Заказ без дополнительных материалов: extra_consumption = '{}' → блок не
-- пишет ни одной операции, остатки и отчёты прежние.
--
-- Порядок: применить 105 ДО деплоя фронта R25.7B (фронт читает новые колонки
-- категорий, k24_order_materials и RPC). Старый фронт с 105 работает как раньше.
--
-- Rollback (данные не теряются): пересоздать deduct_materials_from_log из 099;
--   DROP TRIGGER trg_validate_log_extra_consumption ON k24_production_logs;
--   DROP FUNCTION order_extra_materials(uuid[], timestamptz, timestamptz);
--   колонки и таблицу k24_order_materials оставить.

-- ── 0. Хелпер: количество из jsonb (число ≥ 0, иначе 0) ───────
CREATE OR REPLACE FUNCTION public.k24_jsonb_qty(p_obj jsonb, p_key text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_obj IS NULL OR jsonb_typeof(p_obj) <> 'object' THEN 0
    WHEN jsonb_typeof(p_obj -> p_key) = 'number' THEN GREATEST((p_obj ->> p_key)::numeric, 0)
    ELSE 0
  END
$$;
REVOKE ALL ON FUNCTION public.k24_jsonb_qty(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.k24_jsonb_qty(jsonb, text) TO authenticated;

-- ── 1. Отметки категорий склада (7.5) ────────────────────────
DO $$
DECLARE
  v_first boolean := NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'k24_warehouse_categories'
       AND column_name = 'show_in_order'
  );
BEGIN
  ALTER TABLE public.k24_warehouse_categories
    ADD COLUMN IF NOT EXISTS show_in_order  boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS order_field    text,
    ADD COLUMN IF NOT EXISTS consume_stage  text,
    ADD COLUMN IF NOT EXISTS norm_per_item  numeric,
    ADD COLUMN IF NOT EXISTS count_in_costs boolean NOT NULL DEFAULT false;

  IF v_first THEN
    -- Начальные значения повторяют сегодняшнее поведение (таблица 7.5).
    UPDATE public.k24_warehouse_categories
       SET show_in_order = true, order_field = 'print', consume_stage = 'print', count_in_costs = true
     WHERE name = 'Плёнка для печати';
    UPDATE public.k24_warehouse_categories
       SET show_in_order = true, order_field = 'lamination', consume_stage = 'lamination', count_in_costs = true
     WHERE name = 'Плёнка для ламинации';
    UPDATE public.k24_warehouse_categories
       SET count_in_costs = true
     WHERE name IN ('Химические вещества', 'Упаковка (коробки)');
    -- БОПП (обе), Утварь, Хоз. товары, Ножи, Бумага в рулонах, Комплектующие —
    -- остаются по умолчанию: не в заказе, не в расходах (включает администратор).
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'k24_wh_cat_order_field_chk') THEN
    ALTER TABLE public.k24_warehouse_categories
      ADD CONSTRAINT k24_wh_cat_order_field_chk
      CHECK (order_field IS NULL OR order_field IN ('print', 'lamination', 'extra'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'k24_wh_cat_order_field_shown_chk') THEN
    ALTER TABLE public.k24_warehouse_categories
      ADD CONSTRAINT k24_wh_cat_order_field_shown_chk
      CHECK (order_field IS NULL OR show_in_order);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'k24_wh_cat_norm_positive_chk') THEN
    ALTER TABLE public.k24_warehouse_categories
      ADD CONSTRAINT k24_wh_cat_norm_positive_chk
      CHECK (norm_per_item IS NULL OR norm_per_item > 0);
  END IF;
END
$$;

COMMENT ON COLUMN public.k24_warehouse_categories.show_in_order IS
  'R25.7B (ТЗ 7.5): позиции категории можно выбрать в форме заказа.';
COMMENT ON COLUMN public.k24_warehouse_categories.order_field IS
  'R25.7B: поле в заказе — print (материал печати) / lamination / extra (доп. материал). Только при show_in_order.';
COMMENT ON COLUMN public.k24_warehouse_categories.consume_stage IS
  'R25.7B: этап, на котором вносится расход (ключ этапа). Доп. материал показывается в заказе, только если этап есть в маршруте.';
COMMENT ON COLUMN public.k24_warehouse_categories.norm_per_item IS
  'R25.7B: норма на 1 изделие (единицы позиции) — прогноз доп. материала = норма × тираж.';
COMMENT ON COLUMN public.k24_warehouse_categories.count_in_costs IS
  'R25.7B: расход категории по заказу входит в себестоимость материалов. Действует на списания доп. материалов (in_order_costs) после релиза.';

-- ── 2. Дополнительный материал заказа ────────────────────────
CREATE TABLE IF NOT EXISTS public.k24_order_materials (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES public.k24_orders(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.k24_warehouse_categories(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.k24_materials(id) ON DELETE CASCADE,
  created_by  uuid DEFAULT auth.uid() REFERENCES public.k24_profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT k24_order_materials_order_category_uq UNIQUE (order_id, category_id)
);
CREATE INDEX IF NOT EXISTS idx_k24_order_materials_material
  ON public.k24_order_materials (material_id);

COMMENT ON TABLE public.k24_order_materials IS
  'R25.7B (ТЗ 7.5): дополнительный материал заказа — по позиции склада на категорию с order_field=extra.';

ALTER TABLE public.k24_order_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_materials_select ON public.k24_order_materials;
CREATE POLICY order_materials_select ON public.k24_order_materials
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS order_materials_insert ON public.k24_order_materials;
CREATE POLICY order_materials_insert ON public.k24_order_materials
  FOR INSERT TO authenticated
  WITH CHECK (public.k24_user_can('order:create') OR public.k24_user_can('order:edit'));

DROP POLICY IF EXISTS order_materials_update ON public.k24_order_materials;
CREATE POLICY order_materials_update ON public.k24_order_materials
  FOR UPDATE TO authenticated
  USING (public.k24_user_can('order:create') OR public.k24_user_can('order:edit'))
  WITH CHECK (public.k24_user_can('order:create') OR public.k24_user_can('order:edit'));

DROP POLICY IF EXISTS order_materials_delete ON public.k24_order_materials;
CREATE POLICY order_materials_delete ON public.k24_order_materials
  FOR DELETE TO authenticated
  USING (public.k24_user_can('order:create') OR public.k24_user_can('order:edit'));

REVOKE ALL ON public.k24_order_materials FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.k24_order_materials TO authenticated;

-- ── 3. Расход доп. материалов в записи учёта ─────────────────
ALTER TABLE public.k24_production_logs
  ADD COLUMN IF NOT EXISTS extra_consumption jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'k24_logs_extra_consumption_object_chk') THEN
    ALTER TABLE public.k24_production_logs
      ADD CONSTRAINT k24_logs_extra_consumption_object_chk
      CHECK (jsonb_typeof(extra_consumption) = 'object');
  END IF;
END
$$;

COMMENT ON COLUMN public.k24_production_logs.extra_consumption IS
  'R25.7B (ТЗ 7.5): расход доп. материалов {material_id: qty} в единицах позиции. Списывается триггером deduct_materials_from_log.';

-- Валидация: ключ — uuid, значение — число ≥ 0. Новый или изменённый
-- положительный расход — только по позиции, выбранной в заказе. Неизменённые
-- ключи и обнуление (сторно) не проверяются: смена позиции в заказе не должна
-- блокировать правку старых записей.
CREATE OR REPLACE FUNCTION public.k24_validate_log_extra_consumption()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_new numeric;
  v_old numeric;
  v_old_obj jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old_obj := COALESCE(OLD.extra_consumption, '{}'::jsonb);
  END IF;
  IF NEW.extra_consumption IS NULL THEN
    NEW.extra_consumption := '{}'::jsonb;
  END IF;
  IF jsonb_typeof(NEW.extra_consumption) <> 'object' THEN
    RAISE EXCEPTION 'Расход доп. материалов: ожидается объект {позиция: количество}'
      USING ERRCODE = '22023';
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(NEW.extra_consumption) LOOP
    IF v_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Расход доп. материалов: некорректная позиция склада' USING ERRCODE = '22023';
    END IF;
    -- Две проверки раздельно: приведение к numeric — только для числа.
    IF jsonb_typeof(NEW.extra_consumption -> v_key) <> 'number' THEN
      RAISE EXCEPTION 'Расход доп. материалов: количество должно быть числом не меньше 0'
        USING ERRCODE = '22023';
    END IF;
    IF (NEW.extra_consumption ->> v_key)::numeric < 0 THEN
      RAISE EXCEPTION 'Расход доп. материалов: количество должно быть числом не меньше 0'
        USING ERRCODE = '22023';
    END IF;
    v_new := public.k24_jsonb_qty(NEW.extra_consumption, v_key);
    v_old := public.k24_jsonb_qty(v_old_obj, v_key);
    IF v_new > 0 AND v_new <> v_old AND NOT EXISTS (
      SELECT 1 FROM k24_order_materials om
       WHERE om.order_id = NEW.order_id AND om.material_id = v_key::uuid
    ) THEN
      RAISE EXCEPTION 'Материал не выбран в заказе как дополнительный' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.k24_validate_log_extra_consumption() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_validate_log_extra_consumption ON public.k24_production_logs;
CREATE TRIGGER trg_validate_log_extra_consumption
  BEFORE INSERT OR UPDATE OF extra_consumption, order_id ON public.k24_production_logs
  FOR EACH ROW EXECUTE FUNCTION public.k24_validate_log_extra_consumption();

-- ── 4. Ссылка операции склада на запись учёта ────────────────
ALTER TABLE public.k24_material_transactions
  ADD COLUMN IF NOT EXISTS production_log_id uuid,
  ADD COLUMN IF NOT EXISTS in_order_costs    boolean;

CREATE INDEX IF NOT EXISTS idx_mat_tx_production_log
  ON public.k24_material_transactions (production_log_id)
  WHERE production_log_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mat_tx_order_extra
  ON public.k24_material_transactions (order_id)
  WHERE in_order_costs IS NOT NULL;

COMMENT ON COLUMN public.k24_material_transactions.production_log_id IS
  'R25.7B: запись учёта, по которой триггер списал материал. Без FK: сторно при DELETE записи ссылается на удалённую строку.';
COMMENT ON COLUMN public.k24_material_transactions.in_order_costs IS
  'R25.7B: списание доп. материала входит в себестоимость заказа (отметка категории на момент списания). NULL — прочие операции.';

-- 098 перевёл таблицу на колоночные гранты: новые нефинансовые колонки
-- открываем явно (иначе select этих колонок у authenticated → 42501).
GRANT SELECT (production_log_id, in_order_costs) ON public.k24_material_transactions TO authenticated;

-- ── 5. deduct_materials_from_log vNext ───────────────────────
-- Тело 099 ДОСЛОВНО; изменения: production_log_id = COALESCE(NEW.id, OLD.id)
-- во всех INSERT + блок дополнительных материалов перед RETURN.
-- Триггеры trg_deduct_materials_from_log_iu / _d (021) не меняются.
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
  v_montage_mid UUID;
  v_film_code TEXT;
  v_target_film_mid UUID;
  v_material_id UUID;
  v_old_active BOOLEAN := (TG_OP IN ('UPDATE','DELETE')) AND (OLD.deleted_at IS NULL);
  v_new_active BOOLEAN := (TG_OP IN ('INSERT','UPDATE')) AND (NEW.deleted_at IS NULL);
  v_old_film NUMERIC := CASE WHEN v_old_active THEN COALESCE(OLD.film_meters, 0) ELSE 0 END;
  v_new_film NUMERIC := CASE WHEN v_new_active THEN COALESCE(NEW.film_meters, 0) ELSE 0 END;
  v_old_lam NUMERIC := CASE WHEN v_old_active THEN COALESCE(OLD.lamination_meters, 0) ELSE 0 END;
  v_new_lam NUMERIC := CASE WHEN v_new_active THEN COALESCE(NEW.lamination_meters, 0) ELSE 0 END;
  -- 099: монтажная плёнка — отдельная колонка лога, отдельная позиция склада.
  v_old_montage NUMERIC := CASE WHEN v_old_active THEN COALESCE(OLD.montage_meters, 0) ELSE 0 END;
  v_new_montage NUMERIC := CASE WHEN v_new_active THEN COALESCE(NEW.montage_meters, 0) ELSE 0 END;
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
  -- 105: ссылка операции на запись учёта (без FK: функция работает и AFTER DELETE).
  v_log_id UUID := COALESCE(NEW.id, OLD.id);
  -- 105: расход дополнительных материалов — extra_consumption {material_id: qty}.
  v_old_extra JSONB := CASE WHEN v_old_active THEN COALESCE(OLD.extra_consumption, '{}'::jsonb) ELSE '{}'::jsonb END;
  v_new_extra JSONB := CASE WHEN v_new_active THEN COALESCE(NEW.extra_consumption, '{}'::jsonb) ELSE '{}'::jsonb END;
  v_extra_key TEXT;
  v_extra_mid UUID;
  v_extra_cat_name TEXT;
  v_extra_in_costs BOOLEAN;
  v_extra_prev_costs BOOLEAN;
BEGIN
  SELECT
    film_type, film_type_stickers, lam_type, order_type,
    film_material_id, film_stickers_material_id, lam_material_id,
    montage_material_id
    INTO
    v_film_bg, v_film_st, v_lam_type, v_order_type,
    v_film_bg_mid, v_film_st_mid, v_lam_mid,
    v_montage_mid
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
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by, kind, is_auto, op_date, production_log_id)
      VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: плёнка', v_user,
              CASE WHEN v_delta > 0 THEN 'order_consumption' ELSE 'correction' END, true,
              (now() AT TIME ZONE 'Europe/Moscow')::date, v_log_id);
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
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by, kind, is_auto, op_date, production_log_id)
      VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: ламинация', v_user,
              CASE WHEN v_delta > 0 THEN 'order_consumption' ELSE 'correction' END, true,
              (now() AT TIME ZONE 'Europe/Moscow')::date, v_log_id);
      UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_material_id;
    END IF;
  END IF;

  -- 099: монтажная плёнка (montage_meters) — с montage_material_id заказа,
  -- запасной вариант — позиция lam_film с material_code='transfer'. Ветка
  -- lamination_meters выше не менялась: старые заказы с lam_type='transfer'
  -- списываются как раньше.
  v_delta := v_new_montage - v_old_montage;
  IF v_delta <> 0 THEN
    v_material_id := v_montage_mid;
    IF v_material_id IS NULL THEN
      SELECT id INTO v_material_id
      FROM k24_materials
      WHERE type = 'lam_film' AND material_code = 'transfer'
      ORDER BY archived_at NULLS FIRST, name
      LIMIT 1;
    END IF;
    IF v_material_id IS NOT NULL THEN
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by, kind, is_auto, op_date, production_log_id)
      VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: монтажная плёнка', v_user,
              CASE WHEN v_delta > 0 THEN 'order_consumption' ELSE 'correction' END, true,
              (now() AT TIME ZONE 'Europe/Moscow')::date, v_log_id);
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
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by, kind, is_auto, op_date, production_log_id)
      VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: смола', v_user,
              CASE WHEN v_delta > 0 THEN 'order_consumption' ELSE 'correction' END, true,
              (now() AT TIME ZONE 'Europe/Moscow')::date, v_log_id);
      UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_material_id;
    END IF;
  END IF;

  -- R24: БОПП-пакеты — списываем по количеству упакованного (packs_packaged).
  -- Материал берём из NEW (или OLD при DELETE-реверсе). Дельта NEW−OLD.
  v_material_id := COALESCE(v_new_bag_mid, v_old_bag_mid);
  v_delta := v_new_bag - v_old_bag;
  IF v_material_id IS NOT NULL AND v_delta <> 0 THEN
    INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by, kind, is_auto, op_date, production_log_id)
    VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: БОПП-пакет', v_user,
            CASE WHEN v_delta > 0 THEN 'order_consumption' ELSE 'correction' END, true,
            (now() AT TIME ZONE 'Europe/Moscow')::date, v_log_id);
    UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_material_id;
  END IF;

  -- R24: коробки — списываем по введённому числу (boxes_used).
  v_material_id := COALESCE(v_new_box_mid, v_old_box_mid);
  v_delta := v_new_box - v_old_box;
  IF v_material_id IS NOT NULL AND v_delta <> 0 THEN
    INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by, kind, is_auto, op_date, production_log_id)
    VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: коробка', v_user,
            CASE WHEN v_delta > 0 THEN 'order_consumption' ELSE 'correction' END, true,
            (now() AT TIME ZONE 'Europe/Moscow')::date, v_log_id);
    UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_material_id;
  END IF;

  -- 105 (ТЗ 7.5): дополнительные материалы заказа. Ключи OLD ∪ NEW,
  -- дельта NEW − OLD с учётом deleted_at (как у остальных веток): удаление /
  -- мягкое удаление записи сторнирует списание, правка — доводит до нового
  -- значения. in_order_costs — отметка «Учитывать в расходах» категории на
  -- момент списания; сторно берёт отметку исходного списания этой записи,
  -- чтобы сумма по заказу сходилась при смене отметки.
  FOR v_extra_key IN
    SELECT k FROM jsonb_object_keys(v_old_extra) AS k
    UNION
    SELECT k FROM jsonb_object_keys(v_new_extra) AS k
  LOOP
    CONTINUE WHEN v_extra_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    v_delta := public.k24_jsonb_qty(v_new_extra, v_extra_key) - public.k24_jsonb_qty(v_old_extra, v_extra_key);
    CONTINUE WHEN v_delta = 0;
    v_extra_mid := v_extra_key::uuid;
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM k24_materials WHERE id = v_extra_mid);

    v_extra_cat_name := NULL;
    v_extra_in_costs := NULL;
    SELECT c.name, c.count_in_costs
      INTO v_extra_cat_name, v_extra_in_costs
      FROM k24_order_materials om
      JOIN k24_warehouse_categories c ON c.id = om.category_id
     WHERE om.order_id = v_order_id AND om.material_id = v_extra_mid
     ORDER BY c.sort_order, c.name
     LIMIT 1;
    IF v_extra_cat_name IS NULL THEN
      SELECT c.name, c.count_in_costs
        INTO v_extra_cat_name, v_extra_in_costs
        FROM k24_materials m
        LEFT JOIN k24_warehouse_categories c ON c.id = m.category_id
       WHERE m.id = v_extra_mid;
    END IF;
    IF v_delta < 0 THEN
      SELECT t.in_order_costs INTO v_extra_prev_costs
        FROM k24_material_transactions t
       WHERE t.production_log_id = v_log_id
         AND t.material_id = v_extra_mid
         AND t.in_order_costs IS NOT NULL
         AND t.delta < 0
       ORDER BY t.created_at DESC
       LIMIT 1;
      IF FOUND THEN v_extra_in_costs := v_extra_prev_costs; END IF;
    END IF;

    INSERT INTO k24_material_transactions
      (material_id, order_id, delta, reason, created_by, kind, is_auto, op_date, production_log_id, in_order_costs)
    VALUES (v_extra_mid, v_order_id, -v_delta,
            'Списание по факту: ' || COALESCE(v_extra_cat_name, 'дополнительный материал'), v_user,
            CASE WHEN v_delta > 0 THEN 'order_consumption' ELSE 'correction' END, true,
            (now() AT TIME ZONE 'Europe/Moscow')::date, v_log_id, COALESCE(v_extra_in_costs, false));
    UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_extra_mid;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ── 6. RPC: расход доп. материалов по заказам ────────────────
-- Только списания доп. материалов (in_order_costs IS NOT NULL). qty — нетто
-- (списания − сторно), cost — qty × средняя цена позиции (как остальные
-- материалы в отчётах), NULL без права view:finance.
CREATE OR REPLACE FUNCTION public.order_extra_materials(
  p_order_ids uuid[],
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  order_id       uuid,
  material_id    uuid,
  material_name  text,
  unit           text,
  category_name  text,
  in_order_costs boolean,
  qty            numeric,
  cost           numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.order_id,
    t.material_id,
    m.name,
    m.unit,
    c.name,
    t.in_order_costs,
    -SUM(t.delta),
    CASE WHEN f.can_fin THEN -SUM(t.delta) * COALESCE(m.unit_cost, 0) END
  FROM public.k24_material_transactions t
  JOIN public.k24_materials m ON m.id = t.material_id
  LEFT JOIN public.k24_warehouse_categories c ON c.id = m.category_id
  CROSS JOIN (SELECT public.k24_user_can('view:finance') AS can_fin OFFSET 0) f
  WHERE auth.uid() IS NOT NULL
    AND t.order_id = ANY (p_order_ids)
    AND t.in_order_costs IS NOT NULL
    AND COALESCE(t.reservation_status, 'consumed') = 'consumed'
    AND (p_from IS NULL OR t.created_at >= p_from)
    AND (p_to IS NULL OR t.created_at <= p_to)
  GROUP BY t.order_id, t.material_id, m.name, m.unit, c.name, t.in_order_costs, m.unit_cost, f.can_fin
  HAVING SUM(t.delta) <> 0
$$;
REVOKE ALL ON FUNCTION public.order_extra_materials(uuid[], timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.order_extra_materials(uuid[], timestamptz, timestamptz) TO authenticated;

-- ===========================================================================
-- Проверки после применения (READ-ONLY):
--
-- -- сид отметок (ожидаем: печать → print/true, ламинация → lamination/true,
-- -- химия и коробки → count_in_costs=true, остальные — false/false):
-- SELECT name, show_in_order, order_field, consume_stage, count_in_costs
--   FROM k24_warehouse_categories ORDER BY sort_order;
-- -- новые колонки операций читаются, денежные — нет:
-- SELECT column_name FROM information_schema.column_privileges
--  WHERE grantee = 'authenticated' AND privilege_type = 'SELECT'
--    AND table_name = 'k24_material_transactions'
--    AND column_name IN ('production_log_id','in_order_costs','total_cost','unit_cost');
--    -- ожидаем 2 строки: production_log_id, in_order_costs
-- -- anon без доступа к новой таблице:
-- SELECT privilege_type FROM information_schema.table_privileges
--  WHERE table_name = 'k24_order_materials' AND grantee = 'anon';   -- 0 строк
-- -- все логи получили пустой объект:
-- SELECT count(*) FROM k24_production_logs WHERE extra_consumption <> '{}'::jsonb;  -- 0
-- -- функция списания содержит обе правки:
-- SELECT prosrc LIKE '%production_log_id%' AND prosrc LIKE '%extra_consumption%'
--   FROM pg_proc WHERE proname = 'deduct_materials_from_log';           -- true
-- ===========================================================================
