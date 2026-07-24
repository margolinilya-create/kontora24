-- ============================================================
-- R23.5 (доработки Фазы 1 по запросу менеджера) — досрочный переход + удаление
-- ============================================================
-- A) force_advance_reprint_subtask — досрочный переход допечатки на следующий
--    этап МИНУЯ количественную сверку (для менеджера/админа; напр. не ждать
--    36ч сушки). advance_reprint_subtask НЕ трогаем — это отдельная функция.
-- B) delete_reprint_subtask — удалить допечатку (менеджер/админ). Только если
--    она не завершена и по ней НЕТ внесённых (не удалённых) логов — т.е.
--    создана по ошибке. Иначе отказ (данные не теряем, склад не реверсим).
--    Пишем запись в k24_order_audit (field_name='reprint_deleted').
--
-- Rollback: DROP FUNCTION обеих функций.

-- --- A. Досрочный переход допечатки (без qty-гейта) ---
CREATE OR REPLACE FUNCTION public.force_advance_reprint_subtask(
  p_subtask_id      UUID,
  p_expected_status TEXT
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role      TEXT;
  v_now       TIMESTAMPTZ := NOW();
  v_track     TEXT;
  v_status    TEXT;
  v_route     JSONB;
  v_is_legacy BOOLEAN;
  v_idx       INT;
  v_next      TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Сессия не активна. Войдите заново.');
  END IF;
  SELECT role INTO v_role FROM k24_profiles WHERE id = auth.uid();
  IF v_role IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Профиль не найден.');
  END IF;
  -- Досрочный переход — только руководитель/админ.
  IF v_role NOT IN ('admin', 'manager') THEN
    RETURN json_build_object('ok', false, 'error', 'Досрочный переход доступен только руководителю.');
  END IF;

  SELECT track, status, route, is_legacy
    INTO v_track, v_status, v_route, v_is_legacy
    FROM k24_order_subtasks WHERE id = p_subtask_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'Допечатка не найдена.');
  END IF;
  IF v_track <> 'reprint' OR v_is_legacy THEN
    RETURN json_build_object('ok', false, 'error', 'Подзадача не является активной допечаткой.');
  END IF;

  -- Optimistic-lock: защита от гонки (этап уже сдвинулся).
  IF v_status <> p_expected_status THEN
    RETURN json_build_object('ok', false, 'error', 'Этап уже изменился — обновите страницу.');
  END IF;
  IF v_status = 'done' THEN
    RETURN json_build_object('ok', false, 'error', 'Допечатка уже завершена.');
  END IF;

  -- Следующий элемент маршрута (без qty-сверки — в этом суть досрочного перехода).
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

-- --- B. Удаление допечатки (созданной по ошибке) ---
CREATE OR REPLACE FUNCTION public.delete_reprint_subtask(
  p_subtask_id UUID
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role     TEXT;
  v_uid      UUID := auth.uid();
  v_track    TEXT;
  v_status   TEXT;
  v_title    TEXT;
  v_order_id UUID;
  v_log_cnt  INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Сессия не активна. Войдите заново.');
  END IF;
  SELECT role INTO v_role FROM k24_profiles WHERE id = v_uid;
  IF v_role IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Профиль не найден.');
  END IF;
  IF v_role NOT IN ('admin', 'manager') THEN
    RETURN json_build_object('ok', false, 'error', 'Удаление доступно только руководителю.');
  END IF;

  SELECT track, status, title, order_id
    INTO v_track, v_status, v_title, v_order_id
    FROM k24_order_subtasks WHERE id = p_subtask_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'Допечатка не найдена.');
  END IF;
  IF v_track <> 'reprint' THEN
    RETURN json_build_object('ok', false, 'error', 'Это не допечатка.');
  END IF;
  IF v_status = 'done' THEN
    RETURN json_build_object('ok', false, 'error', 'Завершённую допечатку удалить нельзя — она уже в истории производства.');
  END IF;

  -- Отказ, если по допечатке есть внесённые (не удалённые) данные —
  -- удаляем только созданные по ошибке пустые допечатки, чтобы не терять учёт
  -- и не реверсить склад.
  SELECT COUNT(*) INTO v_log_cnt
    FROM k24_production_logs
    WHERE subtask_id = p_subtask_id AND deleted_at IS NULL;
  IF v_log_cnt > 0 THEN
    RETURN json_build_object('ok', false, 'error',
      'У допечатки есть внесённые данные — удаление недоступно. Поставьте её на паузу.');
  END IF;

  -- Аудит удаления (событие через field_name; k24_order_audit без action-колонки).
  INSERT INTO k24_order_audit (order_id, field_name, old_value, new_value, changed_by)
  VALUES (v_order_id, 'reprint_deleted', v_title, NULL, v_uid);

  -- FK-safe: детачим возможные soft-deleted логи (активных нет — проверено выше),
  -- их deleted_at сохраняется в истории.
  UPDATE k24_production_logs SET subtask_id = NULL WHERE subtask_id = p_subtask_id;

  DELETE FROM k24_order_subtasks WHERE id = p_subtask_id;

  RETURN json_build_object('ok', true);
END;
$function$;

-- Гранты (075: явно выдаём EXECUTE новым функциям; anon — REVOKE).
REVOKE ALL ON FUNCTION public.force_advance_reprint_subtask(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_reprint_subtask(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.force_advance_reprint_subtask(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_reprint_subtask(UUID) TO authenticated;
