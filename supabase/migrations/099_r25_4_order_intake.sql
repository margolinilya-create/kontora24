-- ============================================================
-- R25.4 (ТЗ 17.11, Фаза 4) — «Заведение заказа»
-- ============================================================
-- Аддитивная и идемпотентная миграция (можно прогнать повторно):
--   1. k24_contractors — справочник подрядчиков (архив через archived_at,
--      уникальность названия без учёта регистра). RLS: чтение всем
--      authenticated, запись — по праву contractor:manage (L2 RBAC).
--   2. k24_orders: product_name («Прочее»), is_subcontract, contractor_id
--      (FK RESTRICT — подрядчика с заказами удалить нельзя, только архив),
--      contractor_notes, contractor_cost (ФИНАНСОВАЯ — без GRANT, маскируется
--      во view), montage_material_id (FK на k24_materials).
--      Нефинансовые → колоночный GRANT; все шесть → в конец k24_orders_full.
--      k24_protect_order_columns: + contractor_cost, is_subcontract.
--   3. k24_production_logs.montage_meters + ветка списания монтажной плёнки в
--      deduct_materials_from_log (тело 096 дословно + одна ветка).
--   4. design_status='needs_edit' — CHECK на колонке нет, только комментарий.
--      planning:norms.design_edit_days = 1 (jsonb merge, существующее не трогаем).
--   5. Сид права contractor:manage (admin, manager).
--   order_type='other' — CHECK на колонке нет (тип живёт в константах фронта).
--
-- Порядок: применить 099 ДО деплоя фронта R25.4 (фронт выбирает новые колонки).
--
-- Rollback (данные не теряются): пересоздать deduct_materials_from_log из 096,
--   k24_protect_order_columns из 093; колонки/таблицу оставить.

-- ── 1. Справочник подрядчиков ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.k24_contractors (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  specialization TEXT,
  contact_person TEXT,
  phone          TEXT,
  contact        TEXT,          -- почта или мессенджер
  notes          TEXT,
  archived_at    TIMESTAMPTZ,
  created_by     UUID REFERENCES public.k24_profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_k24_contractors_name_ci
  ON public.k24_contractors (lower(btrim(name)));

COMMENT ON TABLE public.k24_contractors IS
  'R25.4: справочник подрядчиков (субподряд). archived_at — не предлагается в новых заказах, остаётся в старых.';

ALTER TABLE public.k24_contractors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contractors_select ON public.k24_contractors;
CREATE POLICY contractors_select ON public.k24_contractors
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS contractors_write ON public.k24_contractors;
CREATE POLICY contractors_write ON public.k24_contractors
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM k24_profiles p
      JOIN k24_role_permissions rp ON rp.role = p.role
      WHERE p.id = auth.uid() AND rp.permission = 'contractor:manage' AND rp.allowed
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM k24_profiles p
      JOIN k24_role_permissions rp ON rp.role = p.role
      WHERE p.id = auth.uid() AND rp.permission = 'contractor:manage' AND rp.allowed
    )
  );

REVOKE ALL ON public.k24_contractors FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.k24_contractors TO authenticated;

