-- ============================================================
-- R25.1 (ТЗ 17.11, Фаза 1) — «Путь заказа v2»
-- ============================================================
-- Аддитивная и идемпотентная миграция (можно прогнать повторно):
--   1. k24_orders.route_version — 1 у всех существующих заказов, 2 — default
--      для новых. getOrderRoute(order) для v1 работает ровно как раньше.
--      + GRANT SELECT (нефинансовая колонка) + view k24_orders_full (в конец).
--      + route_version защищён k24_protect_order_columns (от неё зависит
--        оплата упаковки — воркер не должен переключать версию).
--   2. k24_order_status_history: note text + kind text (CHECK) — пометки
--      «пропущен вручную», «оплата отмечена при приёме», «запущен без оплаты»,
--      «возврат в дизайн», откаты.
--   3. check_stage_completion v6: новые этапы без ввода → «готово».
--      Остальные ветки — копия v5 (091) без изменений.
--   4. fn_block_done_with_open_reprints v2: для route_version=2 запрет
--      срабатывает на ВЫХОДЕ с otk (вперёд); для v1 — как раньше (вход в done).
--   5. Сид прав (Приложение В.1): stage:awaiting_payment, stage:design_approval,
--      stage:subcontract, stage:awaiting_pickup, stage:delivery, view:sales —
--      admin/manager = true, остальные роли = false. ON CONFLICT DO NOTHING —
--      повторный прогон не перетирает ручные настройки из «Прав ролей».
--
-- Статусы awaiting_payment / design_approval / subcontract / awaiting_pickup /
-- delivery — новые значения k24_orders.status (CHECK на статус в базе нет).
--
-- Rollback (данные не теряются):
--   ALTER TABLE k24_orders ALTER COLUMN route_version DROP NOT NULL,
--     ALTER COLUMN route_version DROP DEFAULT;  -- колонку оставить
--   пересоздать check_stage_completion из 091, fn_block_done_with_open_reprints
--   из 081, k24_protect_order_columns из 074.

-- ── 1. route_version ─────────────────────────────────────────
-- ADD COLUMN c константным DEFAULT 1 — metadata-only (PG11+): существующие
-- строки получают 1 без UPDATE и без срабатывания триггеров k24_orders
-- (audit / protect / sync). Затем default переключаем на 2 — новые заказы
-- (форма, Bitrix-webhook) создаются по маршруту v2.
ALTER TABLE public.k24_orders
  ADD COLUMN IF NOT EXISTS route_version INTEGER DEFAULT 1;

-- Страховка на случай, если колонка уже существовала nullable (частичный
-- прогон): у всех строк без версии — v1. В обычном прогоне 0 строк.
UPDATE public.k24_orders SET route_version = 1 WHERE route_version IS NULL;

ALTER TABLE public.k24_orders ALTER COLUMN route_version SET DEFAULT 2;
ALTER TABLE public.k24_orders ALTER COLUMN route_version SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'k24_orders_route_version_check'
       AND conrelid = 'public.k24_orders'::regclass
  ) THEN
    ALTER TABLE public.k24_orders
      ADD CONSTRAINT k24_orders_route_version_check CHECK (route_version >= 1);
  END IF;
END $$;

COMMENT ON COLUMN public.k24_orders.route_version IS
  'R25.1: версия маршрута. 1 — заказы до релиза фазы 1 (getOrderRoute v1), 2 — новые (этапы ОП, ТК → Ждёт выдачи, обязательная упаковка).';

-- Нефинансовая колонка → колоночный GRANT (после 072 табличной SELECT нет).
GRANT SELECT (route_version) ON public.k24_orders TO authenticated;

-- View: копия 071 + route_version в конце списка (CREATE OR REPLACE VIEW
-- допускает только добавление колонок в конец).
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
  o.route_version
FROM k24_orders o;

-- Привилегии view сохраняются при CREATE OR REPLACE; повторяем явно (как 071).
REVOKE ALL ON public.k24_orders_full FROM PUBLIC, anon;
GRANT SELECT ON public.k24_orders_full TO authenticated;

-- route_version влияет на оплату упаковки → воркеры не меняют. Полный текст
-- 074 + одна строка (admin/manager проходят как раньше).
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
  THEN
    RAISE EXCEPTION 'Access denied: workers cannot modify protected order fields';
  END IF;

  RETURN NEW;
END;
$$;

