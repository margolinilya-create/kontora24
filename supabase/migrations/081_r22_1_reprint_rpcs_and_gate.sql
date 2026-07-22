-- ============================================================
-- R22.1 (ТЗ 20.07.2026, Фаза 1) — RPC допечаток + гейт завершения
-- ============================================================
-- 1) create_reprint_subtask — создать допечатку (все 5 ролей).
-- 2) advance_reprint_subtask — продвинуть по маршруту (optimistic-lock +
--    серверная сверка количества по subtask_id).
-- 3) fn_block_done_with_open_reprints — заказ нельзя закрыть, пока есть
--    незавершённые допечатки.
-- 4) auto_advance_drying v2 — сушка допечаток продвигается по route, не в 'ready'.
--
-- Rollback: DROP FUNCTION/TRIGGER; восстановить auto_advance_drying из 045.

-- --- 1. Создание допечатки ---
CREATE OR REPLACE FUNCTION public.create_reprint_subtask(
  p_order_id UUID,
  p_qty      INTEGER,
  p_reason   TEXT,
  p_comment  TEXT,
  p_route    JSONB
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role       TEXT;
  v_next_idx   INT;
  v_subtask_id UUID;
  v_number     TEXT;
  v_first      TEXT;
  v_now        TIMESTAMPTZ := NOW();
  v_allowed    TEXT[] := ARRAY['print','lamination','cutting','selection','pouring','drying','assembly_3d','packaging','done'];
  v_step       TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Сессия не активна. Войдите заново.');
  END IF;

  SELECT role INTO v_role FROM k24_profiles WHERE id = auth.uid();
  IF v_role IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Профиль не найден. Обратитесь к администратору.');
  END IF;
  -- По ТЗ создание допечатки доступно всем ролям.
  IF v_role NOT IN ('admin', 'manager', 'designer', 'printer', 'post_printer') THEN
    RETURN json_build_object('ok', false, 'error', 'Нет прав на создание допечатки.');
  END IF;

  IF p_qty IS NULL OR p_qty <= 0 THEN
    RETURN json_build_object('ok', false, 'error', 'Укажите количество к допечатке (> 0).');
  END IF;

  IF p_reason IS NOT NULL AND p_reason NOT IN ('defect', 'shortage') THEN
    RETURN json_build_object('ok', false, 'error', 'Недопустимая причина.');
  END IF;

  IF p_route IS NULL OR jsonb_typeof(p_route) <> 'array' OR jsonb_array_length(p_route) = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'Пустой маршрут допечатки.');
  END IF;

  -- Валидация: каждый элемент маршрута из белого списка, старт — 'print'.
  FOR v_step IN SELECT jsonb_array_elements_text(p_route) LOOP
    IF NOT (v_step = ANY (v_allowed)) THEN
      RETURN json_build_object('ok', false, 'error', 'Недопустимый этап в маршруте: ' || v_step);
    END IF;
  END LOOP;
  v_first := p_route->>0;
  IF v_first <> 'print' THEN
    RETURN json_build_object('ok', false, 'error', 'Допечатка должна начинаться с этапа «Печать».');
  END IF;

  SELECT number::TEXT, COALESCE(custom_number, number::TEXT)
    INTO v_number, v_number
    FROM k24_orders WHERE id = p_order_id;
  IF v_number IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Заказ не найден.');
  END IF;

  SELECT COALESCE(MAX(item_idx), 0) + 1 INTO v_next_idx
    FROM k24_order_subtasks
    WHERE order_id = p_order_id AND track = 'reprint';

  INSERT INTO k24_order_subtasks
    (order_id, track, item_idx, status, title, qty, reason, comment, route, started_at)
  VALUES
    (p_order_id, 'reprint', v_next_idx, 'print',
     'Допечатка #' || v_next_idx || ' к заказу #' || v_number,
     p_qty, p_reason, p_comment, p_route, v_now)
  RETURNING id INTO v_subtask_id;

  RETURN json_build_object('ok', true, 'subtask_id', v_subtask_id, 'item_idx', v_next_idx);
END;
$function$;

