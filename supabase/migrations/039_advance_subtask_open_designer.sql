-- 039_advance_subtask_open_designer — R8.4 (серия 25.05)
--
-- Бриф 25.05: «Создать возможность всем сотрудникам менять статус подзадач».
-- Миграция 035 разрешает admin/manager/printer/post_printer — расширяем на
-- designer (единственная отсутствующая production-роль).
--
-- Изменение точечное: меняем только role-check в RPC advance_subtask.

BEGIN;

CREATE OR REPLACE FUNCTION advance_subtask(p_subtask_id UUID, p_to_status TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now      TIMESTAMPTZ := now();
  v_role     TEXT;
  v_order_id UUID;
  v_track    TEXT;
  v_other_ready BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Сессия не активна. Войдите заново.');
  END IF;

  SELECT role INTO v_role FROM k24_profiles WHERE id = auth.uid();
  IF v_role IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Профиль не найден. Обратитесь к администратору.');
  END IF;
  IF v_role NOT IN ('admin', 'manager', 'designer', 'printer', 'post_printer') THEN
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
  WHERE order_id = v_order_id AND track <> v_track
  LIMIT 1;

  RETURN json_build_object(
    'ok', true,
    'new_status', p_to_status,
    'both_ready', (p_to_status = 'ready' AND COALESCE(v_other_ready, false)),
    'completed_track', v_track
  );
END
$$;

COMMIT;