-- ── 2. k24_order_status_history: note + kind ─────────────────
ALTER TABLE public.k24_order_status_history
  ADD COLUMN IF NOT EXISTS note TEXT,
  ADD COLUMN IF NOT EXISTS kind TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'k24_order_status_history_kind_check'
       AND conrelid = 'public.k24_order_status_history'::regclass
  ) THEN
    ALTER TABLE public.k24_order_status_history
      ADD CONSTRAINT k24_order_status_history_kind_check CHECK (
        kind IS NULL OR kind IN (
          'manual_skip',      -- «Перейти на этап» (StageJumper): этап пропущен вручную
          'paid_at_intake',   -- «Ждёт оплаты» пройден автоматически: оплата отмечена при приёме
          'payment_received', -- «Оплата получена → далее»
          'no_payment',       -- «Запущен без оплаты»
          'design_return',    -- «Вернуть в дизайн» (комментарий в note)
          'rollback'          -- откат на пройденный этап
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.k24_order_status_history.kind IS
  'R25.1: тип перехода (manual_skip / paid_at_intake / payment_received / no_payment / design_return / rollback). NULL — обычное продвижение.';
COMMENT ON COLUMN public.k24_order_status_history.note IS
  'R25.1: комментарий к переходу (способ оплаты, «что исправить» и т.п.).';

-- ── 3. check_stage_completion v6 ─────────────────────────────
-- Единственное изменение относительно v5 (091): новые этапы без полей ввода
-- (awaiting_payment, design_approval, subcontract, awaiting_pickup, delivery)
-- добавлены в ветку «готово».
CREATE OR REPLACE FUNCTION public.check_stage_completion(p_order_id uuid, p_stage text, p_track text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_target INT;
  v_total NUMERIC;
  v_defects NUMERIC;
  v_has_sample BOOLEAN;
  v_order_type TEXT;
  v_design_variants INT;
  v_stickers_per_pack INT;
  v_designs_total INT;
  v_designs_ready INT;
  v_items_count INT;
  v_items_qty INT;
BEGIN
  SELECT qty, order_type, design_variants, stickers_per_pack
    INTO v_target, v_order_type, v_design_variants, v_stickers_per_pack
    FROM k24_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Order not found'); END IF;

  SELECT COUNT(*), COALESCE(SUM(qty), 0) INTO v_items_count, v_items_qty
    FROM k24_order_items WHERE order_id = p_order_id;
  IF v_items_count > 1 THEN v_target := v_items_qty; END IF;

  IF p_stage IN ('sample_layout', 'color_approval', 'batch_layout', 'drying',
                 'awaiting_payment', 'design_approval', 'subcontract',
                 'awaiting_pickup', 'delivery') THEN
    RETURN json_build_object('total', 0, 'target', v_target, 'is_complete', true);

  ELSIF p_stage = 'sample_print' THEN
    SELECT EXISTS (
      SELECT 1 FROM k24_order_attachments
      WHERE order_id = p_order_id AND kind = 'sample_print'
    ) INTO v_has_sample;
    RETURN json_build_object('total', CASE WHEN v_has_sample THEN 1 ELSE 0 END,
                              'target', 1, 'is_complete', v_has_sample);

  ELSIF p_stage = 'prepress' THEN
    IF v_order_type = 'stickerpack3D' THEN
      SELECT COUNT(*), COUNT(*) FILTER (WHERE COALESCE(qty_planned, 0) > 0)
        INTO v_designs_total, v_designs_ready
        FROM k24_pack_designs WHERE order_id = p_order_id;
      RETURN json_build_object(
        'total', COALESCE(v_designs_ready, 0),
        'target', COALESCE(v_designs_total, 0),
        'is_complete', COALESCE(v_designs_total, 0) > 0
                        AND COALESCE(v_designs_ready, 0) >= COALESCE(v_designs_total, 0)
      );
    ELSE
      SELECT COALESCE(SUM(prepared_qty), 0) INTO v_total
        FROM k24_production_logs
        WHERE order_id = p_order_id AND stage = 'prepress' AND deleted_at IS NULL;
      RETURN json_build_object(
        'total', v_total,
        'target', GREATEST(1, COALESCE(v_design_variants, 1)),
        'is_complete', v_total >= GREATEST(1, COALESCE(v_design_variants, 1))
      );
    END IF;

  ELSIF p_stage = 'selection' THEN
    SELECT COALESCE(SUM(qty_selected), 0) INTO v_total
    FROM k24_production_logs
    WHERE order_id = p_order_id AND deleted_at IS NULL
      AND (stage = 'selection' OR (stage = 'selection_pouring' AND (track IS NULL OR track = 'backgrounds')));

  ELSIF p_stage = 'print' THEN
    IF p_track = 'backgrounds' THEN
      SELECT COALESCE(SUM(backgrounds_printed), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'print' AND track = 'backgrounds' AND deleted_at IS NULL;
    ELSIF p_track = 'stickers' THEN
      SELECT COALESCE(SUM(stickers_printed), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'print' AND track = 'stickers' AND deleted_at IS NULL;
    ELSE
      SELECT COALESCE(SUM(stickers_printed), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'print' AND deleted_at IS NULL;
    END IF;
  ELSIF p_stage = 'lamination' THEN
    SELECT COALESCE(SUM(lamination_meters), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'lamination' AND deleted_at IS NULL;
    RETURN json_build_object('total', v_total, 'target', v_target, 'is_complete', v_total > 0);

  -- R22.7: резка — брак уменьшает завершение (годные = нарезано − брак).
  ELSIF p_stage = 'cutting' THEN
    IF p_track IS NOT NULL THEN
      SELECT COALESCE(SUM(qty_cut), 0), COALESCE(SUM(defects), 0) INTO v_total, v_defects
        FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'cutting' AND track = p_track AND deleted_at IS NULL;
    ELSE
      SELECT COALESCE(SUM(qty_cut), 0), COALESCE(SUM(defects), 0) INTO v_total, v_defects
        FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'cutting' AND deleted_at IS NULL;
    END IF;
    v_total := GREATEST(0, v_total - v_defects);

  -- R23.6: заливка stickerpack3D — считается в стикерах, таргет тоже в стикерах.
  ELSIF p_stage = 'pouring' THEN
    SELECT COALESCE(SUM(stickers_good), 0) INTO v_total
    FROM k24_production_logs
    WHERE order_id = p_order_id AND deleted_at IS NULL
      AND (stage = 'pouring' OR (stage = 'selection_pouring' AND (track IS NULL OR track = 'stickers')));
    IF v_order_type = 'stickerpack3D' THEN
      v_target := v_target * GREATEST(1, COALESCE(v_stickers_per_pack, 1));
    END IF;
  ELSIF p_stage = 'selection_pouring' THEN
    IF p_track = 'backgrounds' THEN
      SELECT COALESCE(SUM(qty_selected), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'selection_pouring' AND track = 'backgrounds' AND deleted_at IS NULL;
    ELSIF p_track = 'stickers' THEN
      SELECT COALESCE(SUM(stickers_good), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'selection_pouring' AND track = 'stickers' AND deleted_at IS NULL;
    ELSE
      SELECT COALESCE(SUM(qty_selected), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'selection_pouring' AND deleted_at IS NULL;
    END IF;
  ELSIF p_stage = 'assembly_3d' THEN
    SELECT COALESCE(SUM(packs_assembled), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'assembly_3d' AND deleted_at IS NULL;
  ELSIF p_stage = 'packaging' THEN
    SELECT COALESCE(SUM(packs_packaged), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'packaging' AND deleted_at IS NULL;
  ELSE
    v_total := 0;
  END IF;

  RETURN json_build_object('total', v_total, 'target', v_target, 'is_complete', v_total >= v_target);
END;
$function$;

-- ── 4. fn_block_done_with_open_reprints v2 ───────────────────
-- v1 (route_version = 1): как в 081 — запрет на вход в done.
-- v2: запрет на выход с otk ВПЕРЁД (в awaiting_pickup / delivery / done) —
--     допечатанные изделия проходят ТК вместе с заказом. Откат с otk назад
--     (на производственный этап) и отмена (cancelled) не блокируются.
--     Прыжок в done в обход otk (force) для v2 тоже блокируется.
CREATE OR REPLACE FUNCTION public.fn_block_done_with_open_reprints()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_check BOOLEAN := false;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.route_version, 1) >= 2 THEN
    v_check := (OLD.status = 'otk' AND NEW.status IN ('awaiting_pickup', 'delivery', 'done'))
            OR (NEW.status = 'done');
  ELSE
    v_check := (NEW.status = 'done');
  END IF;

  IF v_check AND EXISTS (
    SELECT 1 FROM k24_order_subtasks
     WHERE order_id = NEW.id
       AND track = 'reprint'
       AND NOT is_legacy
       AND status <> 'done'
  ) THEN
    RAISE EXCEPTION 'REPRINTS_NOT_DONE';
  END IF;

  RETURN NEW;
END;
$function$;

-- Триггер из 081 (BEFORE UPDATE OF status) остаётся — функция заменена in place.
DROP TRIGGER IF EXISTS trg_block_done_with_open_reprints ON public.k24_orders;
CREATE TRIGGER trg_block_done_with_open_reprints
  BEFORE UPDATE OF status ON public.k24_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_block_done_with_open_reprints();

-- ── 5. Сид прав (Приложение В.1, фаза 1) ─────────────────────
INSERT INTO public.k24_role_permissions (role, permission, allowed)
SELECT r.role, p.permission, r.role IN ('admin', 'manager')
  FROM (VALUES ('admin'), ('manager'), ('designer'), ('printer'), ('post_printer')) AS r(role)
 CROSS JOIN (VALUES
   ('stage:awaiting_payment'),
   ('stage:design_approval'),
   ('stage:subcontract'),
   ('stage:awaiting_pickup'),
   ('stage:delivery'),
   ('view:sales')
 ) AS p(permission)
ON CONFLICT (role, permission) DO NOTHING;
