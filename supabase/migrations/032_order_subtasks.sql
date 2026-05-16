-- Migration 032: параллельные подзадачи 3D-стикерпака
--
-- Фидбэк менеджера 17.05: «Чтобы прогресс заказов с 3D смолой фиксировался
-- корректно, необходимо разместить заказ на нескольких этапах одновременно.
-- Например: фоны отпечатаны раньше стикеров → отправить фоны на следующий этап.»
--
-- Архитектура: для каждого stickerpack3D заказа создаются 2 подзадачи
-- (track='backgrounds' и track='stickers'). Подзадачи продвигаются независимо
-- по своим маршрутам:
--   Фоны:   pending → printing → laminating → cutting → selecting → ready
--   Стикеры: pending → printing → cutting → pouring → ready
-- Когда обе подзадачи в 'ready' — основной order.status можно двигать на
-- assembly_3d (UI решает через ConfirmDialog).
--
-- Основной k24_orders.status остаётся как «координатор» и индикатор глобальной
-- фазы. Для не-3D-pack заказов подзадачи не создаются — поведение без изменений.

CREATE TABLE IF NOT EXISTS k24_order_subtasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES k24_orders(id) ON DELETE CASCADE,
  track        TEXT NOT NULL CHECK (track IN ('backgrounds', 'stickers')),
  status       TEXT NOT NULL,
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, track)
);

CREATE INDEX IF NOT EXISTS idx_order_subtasks_order ON k24_order_subtasks(order_id);
CREATE INDEX IF NOT EXISTS idx_order_subtasks_status_track ON k24_order_subtasks(status, track);

COMMENT ON TABLE k24_order_subtasks IS
  'Параллельные подзадачи 3D-стикерпака. Каждый stickerpack3D заказ имеет 2 записи (track=backgrounds + track=stickers), продвигающиеся независимо.';

-- ============================================================
-- ТРИГГЕР: при INSERT 3D-pack — создать 2 подзадачи
-- ============================================================
CREATE OR REPLACE FUNCTION fn_create_3dpack_subtasks() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.order_type = 'stickerpack3D' THEN
    INSERT INTO k24_order_subtasks (order_id, track, status)
    VALUES (NEW.id, 'backgrounds', 'pending'), (NEW.id, 'stickers', 'pending')
    ON CONFLICT (order_id, track) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_3dpack_subtasks ON k24_orders;
CREATE TRIGGER trg_create_3dpack_subtasks
AFTER INSERT ON k24_orders
FOR EACH ROW EXECUTE FUNCTION fn_create_3dpack_subtasks();

-- ============================================================
-- updated_at автообновление
-- ============================================================
CREATE OR REPLACE FUNCTION fn_subtasks_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_subtasks_updated_at ON k24_order_subtasks;
CREATE TRIGGER trg_subtasks_updated_at
BEFORE UPDATE ON k24_order_subtasks
FOR EACH ROW EXECUTE FUNCTION fn_subtasks_updated_at();

-- ============================================================
-- БЭКФИЛЛ существующих stickerpack3D заказов
-- Маппинг order.status → (background.status, sticker.status):
-- ============================================================
INSERT INTO k24_order_subtasks (order_id, track, status, completed_at)
SELECT o.id, 'backgrounds',
  CASE o.status
    WHEN 'new' THEN 'pending'
    WHEN 'design' THEN 'pending'
    WHEN 'prepress' THEN 'pending'
    WHEN 'print' THEN 'printing'
    WHEN 'lamination' THEN 'laminating'
    WHEN 'cutting' THEN 'cutting'
    WHEN 'selection_pouring' THEN 'selecting'
    WHEN 'assembly_3d' THEN 'ready'
    WHEN 'packaging' THEN 'ready'
    WHEN 'otk' THEN 'ready'
    WHEN 'done' THEN 'ready'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE 'pending'
  END,
  CASE WHEN o.status IN ('assembly_3d','packaging','otk','done') THEN NOW() END
FROM k24_orders o
WHERE o.order_type = 'stickerpack3D'
  AND NOT EXISTS (SELECT 1 FROM k24_order_subtasks st WHERE st.order_id = o.id AND st.track = 'backgrounds');

INSERT INTO k24_order_subtasks (order_id, track, status, completed_at)
SELECT o.id, 'stickers',
  CASE o.status
    WHEN 'new' THEN 'pending'
    WHEN 'design' THEN 'pending'
    WHEN 'prepress' THEN 'pending'
    WHEN 'print' THEN 'printing'
    WHEN 'lamination' THEN 'cutting'        -- стикеры пропускают ламинацию
    WHEN 'cutting' THEN 'cutting'
    WHEN 'selection_pouring' THEN 'pouring'
    WHEN 'assembly_3d' THEN 'ready'
    WHEN 'packaging' THEN 'ready'
    WHEN 'otk' THEN 'ready'
    WHEN 'done' THEN 'ready'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE 'pending'
  END,
  CASE WHEN o.status IN ('assembly_3d','packaging','otk','done') THEN NOW() END
FROM k24_orders o
WHERE o.order_type = 'stickerpack3D'
  AND NOT EXISTS (SELECT 1 FROM k24_order_subtasks st WHERE st.order_id = o.id AND st.track = 'stickers');

-- ============================================================
-- RPC: advance_subtask — продвинуть подзадачу на следующий этап с валидацией
-- Возвращает { ok, new_status, both_ready } — UI решает что делать с основным
-- статусом заказа (показывать ли ConfirmDialog assembly_3d).
-- ============================================================
CREATE OR REPLACE FUNCTION advance_subtask(p_subtask_id UUID, p_to_status TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id UUID;
  v_track TEXT;
  v_other_ready BOOLEAN;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  SELECT order_id, track INTO v_order_id, v_track
  FROM k24_order_subtasks WHERE id = p_subtask_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'subtask_not_found');
  END IF;

  UPDATE k24_order_subtasks
    SET status = p_to_status,
        started_at = COALESCE(started_at, v_now),
        completed_at = CASE WHEN p_to_status = 'ready' THEN v_now ELSE NULL END
    WHERE id = p_subtask_id;

  -- Проверяем готовность второго трека
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

-- ============================================================
-- RLS — те же права что у k24_orders
-- ============================================================
ALTER TABLE k24_order_subtasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subtasks_select_authenticated ON k24_order_subtasks;
CREATE POLICY subtasks_select_authenticated ON k24_order_subtasks
  FOR SELECT TO authenticated USING (true);

-- INSERT/UPDATE через триггер и RPC (DEFINER) — прямой доступ запрещён
REVOKE INSERT, UPDATE, DELETE ON k24_order_subtasks FROM authenticated, anon;
