-- Migration 046: R11.3 — подзадача «Стикеры дополнительно»
--
-- Бриф 31.05: на любом этапе после print менеджер/печатник может видеть, что
-- стикеров не хватает (брак на резке/сушке, ОТК показал недобор) и создать
-- параллельную подзадачу track='extra_stickers' с qty по видам. Подзадача
-- проходит свой укороченный маршрут (печать → [лам] → резка → [заливка → сушка]
-- → ready) и не блокирует основной заказ.

BEGIN;

-- 1. Расширить CHECK для track
ALTER TABLE k24_order_subtasks DROP CONSTRAINT IF EXISTS k24_order_subtasks_track_check;
ALTER TABLE k24_order_subtasks ADD CONSTRAINT k24_order_subtasks_track_check
  CHECK (track IN ('backgrounds', 'stickers', 'variant', 'extra_stickers'));

-- 2. JSONB колонка для qty по видам: { "1": 10, "2": 5 } — design_index → qty.
--    Для single-design — { "1": qty }.
ALTER TABLE k24_order_subtasks ADD COLUMN IF NOT EXISTS extra_designs JSONB;

-- 3. Partial unique index: несколько extra_stickers подзадач возможны на
--    один заказ (если 2 раза не хватило), различаются по item_idx.
CREATE UNIQUE INDEX IF NOT EXISTS uq_subtasks_extra_item
  ON k24_order_subtasks (order_id, item_idx)
  WHERE track = 'extra_stickers';

-- 4. RPC: создаёт extra_stickers подзадачу со старта 'printing' (подзадача
--    уже в работе сразу после создания). next item_idx считается по MAX
--    среди existing extra_stickers подзадач этого заказа.
CREATE OR REPLACE FUNCTION create_extra_stickers_subtask(p_order_id UUID, p_designs JSONB)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
  v_next_idx INT;
  v_subtask_id UUID;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Сессия не активна. Войдите заново.');
  END IF;

  SELECT role INTO v_role FROM k24_profiles WHERE id = auth.uid();
  IF v_role IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Профиль не найден. Обратитесь к администратору.');
  END IF;
  IF v_role NOT IN ('admin', 'manager', 'designer', 'printer', 'post_printer') THEN
    RETURN json_build_object('ok', false, 'error', 'Нет прав на создание подзадачи.');
  END IF;

  -- Проверка: p_designs должен быть непустым JSON-объектом с положительными qty.
  IF p_designs IS NULL OR jsonb_typeof(p_designs) <> 'object' THEN
    RETURN json_build_object('ok', false, 'error', 'Не указаны количества по видам.');
  END IF;

  -- Заказ существует.
  IF NOT EXISTS (SELECT 1 FROM k24_orders WHERE id = p_order_id) THEN
    RETURN json_build_object('ok', false, 'error', 'Заказ не найден.');
  END IF;

  SELECT COALESCE(MAX(item_idx), 0) + 1 INTO v_next_idx
  FROM k24_order_subtasks
  WHERE order_id = p_order_id AND track = 'extra_stickers';

  INSERT INTO k24_order_subtasks (order_id, track, item_idx, status, extra_designs, started_at)
  VALUES (p_order_id, 'extra_stickers', v_next_idx, 'printing', p_designs, v_now)
  RETURNING id INTO v_subtask_id;

  RETURN json_build_object(
    'ok', true,
    'subtask_id', v_subtask_id,
    'item_idx', v_next_idx
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION create_extra_stickers_subtask(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_extra_stickers_subtask(UUID, JSONB) TO authenticated;

COMMIT;
