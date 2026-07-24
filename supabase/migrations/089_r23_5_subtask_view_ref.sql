-- ============================================================
-- R23.5 (доработки Фазы 1 по запросу менеджера) — привязка допечатки к виду
-- ============================================================
-- 1) k24_order_subtasks.view_ref — какой вид доделывается допечаткой:
--    для stickerpack3D — design_index из k24_pack_designs;
--    для мульти-вида (order_items) — idx вида. NULL если у заказа один вид.
--    item_idx НЕ переиспользуем (он — порядковый номер допечатки).
-- 2) create_reprint_subtask получает параметр p_view_ref (в конец сигнатуры).
--    Старую сигнатуру дропаем, чтобы не плодить overload (PGRST203).
--
-- view_ref — информационная метка: маршрут/оплата/логи допечатки не меняются
-- (логи по-прежнему по subtask_id). Историю не трогаем — колонка nullable.
--
-- Rollback: DROP FUNCTION нового варианта; восстановить create_reprint_subtask
-- из 081; ALTER TABLE ... DROP COLUMN view_ref.

ALTER TABLE public.k24_order_subtasks
  ADD COLUMN IF NOT EXISTS view_ref INT;

COMMENT ON COLUMN public.k24_order_subtasks.view_ref IS
  'R23.5: для reprint — привязка к виду (design_index стикерпака ИЛИ idx мульти-вида); NULL если вид один. Информационная метка, не влияет на маршрут/учёт.';

-- Пересоздаём create_reprint_subtask с p_view_ref (5→6 параметров).
DROP FUNCTION IF EXISTS public.create_reprint_subtask(UUID, INTEGER, TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.create_reprint_subtask(
  p_order_id UUID,
  p_qty      INTEGER,
  p_reason   TEXT,
  p_comment  TEXT,
  p_route    JSONB,
  p_view_ref INT DEFAULT NULL
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
    (order_id, track, item_idx, view_ref, status, title, qty, reason, comment, route, started_at)
  VALUES
    (p_order_id, 'reprint', v_next_idx, p_view_ref, 'print',
     'Допечатка #' || v_next_idx || ' к заказу #' || v_number,
     p_qty, p_reason, p_comment, p_route, v_now)
  RETURNING id INTO v_subtask_id;

  RETURN json_build_object('ok', true, 'subtask_id', v_subtask_id, 'item_idx', v_next_idx);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_reprint_subtask(UUID, INTEGER, TEXT, TEXT, JSONB, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_reprint_subtask(UUID, INTEGER, TEXT, TEXT, JSONB, INT) TO authenticated;