-- ── 2. Новые колонки k24_orders ──────────────────────────────
ALTER TABLE public.k24_orders
  ADD COLUMN IF NOT EXISTS product_name        TEXT,
  ADD COLUMN IF NOT EXISTS is_subcontract      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contractor_id       UUID REFERENCES public.k24_contractors(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS contractor_notes    TEXT,
  ADD COLUMN IF NOT EXISTS contractor_cost     NUMERIC,
  ADD COLUMN IF NOT EXISTS montage_material_id UUID REFERENCES public.k24_materials(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'k24_orders_product_name_len_check'
       AND conrelid = 'public.k24_orders'::regclass
  ) THEN
    ALTER TABLE public.k24_orders
      ADD CONSTRAINT k24_orders_product_name_len_check
      CHECK (product_name IS NULL OR char_length(product_name) <= 100);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'k24_orders_contractor_cost_check'
       AND conrelid = 'public.k24_orders'::regclass
  ) THEN
    ALTER TABLE public.k24_orders
      ADD CONSTRAINT k24_orders_contractor_cost_check
      CHECK (contractor_cost IS NULL OR contractor_cost >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_k24_orders_contractor_id
  ON public.k24_orders (contractor_id) WHERE contractor_id IS NOT NULL;

COMMENT ON COLUMN public.k24_orders.product_name IS
  'R25.4: название продукции для order_type=''other'' («Магниты»). formatOrderType() показывает его вместо «Прочее».';
COMMENT ON COLUMN public.k24_orders.is_subcontract IS
  'R25.4: заказ на субподряде — маршрут v2 ROUTE_SUBCONTRACT_V2 (этапы цеха уходят).';
COMMENT ON COLUMN public.k24_orders.contractor_cost IS
  'R25.4: стоимость работ подрядчика, ₽. ФИНАНСОВАЯ: без GRANT authenticated, читать через k24_orders_full.';
COMMENT ON COLUMN public.k24_orders.montage_material_id IS
  'R25.4: позиция склада монтажной плёнки (material_code=''transfer''). Флаг — needs_montage_film.';
COMMENT ON COLUMN public.k24_orders.design_status IS
  'provided / needs_development / needs_edit (R25.4 — правка макета, этап «Дизайн» остаётся в маршруте).';

-- Нефинансовые колонки → колоночный GRANT (после 072 табличной SELECT нет).
-- contractor_cost — финансовая: GRANT НЕ выдаём.
GRANT SELECT (product_name, is_subcontract, contractor_id, contractor_notes, montage_material_id)
  ON public.k24_orders TO authenticated;

-- View: копия 093 + шесть колонок в конце (CREATE OR REPLACE VIEW допускает
-- только добавление колонок в конец). contractor_cost маскируется как price_final.
CREATE OR REPLACE VIEW public.k24_orders_full AS
SELECT
  o.id,
  o.number,
  o.client_id,
  o.order_type,
  o.status,
  o.width_mm,
  o.height_mm,
  o.qty,
  o.design_variants,
  o.need_lam,
  o.lam_type,
  CASE WHEN EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role WHERE p.id = auth.uid() AND rp.permission = 'view:finance' AND rp.allowed) THEN o.cost_materials END AS cost_materials,
  CASE WHEN EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role WHERE p.id = auth.uid() AND rp.permission = 'view:finance' AND rp.allowed) THEN o.cost_labor END AS cost_labor,
  CASE WHEN EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role WHERE p.id = auth.uid() AND rp.permission = 'view:finance' AND rp.allowed) THEN o.cost_total END AS cost_total,
  CASE WHEN EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role WHERE p.id = auth.uid() AND rp.permission = 'view:finance' AND rp.allowed) THEN o.markup END AS markup,
  CASE WHEN EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role WHERE p.id = auth.uid() AND rp.permission = 'view:finance' AND rp.allowed) THEN o.discount_pct END AS discount_pct,
  CASE WHEN EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role WHERE p.id = auth.uid() AND rp.permission = 'view:finance' AND rp.allowed) THEN o.price_final END AS price_final,
  CASE WHEN EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role WHERE p.id = auth.uid() AND rp.permission = 'view:finance' AND rp.allowed) THEN o.price_per_unit END AS price_per_unit,
  o.prod_days,
  o.assigned_to,
  o.created_by,
  o.deadline,
  o.notes,
  o.created_at,
  o.updated_at,
  o.bitrix_deal_id,
  o.bitrix_url,
  o.priority,
  o.checklist,
  o.status_changed_at,
  o.film_type,
  o.stickers_per_pack,
  o.is_3d,
  o.mockup_path,
  o.is_urgent,
  o.is_partner,
  o.needs_montage_film,
  o.needs_individual_cut,
  o.printed_meters,
  o.resin_used,
  o.rejected_qty,
  o.printed_qty,
  o.deal_name,
  o.source,
  o.source_referrer,
  o.payment_status,
  o.design_status,
  o.delivery_type,
  o.delivery_city,
  o.delivery_address,
  o.delivery_notes,
  o.bopp_bag,
  o.custom_number,
  o.film_type_stickers,
  o.ink_deducted_at,
  o.drying_started_at,
  o.film_material_id,
  o.film_stickers_material_id,
  o.lam_material_id,
  o.sticker_shape,
  o.route_version,
  o.product_name,
  o.is_subcontract,
  o.contractor_id,
  o.contractor_notes,
  CASE WHEN EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role WHERE p.id = auth.uid() AND rp.permission = 'view:finance' AND rp.allowed) THEN o.contractor_cost END AS contractor_cost,
  o.montage_material_id
FROM k24_orders o;

REVOKE ALL ON public.k24_orders_full FROM PUBLIC, anon;
GRANT SELECT ON public.k24_orders_full TO authenticated;

