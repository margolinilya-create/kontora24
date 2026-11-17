-- ============================================================
-- R25.7D (ТЗ 17.11, Фаза 7.4, 7.8) — свои этапы производства
-- ============================================================
-- Аддитивная и идемпотентная миграция (можно прогнать повторно). Требует 102
-- (k24_stage_defs) и 103 (route_snapshot).
--   1. k24_production_logs.qty_done INT NOT NULL DEFAULT 0 CHECK >= 0 —
--      «Выполнено, шт» своих этапов (custom_<N>). Табличные гранты
--      k24_production_logs не колоночные — GRANT не нужен (как 094).
--   2. CHECK defect_stage (094) расширен: тип брака ТК — встроенный этап
--      (print/lamination/cutting/pouring) ИЛИ свой этап ^custom_[0-9]+$.
--      DROP + ADD NOT VALID + VALIDATE (все старые строки проходят).
--   3. RPC каталога этапов (право order_type:manage):
--        create_stage_def(name, department, roles[], norm, show_in_menu, otk_defect)
--          → ключ custom_<N> (sequence 102), сид прав stage:custom_<N> для 5 ролей
--          (admin, manager + перечисленные роли = true, остальные false);
--        update_stage_def(key, p jsonb) — название/отдел/норма/меню/ТК/порядок/роли;
--        archive_stage_def(key, archived bool);
--        delete_stage_def(key) — только неиспользуемый этап (нет в снимках
--          заказов, статусах заказов/допечаток, логах, маршрутах типов).
--   4. check_stage_completion v8 = тело v7 (099) ДОСЛОВНО + ветка своих этапов:
--      GREATEST(0, SUM(qty_done) − SUM(defects)) против тиража.
--   5. auto_advance_drying v4: следующий этап после «Сушки» — из
--      route_snapshot.stages заказа (с правилами заказа: ламинация по флагу,
--      доставка, макет от клиента), иначе прежняя логика 083. Для встроенных
--      типов результат тот же (после сушки — selection / assembly_3d).
--      Тела ветки подзадач — как в 083.
--
-- Порядок: 102 → 103 → 104 → деплой фронта R25.7C/D (фронт без 104 работает:
-- каталог этапов пуст, форма своего этапа не встречается; RPC каталога
-- отвечают 404 → toast).
--
-- Rollback (данные логов не теряются):
--   DROP FUNCTION IF EXISTS public.create_stage_def(text, text, text[], numeric, boolean, boolean);
--   DROP FUNCTION IF EXISTS public.update_stage_def(text, jsonb);
--   DROP FUNCTION IF EXISTS public.archive_stage_def(text, boolean);
--   DROP FUNCTION IF EXISTS public.delete_stage_def(text);
--   пересоздать check_stage_completion из 099, auto_advance_drying из 083,
--   CHECK defect_stage из 094 (только если нет строк с custom_*);
--   колонку qty_done оставить.

BEGIN;