-- --- 2. Продвижение допечатки по маршруту ---
CREATE OR REPLACE FUNCTION public.advance_reprint_subtask(
  p_subtask_id      UUID,
  p_expected_status TEXT
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role     TEXT;
  v_now      TIMESTAMPTZ := NOW();
  v_track    TEXT;
  v_status   TEXT;
  v_qty      INT;
  v_route    JSONB;
  v_is_legacy BOOLEAN;
  v_idx      INT;
  v_next     TEXT;
  v_produced NUMERIC;
  v_field    TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Сессия не активна. Войдите заново.');
  END IF;
  SELECT role INTO v_role FROM k24_profiles WHERE id = auth.uid();
  IF v_role IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Профиль не найден.');
  END IF;
  -- По ТЗ учёт/продвижение допечатки доступно всем ролям.
  IF v_role NOT IN ('admin', 'manager', 'designer', 'printer', 'post_printer') THEN
    RETURN json_build_object('ok', false, 'error', 'Нет прав на продвижение допечатки.');
  END IF;

  SELECT track, status, qty, route, is_legacy
    INTO v_track, v_status, v_qty, v_route, v_is_legacy
    FROM k24_order_subtasks WHERE id = p_subtask_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'Допечатка не найдена.');
  END IF;
  IF v_track <> 'reprint' OR v_is_legacy THEN
    RETURN json_build_object('ok', false, 'error', 'Подзадача не является активной допечаткой.');
  END IF;

  -- Optimistic-lock: защита от двойного клика / гонки двух работников.
  IF v_status <> p_expected_status THEN
    RETURN json_build_object('ok', false, 'error', 'Этап уже изменился — обновите страницу.');
  END IF;

  IF v_status = 'done' THEN
    RETURN json_build_object('ok', false, 'error', 'Допечатка уже завершена.');
  END IF;

  -- Серверная сверка: на количественных этапах нельзя продвинуть, пока не
  -- внесено достаточно (SUM годных по subtask_id+stage >= qty).
  v_field := CASE v_status
    WHEN 'print'       THEN 'stickers_printed'
    WHEN 'lamination'  THEN 'lamination_qty'
    WHEN 'cutting'     THEN 'qty_cut'
    WHEN 'selection'   THEN 'qty_selected'
    WHEN 'pouring'     THEN 'stickers_good'
    WHEN 'drying'      THEN 'qty_dried'
    WHEN 'assembly_3d' THEN 'packs_assembled'
    WHEN 'packaging'   THEN 'packs_packaged'
    ELSE NULL
  END;

  IF v_field IS NOT NULL THEN
    EXECUTE format(
      'SELECT COALESCE(SUM(COALESCE(%I,0)) - CASE WHEN %L THEN COALESCE(SUM(COALESCE(defects,0)),0) ELSE 0 END, 0)
         FROM k24_production_logs
        WHERE subtask_id = $1 AND stage = $2 AND deleted_at IS NULL',
      v_field,
      (v_status IN ('print','cutting','lamination','packaging','drying'))
    )
    INTO v_produced
    USING p_subtask_id, v_status;

    IF v_produced < v_qty THEN
      RETURN json_build_object(
        'ok', false,
        'error', 'Внесено ' || v_produced || ' из ' || v_qty || ' — этап не завершён.'
      );
    END IF;
  END IF;

  -- Следующий элемент маршрута.
  SELECT ord - 1 INTO v_idx
    FROM (
      SELECT elem, ordinality AS ord
        FROM jsonb_array_elements_text(v_route) WITH ORDINALITY AS t(elem, ordinality)
    ) x
   WHERE elem = v_status
   LIMIT 1;

  IF v_idx IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Текущий этап не найден в маршруте.');
  END IF;

  v_next := v_route->>(v_idx + 1);
  IF v_next IS NULL THEN
    v_next := 'done';
  END IF;

  UPDATE k24_order_subtasks
    SET status = v_next,
        completed_at = CASE WHEN v_next = 'done' THEN v_now ELSE NULL END,
        updated_at = v_now
    WHERE id = p_subtask_id;

  RETURN json_build_object('ok', true, 'new_status', v_next, 'done', (v_next = 'done'));
END;
$function$;

-- --- 3. Гейт: нельзя завершить заказ с открытыми допечатками ---
CREATE OR REPLACE FUNCTION public.fn_block_done_with_open_reprints()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' THEN
    IF EXISTS (
      SELECT 1 FROM k24_order_subtasks
       WHERE order_id = NEW.id
         AND track = 'reprint'
         AND NOT is_legacy
         AND status <> 'done'
    ) THEN
      RAISE EXCEPTION 'REPRINTS_NOT_DONE';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_block_done_with_open_reprints ON k24_orders;
CREATE TRIGGER trg_block_done_with_open_reprints
  BEFORE UPDATE OF status ON k24_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_block_done_with_open_reprints();

-- --- 4. auto_advance_drying v2: reprint двигается по route ---
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
BEGIN
  -- Order-level drying (sticker3D) — без изменений (36ч → selection).
  FOR r IN
    SELECT id FROM k24_orders
    WHERE status = 'drying' AND order_type = 'sticker3D'
      AND drying_started_at IS NOT NULL
      AND drying_started_at <= NOW() - INTERVAL '36 hours'
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE k24_orders SET status = 'selection', updated_at = NOW() WHERE id = r.id;
    INSERT INTO k24_order_status_history (order_id, from_status, to_status, changed_by)
    VALUES (r.id, 'drying', 'selection', NULL);
    v_orders := v_orders + 1;
  END LOOP;

  -- Subtask-level drying.
  FOR r IN
    SELECT id, track, route FROM k24_order_subtasks
    WHERE status = 'drying'
      AND drying_started_at IS NOT NULL
      AND drying_started_at <= NOW() - INTERVAL '36 hours'
    FOR UPDATE SKIP LOCKED
  LOOP
    IF r.track = 'reprint' AND r.route IS NOT NULL THEN
      -- Допечатка: следующий элемент маршрута после 'drying'.
      SELECT ord - 1 INTO v_idx
        FROM (SELECT elem, ordinality AS ord
                FROM jsonb_array_elements_text(r.route) WITH ORDINALITY AS t(elem, ordinality)) x
       WHERE elem = 'drying' LIMIT 1;
      v_next := COALESCE(r.route->>(v_idx + 1), 'done');
      UPDATE k24_order_subtasks
        SET status = v_next, completed_at = CASE WHEN v_next = 'done' THEN NOW() ELSE NULL END
        WHERE id = r.id;
    ELSE
      -- Legacy bg/stickers/extra: как раньше → 'ready'.
      UPDATE k24_order_subtasks SET status = 'ready', completed_at = NOW() WHERE id = r.id;
    END IF;
    v_subtasks := v_subtasks + 1;
  END LOOP;

  RETURN QUERY SELECT v_orders, v_subtasks;
END;
$function$;

-- Гранты (075 отозвал EXECUTE у anon и правит default privileges — новым
-- функциям выдаём явно). auto_advance_drying — только для cron/service.
REVOKE ALL ON FUNCTION public.create_reprint_subtask(UUID, INTEGER, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.advance_reprint_subtask(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_reprint_subtask(UUID, INTEGER, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_reprint_subtask(UUID, TEXT) TO authenticated;