-- Полный текст 093 + contractor_cost / is_subcontract (admin/manager проходят как раньше).
CREATE OR REPLACE FUNCTION public.k24_protect_order_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM k24_profiles WHERE id = auth.uid();

  -- Admin and manager can change anything
  IF v_role IN ('admin', 'manager') THEN
    RETURN NEW;
  END IF;

  -- Workers can only change: status, assigned_to, checklist, updated_at
  -- Block changes to financial and deal fields
  IF NEW.price_final IS DISTINCT FROM OLD.price_final
    OR NEW.cost_total IS DISTINCT FROM OLD.cost_total
    OR NEW.cost_materials IS DISTINCT FROM OLD.cost_materials
    OR NEW.cost_labor IS DISTINCT FROM OLD.cost_labor
    OR NEW.markup IS DISTINCT FROM OLD.markup
    OR NEW.discount_pct IS DISTINCT FROM OLD.discount_pct
    OR NEW.price_per_unit IS DISTINCT FROM OLD.price_per_unit
    OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
    OR NEW.deal_name IS DISTINCT FROM OLD.deal_name
    OR NEW.bitrix_deal_id IS DISTINCT FROM OLD.bitrix_deal_id
    OR NEW.qty IS DISTINCT FROM OLD.qty
    OR NEW.order_type IS DISTINCT FROM OLD.order_type
    OR NEW.client_id IS DISTINCT FROM OLD.client_id
    OR NEW.deadline IS DISTINCT FROM OLD.deadline
    OR NEW.priority IS DISTINCT FROM OLD.priority
    -- 074: форма стикера определяет ставку заливки — воркерам нельзя.
    OR NEW.sticker_shape IS DISTINCT FROM OLD.sticker_shape
    -- 093: версия маршрута определяет оплату упаковки — воркерам нельзя.
    OR NEW.route_version IS DISTINCT FROM OLD.route_version
    -- 099: стоимость подрядчика — финансовая; субподряд меняет маршрут.
    OR NEW.contractor_cost IS DISTINCT FROM OLD.contractor_cost
    OR NEW.is_subcontract IS DISTINCT FROM OLD.is_subcontract
  THEN
    RAISE EXCEPTION 'Access denied: workers cannot modify protected order fields';
  END IF;

  RETURN NEW;
END;
$$;

-- ── 3. Монтажная плёнка в логах учёта ───────────────────────
ALTER TABLE public.k24_production_logs
  ADD COLUMN IF NOT EXISTS montage_meters NUMERIC NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.k24_production_logs.montage_meters IS
  'R25.4: расход монтажной плёнки, м (этап «Ламинация»). Списывается с k24_orders.montage_material_id.';

-- deduct_materials_from_log — тело 096 ДОСЛОВНО + ветка montage_meters.
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
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by, kind, is_auto, op_date)
      VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: плёнка', v_user,
              CASE WHEN v_delta > 0 THEN 'order_consumption' ELSE 'correction' END, true,
              (now() AT TIME ZONE 'Europe/Moscow')::date);
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
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by, kind, is_auto, op_date)
      VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: ламинация', v_user,
              CASE WHEN v_delta > 0 THEN 'order_consumption' ELSE 'correction' END, true,
              (now() AT TIME ZONE 'Europe/Moscow')::date);
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
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by, kind, is_auto, op_date)
      VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: монтажная плёнка', v_user,
              CASE WHEN v_delta > 0 THEN 'order_consumption' ELSE 'correction' END, true,
              (now() AT TIME ZONE 'Europe/Moscow')::date);
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
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by, kind, is_auto, op_date)
      VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: смола', v_user,
              CASE WHEN v_delta > 0 THEN 'order_consumption' ELSE 'correction' END, true,
              (now() AT TIME ZONE 'Europe/Moscow')::date);
      UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_material_id;
    END IF;
  END IF;

  -- R24: БОПП-пакеты — списываем по количеству упакованного (packs_packaged).
  -- Материал берём из NEW (или OLD при DELETE-реверсе). Дельта NEW−OLD.
  v_material_id := COALESCE(v_new_bag_mid, v_old_bag_mid);
  v_delta := v_new_bag - v_old_bag;
  IF v_material_id IS NOT NULL AND v_delta <> 0 THEN
    INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by, kind, is_auto, op_date)
    VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: БОПП-пакет', v_user,
            CASE WHEN v_delta > 0 THEN 'order_consumption' ELSE 'correction' END, true,
            (now() AT TIME ZONE 'Europe/Moscow')::date);
    UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_material_id;
  END IF;

  -- R24: коробки — списываем по введённому числу (boxes_used).
  v_material_id := COALESCE(v_new_box_mid, v_old_box_mid);
  v_delta := v_new_box - v_old_box;
  IF v_material_id IS NOT NULL AND v_delta <> 0 THEN
    INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by, kind, is_auto, op_date)
    VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: коробка', v_user,
            CASE WHEN v_delta > 0 THEN 'order_consumption' ELSE 'correction' END, true,
            (now() AT TIME ZONE 'Europe/Moscow')::date);
    UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_material_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ── 4. Правка макета: норматив планировщика ──────────────────
-- jsonb merge: добавляем design_edit_days только если ключа ещё нет.
UPDATE public.k24_settings
   SET value = value || jsonb_build_object('design_edit_days', 1)
 WHERE key = 'planning:norms'
   AND jsonb_typeof(value) = 'object'
   AND NOT (value ? 'design_edit_days');

-- ── 5. Сид права contractor:manage (Приложение В.1) ──────────
INSERT INTO public.k24_role_permissions (role, permission, allowed)
SELECT r.role, 'contractor:manage', r.role IN ('admin', 'manager')
  FROM (VALUES ('admin'), ('manager'), ('designer'), ('printer'), ('post_printer')) AS r(role)
ON CONFLICT (role, permission) DO NOTHING;