-- ── 1. Колонка «Выполнено» своих этапов ─────────────────────
ALTER TABLE public.k24_production_logs
  ADD COLUMN IF NOT EXISTS qty_done INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'k24_production_logs_qty_done_check'
       AND conrelid = 'public.k24_production_logs'::regclass
  ) THEN
    ALTER TABLE public.k24_production_logs
      ADD CONSTRAINT k24_production_logs_qty_done_check CHECK (qty_done >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.k24_production_logs.qty_done IS
  'R25.7: «Выполнено, шт» на своём этапе (stage = custom_<N>). Прогресс = qty_done − defects.';

-- ── 2. Тип брака ТК: + свои этапы ───────────────────────────
ALTER TABLE public.k24_production_logs
  DROP CONSTRAINT IF EXISTS k24_production_logs_defect_stage_check;
ALTER TABLE public.k24_production_logs
  ADD CONSTRAINT k24_production_logs_defect_stage_check
  CHECK (
    defect_stage IS NULL
    OR (stage = 'otk' AND (
      defect_stage IN ('print', 'lamination', 'cutting', 'pouring')
      OR defect_stage ~ '^custom_[0-9]+$'
    ))
  ) NOT VALID;
ALTER TABLE public.k24_production_logs
  VALIDATE CONSTRAINT k24_production_logs_defect_stage_check;

-- ── 3. RPC каталога своих этапов ────────────────────────────
-- Роли, которым можно выдать этап (admin и manager получают право всегда).
CREATE OR REPLACE FUNCTION public.k24_seed_stage_permissions(p_key TEXT, p_roles TEXT[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  INSERT INTO k24_role_permissions (role, permission, allowed, updated_at, updated_by)
  SELECT r.role,
         'stage:' || p_key,
         r.role IN ('admin', 'manager') OR r.role = ANY (COALESCE(p_roles, ARRAY[]::TEXT[])),
         now(),
         v_uid
    FROM (VALUES ('admin'), ('manager'), ('designer'), ('printer'), ('post_printer')) AS r(role)
  ON CONFLICT (role, permission) DO UPDATE
    SET allowed    = EXCLUDED.allowed,
        updated_at = EXCLUDED.updated_at,
        updated_by = EXCLUDED.updated_by;
END;
$function$;

REVOKE ALL ON FUNCTION public.k24_seed_stage_permissions(TEXT, TEXT[]) FROM PUBLIC, anon, authenticated;

-- Общая проверка полей этапа. Возвращает текст ошибки или NULL.
CREATE OR REPLACE FUNCTION public.k24_validate_stage_def(
  p_key TEXT, p_name TEXT, p_department TEXT, p_roles TEXT[], p_norm NUMERIC
) RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RETURN 'Укажите название этапа.';
  END IF;
  IF char_length(btrim(p_name)) > 60 THEN
    RETURN 'Название этапа — не длиннее 60 символов.';
  END IF;
  IF p_department IS NULL OR p_department NOT IN ('sales', 'prepress', 'print', '3d', 'osk') THEN
    RETURN 'Выберите отдел этапа.';
  END IF;
  IF p_norm IS NOT NULL AND p_norm <= 0 THEN
    RETURN 'Норма должна быть больше нуля (или пусто).';
  END IF;
  IF p_roles IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(p_roles) r
     WHERE r NOT IN ('admin', 'manager', 'designer', 'printer', 'post_printer')
  ) THEN
    RETURN 'Неизвестная роль исполнителя.';
  END IF;
  -- Имя не должно совпадать со своим этапом (UNIQUE) — проверяем заранее для
  -- понятной ошибки; совпадение со встроенным этапом допускаем (ключи разные).
  IF EXISTS (SELECT 1 FROM k24_stage_defs
              WHERE lower(btrim(name)) = lower(btrim(p_name))
                AND key IS DISTINCT FROM p_key) THEN
    RETURN 'Этап с таким названием уже есть.';
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.k24_validate_stage_def(TEXT, TEXT, TEXT, TEXT[], NUMERIC) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_stage_def(
  p_name         TEXT,
  p_department   TEXT,
  p_roles        TEXT[]  DEFAULT ARRAY[]::TEXT[],
  p_norm         NUMERIC DEFAULT NULL,
  p_show_in_menu BOOLEAN DEFAULT true,
  p_otk_defect   BOOLEAN DEFAULT true
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_err TEXT;
  v_row k24_stage_defs%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Сессия не активна. Войдите заново.');
  END IF;
  IF NOT public.k24_user_can('order_type:manage') THEN
    RETURN json_build_object('ok', false, 'error', 'Нет права настраивать этапы.');
  END IF;

  v_err := public.k24_validate_stage_def(NULL, p_name, p_department, p_roles, p_norm);
  IF v_err IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'error', v_err);
  END IF;

  INSERT INTO k24_stage_defs (name, department, norm_per_8h, show_in_menu, otk_defect, sort_order, updated_by)
  VALUES (
    btrim(p_name), p_department, p_norm,
    COALESCE(p_show_in_menu, true), COALESCE(p_otk_defect, true),
    COALESCE((SELECT max(sort_order) FROM k24_stage_defs), 0) + 10,
    v_uid
  )
  RETURNING * INTO v_row;

  PERFORM public.k24_seed_stage_permissions(v_row.key, p_roles);

  RETURN json_build_object('ok', true, 'stage', to_jsonb(v_row));
END;
$function$;

REVOKE ALL ON FUNCTION public.create_stage_def(TEXT, TEXT, TEXT[], NUMERIC, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_stage_def(TEXT, TEXT, TEXT[], NUMERIC, BOOLEAN, BOOLEAN) TO authenticated;

-- p: { name?, department?, norm_per_8h? (null = без нормы), show_in_menu?,
--      otk_defect?, sort_order?, roles?: text[] } — меняются только переданные ключи.
CREATE OR REPLACE FUNCTION public.update_stage_def(p_key TEXT, p JSONB)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid   UUID := auth.uid();
  v_cur   k24_stage_defs%ROWTYPE;
  v_name  TEXT;
  v_dept  TEXT;
  v_norm  NUMERIC;
  v_roles TEXT[];
  v_err   TEXT;
  v_row   k24_stage_defs%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Сессия не активна. Войдите заново.');
  END IF;
  IF NOT public.k24_user_can('order_type:manage') THEN
    RETURN json_build_object('ok', false, 'error', 'Нет права настраивать этапы.');
  END IF;
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RETURN json_build_object('ok', false, 'error', 'Некорректные данные этапа.');
  END IF;

  SELECT * INTO v_cur FROM k24_stage_defs WHERE key = p_key FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'Этап не найден — обновите страницу.');
  END IF;

  v_name := CASE WHEN p ? 'name' THEN btrim(COALESCE(p->>'name', '')) ELSE v_cur.name END;
  v_dept := CASE WHEN p ? 'department' THEN p->>'department' ELSE v_cur.department END;
  v_norm := CASE WHEN p ? 'norm_per_8h' THEN NULLIF(p->>'norm_per_8h', '')::numeric ELSE v_cur.norm_per_8h END;
  IF p ? 'roles' AND jsonb_typeof(p->'roles') = 'array' THEN
    SELECT COALESCE(array_agg(e), ARRAY[]::TEXT[]) INTO v_roles FROM jsonb_array_elements_text(p->'roles') e;
  END IF;

  v_err := public.k24_validate_stage_def(p_key, v_name, v_dept, v_roles, v_norm);
  IF v_err IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'error', v_err);
  END IF;

  UPDATE k24_stage_defs
     SET name         = v_name,
         department   = v_dept,
         norm_per_8h  = v_norm,
         show_in_menu = CASE WHEN p ? 'show_in_menu' THEN COALESCE((p->>'show_in_menu')::boolean, show_in_menu) ELSE show_in_menu END,
         otk_defect   = CASE WHEN p ? 'otk_defect' THEN COALESCE((p->>'otk_defect')::boolean, otk_defect) ELSE otk_defect END,
         sort_order   = CASE WHEN p ? 'sort_order' THEN COALESCE((p->>'sort_order')::int, sort_order) ELSE sort_order END,
         updated_at   = now(),
         updated_by   = v_uid
   WHERE key = p_key
  RETURNING * INTO v_row;

  IF v_roles IS NOT NULL THEN
    PERFORM public.k24_seed_stage_permissions(p_key, v_roles);
  END IF;

  RETURN json_build_object('ok', true, 'stage', to_jsonb(v_row));
END;
$function$;

REVOKE ALL ON FUNCTION public.update_stage_def(TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_stage_def(TEXT, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.archive_stage_def(p_key TEXT, p_archived BOOLEAN DEFAULT true)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_row k24_stage_defs%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Сессия не активна. Войдите заново.');
  END IF;
  IF NOT public.k24_user_can('order_type:manage') THEN
    RETURN json_build_object('ok', false, 'error', 'Нет права настраивать этапы.');
  END IF;

  UPDATE k24_stage_defs
     SET archived_at = CASE WHEN COALESCE(p_archived, true) THEN COALESCE(archived_at, now()) ELSE NULL END,
         updated_at  = now(),
         updated_by  = v_uid
   WHERE key = p_key
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'Этап не найден — обновите страницу.');
  END IF;

  RETURN json_build_object('ok', true, 'stage', to_jsonb(v_row));
END;
$function$;

REVOKE ALL ON FUNCTION public.archive_stage_def(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_stage_def(TEXT, BOOLEAN) TO authenticated;

-- Удаление — только этап, который нигде не использован (ТЗ 7.4: использованный
-- этап только архивируется). Права stage:<key> удаляются вместе с этапом.
CREATE OR REPLACE FUNCTION public.delete_stage_def(p_key TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Сессия не активна. Войдите заново.');
  END IF;
  IF NOT public.k24_user_can('order_type:manage') THEN
    RETURN json_build_object('ok', false, 'error', 'Нет права настраивать этапы.');
  END IF;
  PERFORM 1 FROM k24_stage_defs WHERE key = p_key FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'Этап не найден — обновите страницу.');
  END IF;

  IF EXISTS (SELECT 1 FROM k24_order_types WHERE production ? p_key) THEN
    RETURN json_build_object('ok', false, 'error', 'Этап есть в маршруте типа заказа — уберите его из типов или отправьте этап в архив.');
  END IF;
  IF EXISTS (SELECT 1 FROM k24_orders
              WHERE status = p_key
                 OR (route_snapshot IS NOT NULL AND (route_snapshot->'stages') ? p_key)) THEN
    RETURN json_build_object('ok', false, 'error', 'Этап есть в маршруте заказов — его можно только отправить в архив.');
  END IF;
  IF EXISTS (SELECT 1 FROM k24_order_subtasks
              WHERE status = p_key OR (route IS NOT NULL AND route ? p_key)) THEN
    RETURN json_build_object('ok', false, 'error', 'Этап есть в маршруте допечаток — его можно только отправить в архив.');
  END IF;
  IF EXISTS (SELECT 1 FROM k24_production_logs WHERE stage = p_key OR defect_stage = p_key) THEN
    RETURN json_build_object('ok', false, 'error', 'По этапу есть записи учёта — его можно только отправить в архив.');
  END IF;

  DELETE FROM k24_role_permissions WHERE permission = 'stage:' || p_key;
  DELETE FROM k24_stage_defs WHERE key = p_key;

  RETURN json_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_stage_def(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_stage_def(TEXT) TO authenticated;

-- ── 4. check_stage_completion v8 ─────────────────────────────
-- Тело v7 (099) ДОСЛОВНО + ветка своих этапов перед финальным ELSE:
-- годные = выполнено − брак (зеркало computeStageProgress на фронте).
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
    -- 099: этап «Ламинация» завершён и при одной монтажной плёнке (montage_meters).
    SELECT COALESCE(SUM(lamination_meters), 0) + COALESCE(SUM(montage_meters), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'lamination' AND deleted_at IS NULL;
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
  -- 104: свой этап (custom_<N>) — годные = выполнено − брак.
  ELSIF p_stage ~ '^custom_[0-9]+$' THEN
    SELECT COALESCE(SUM(qty_done), 0), COALESCE(SUM(defects), 0) INTO v_total, v_defects
      FROM k24_production_logs WHERE order_id = p_order_id AND stage = p_stage AND deleted_at IS NULL;
    v_total := GREATEST(0, v_total - v_defects);
  ELSE
    v_total := 0;
  END IF;

  RETURN json_build_object('total', v_total, 'target', v_target, 'is_complete', v_total >= v_target);
END;
$function$;

REVOKE ALL ON FUNCTION public.check_stage_completion(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_stage_completion(uuid, text, text) TO authenticated;

-- ── 5. auto_advance_drying v4 ────────────────────────────────
-- Заказы: «Сушка» у 3D-типов (как 083) И у любого заказа, в снимке маршрута
-- которого есть сушка (свой тип с парой Заливка → Сушка). Следующий этап —
-- первый после 'drying' в route_snapshot.stages, который не снят правилами
-- заказа (getOrderRoute → applyV2Rules): ламинация без need_lam/монтажной
-- плёнки, доставка без delivery_type='delivery', дизайн при макете от клиента.
-- Нет снимка (v1) → прежний CASE 083. Подзадачи — тело 083 без изменений.
CREATE OR REPLACE FUNCTION public.auto_advance_drying()
RETURNS TABLE(orders_advanced integer, subtasks_advanced integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_orders INT := 0;
  v_subtasks INT := 0;
  r RECORD;
  v_idx INT;
  v_next TEXT;
  v_order_next TEXT;
BEGIN
  FOR r IN
    SELECT id, order_type, route_snapshot, need_lam, needs_montage_film,
           delivery_type, design_status
      FROM k24_orders
    WHERE status = 'drying'
      AND (order_type IN ('sticker3D', 'stickerpack3D')
           OR (route_snapshot IS NOT NULL
               AND jsonb_typeof(route_snapshot->'stages') = 'array'
               AND (route_snapshot->'stages') ? 'drying'))
      AND drying_started_at IS NOT NULL
      AND drying_started_at <= NOW() - INTERVAL '36 hours'
    FOR UPDATE SKIP LOCKED
  LOOP
    v_order_next := NULL;
    IF r.route_snapshot IS NOT NULL
       AND jsonb_typeof(r.route_snapshot->'stages') = 'array'
       AND (r.route_snapshot->'stages') ? 'drying' THEN
      SELECT s.elem INTO v_order_next
        FROM jsonb_array_elements_text(r.route_snapshot->'stages') WITH ORDINALITY AS s(elem, ord)
       WHERE s.ord > (SELECT d.ord
                        FROM jsonb_array_elements_text(r.route_snapshot->'stages') WITH ORDINALITY AS d(elem, ord)
                       WHERE d.elem = 'drying' LIMIT 1)
         AND NOT (s.elem = 'lamination'
                  AND NOT (COALESCE(r.need_lam, false) OR COALESCE(r.needs_montage_film, false)))
         AND NOT (s.elem = 'delivery' AND r.delivery_type IS DISTINCT FROM 'delivery')
         AND NOT (s.elem IN ('design', 'design_approval') AND r.design_status = 'provided')
       ORDER BY s.ord
       LIMIT 1;
    END IF;
    IF v_order_next IS NULL THEN
      IF r.order_type NOT IN ('sticker3D', 'stickerpack3D') THEN
        CONTINUE;  -- снимок без этапа после сушки: оставляем ручному переходу
      END IF;
      v_order_next := CASE WHEN r.order_type = 'stickerpack3D' THEN 'assembly_3d' ELSE 'selection' END;
    END IF;
    UPDATE k24_orders SET status = v_order_next, updated_at = NOW() WHERE id = r.id;
    INSERT INTO k24_order_status_history (order_id, from_status, to_status, changed_by)
    VALUES (r.id, 'drying', v_order_next, NULL);
    v_orders := v_orders + 1;
  END LOOP;

  FOR r IN
    SELECT id, track, route FROM k24_order_subtasks
    WHERE status = 'drying'
      AND drying_started_at IS NOT NULL
      AND drying_started_at <= NOW() - INTERVAL '36 hours'
    FOR UPDATE SKIP LOCKED
  LOOP
    IF r.track = 'reprint' AND r.route IS NOT NULL THEN
      SELECT ord - 1 INTO v_idx
        FROM (SELECT elem, ordinality AS ord
                FROM jsonb_array_elements_text(r.route) WITH ORDINALITY AS t(elem, ordinality)) x
       WHERE elem = 'drying' LIMIT 1;
      v_next := COALESCE(r.route->>(v_idx + 1), 'done');
      UPDATE k24_order_subtasks
        SET status = v_next, completed_at = CASE WHEN v_next = 'done' THEN NOW() ELSE NULL END
        WHERE id = r.id;
    ELSE
      UPDATE k24_order_subtasks SET status = 'ready', completed_at = NOW() WHERE id = r.id;
    END IF;
    v_subtasks := v_subtasks + 1;
  END LOOP;

  RETURN QUERY SELECT v_orders, v_subtasks;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.auto_advance_drying() FROM PUBLIC, anon, authenticated;

COMMIT;

-- Проверка после применения:
-- SELECT column_name, data_type, column_default FROM information_schema.columns
--  WHERE table_name = 'k24_production_logs' AND column_name = 'qty_done';      -- integer, 0
-- SELECT convalidated FROM pg_constraint WHERE conname = 'k24_production_logs_defect_stage_check'; -- true
-- SELECT has_function_privilege('anon', 'public.create_stage_def(text,text,text[],numeric,boolean,boolean)', 'EXECUTE'); -- false
-- -- Сушка встроенных: для каждого 3D-заказа на сушке ожидаемый следующий этап
-- -- совпадает с прежним CASE (selection / assembly_3d):
-- SELECT o.number, o.order_type,
--        (SELECT s.elem FROM jsonb_array_elements_text(o.route_snapshot->'stages') WITH ORDINALITY s(elem, ord)
--          WHERE s.ord > (SELECT d.ord FROM jsonb_array_elements_text(o.route_snapshot->'stages') WITH ORDINALITY d(elem, ord) WHERE d.elem = 'drying')
--          ORDER BY s.ord LIMIT 1) AS snap_next
--   FROM k24_orders o WHERE o.order_type IN ('sticker3D', 'stickerpack3D') AND o.route_snapshot IS NOT NULL;
