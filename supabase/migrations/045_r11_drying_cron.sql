-- Migration 045: R11.2 — pg_cron auto-advance сушки
--
-- Каждые 5 минут функция `auto_advance_drying()` ищет заказы и подзадачи,
-- у которых статус 'drying' и `drying_started_at <= NOW() - INTERVAL '36 hours'`,
-- и переводит их дальше:
--   • sticker3D order:  drying → selection
--   • subtask STICKER:  drying → ready (когда оба BG+STICKER ready, фронт
--     через realtime подтянет и менеджер сделает next через SubtaskIndicator
--     или обычный StatusSwitcher).
--
-- Для stickerpack3D order.status='selection_pouring' остаётся как есть —
-- drying для STICKER-подзадачи не меняет основной маршрут.

-- pg_cron доступен в Supabase Pro tier. Если расширение уже включено —
-- IF NOT EXISTS пропустит. Если БД не Pro — миграция упадёт явно.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION auto_advance_drying()
RETURNS TABLE(orders_advanced INT, subtasks_advanced INT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_orders INT := 0;
  v_subtasks INT := 0;
  r RECORD;
BEGIN
  -- 1) Заказы: только sticker3D из drying переводятся на selection.
  --    Запись в k24_order_status_history (changed_by=NULL — системный переход).
  FOR r IN
    SELECT id, order_type, status, drying_started_at
    FROM k24_orders
    WHERE status = 'drying'
      AND order_type = 'sticker3D'
      AND drying_started_at IS NOT NULL
      AND drying_started_at <= NOW() - INTERVAL '36 hours'
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE k24_orders
    SET status = 'selection', updated_at = NOW()
    WHERE id = r.id;

    INSERT INTO k24_order_status_history (order_id, from_status, to_status, changed_by)
    VALUES (r.id, 'drying', 'selection', NULL);

    v_orders := v_orders + 1;
  END LOOP;

  -- 2) Подзадачи STICKER trek (для stickerpack3D и extra_stickers): drying → ready.
  FOR r IN
    SELECT id, order_id, track, drying_started_at
    FROM k24_order_subtasks
    WHERE status = 'drying'
      AND drying_started_at IS NOT NULL
      AND drying_started_at <= NOW() - INTERVAL '36 hours'
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE k24_order_subtasks
    SET status = 'ready', completed_at = NOW()
    WHERE id = r.id;

    v_subtasks := v_subtasks + 1;
  END LOOP;

  RETURN QUERY SELECT v_orders, v_subtasks;
END;
$$;

ALTER FUNCTION public.auto_advance_drying() SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.auto_advance_drying() FROM PUBLIC, anon, authenticated;

-- Снимаем старое расписание (если ре-запускаем миграцию) и регистрируем заново.
DO $$
DECLARE
  v_jobid BIGINT;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'drying_auto_advance';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;

SELECT cron.schedule(
  'drying_auto_advance',
  '*/5 * * * *',
  $$SELECT auto_advance_drying()$$
);
