-- Migration 035: авторизация в advance_subtask
--
-- Аудит 18.05: SECURITY DEFINER функция advance_subtask (миграция 032) не
-- проверяла вызывающего — любой authenticated мог дёрнуть RPC и продвинуть
-- подзадачу чужого заказа на 'ready', сломав учёт 3D-стикерпаков (80% потока).
--
-- Фикс: в начале функции проверяем что у вызывающего есть профиль с
-- production-ролью. Designer не работает с подзадачами (subtasks создаются
-- после стадии design), поэтому исключён.
--
-- Возврат остаётся совместимым с фронтом: при отказе — { ok: false, error: ... }.
-- useOrderSubtasks.advance уже корректно ловит ok=false и кидает Error.

CREATE OR REPLACE FUNCTION advance_subtask(p_subtask_id UUID, p_to_status TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id UUID;
  v_track TEXT;
  v_other_ready BOOLEAN;
  v_role TEXT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Авторизация: только authenticated с production-ролью.
  -- Сообщения возвращаем сразу на русском — error-translator пропускает
  -- кириллицу как есть, без обёртки «Что-то пошло не так».
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Сессия не активна. Войдите заново.');
  END IF;

  SELECT role INTO v_role FROM k24_profiles WHERE id = auth.uid();
  IF v_role IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Профиль не найден. Обратитесь к администратору.');
  END IF;
  IF v_role NOT IN ('admin', 'manager', 'printer', 'post_printer') THEN
    RETURN json_build_object('ok', false, 'error', 'Нет прав на продвижение подзадач.');
  END IF;

  SELECT order_id, track INTO v_order_id, v_track
  FROM k24_order_subtasks WHERE id = p_subtask_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'Подзадача не найдена.');
  END IF;

  UPDATE k24_order_subtasks
    SET status = p_to_status,
        started_at = COALESCE(started_at, v_now),
        completed_at = CASE WHEN p_to_status = 'ready' THEN v_now ELSE NULL END
    WHERE id = p_subtask_id;

  -- Готовность второго трека для both_ready-флага.
  SELECT (status = 'ready') INTO v_other_ready
  FROM k24_order_subtasks
  WHERE order_id = v_order_id AND track <> v_track;

  RETURN json_build_object(
    'ok', true,
    'new_status', p_to_status,
    'both_ready', (p_to_status = 'ready' AND COALESCE(v_other_ready, false))
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION advance_subtask(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION advance_subtask(UUID, TEXT) TO authenticated;
