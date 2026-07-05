-- Migration 067: восстановление realtime-publication (QA 04.07, баг №2 Critical).
--
-- Publication supabase_realtime оказалась ПУСТОЙ (вероятно, потеряна при
-- переезде на dedicated-проект 2026-05-11). Все postgres_changes подписки
-- фронта получали «Unable to subscribe to changes» — живые обновления
-- канбана, комментариев, подзадач, планировщика, звуковые уведомления и
-- виджет смен молча не работали.
--
-- Список таблиц — ровно те 10, на которые фронт реально подписывается
-- (полная инвентаризация .channel()/postgres_changes в src/ на 04.07.2026).
-- k24_materials / k24_material_transactions НЕ добавляем — подписок нет.
--
-- Принятый риск: realtime-payload k24_orders содержит все колонки, включая
-- финансовые. Воркеры и так могут читать их прямым SELECT (RLS USING(true),
-- известная дыра — security phase 3 из R14.8), realtime фактический доступ
-- не расширяет. Сужение — вместе с переработкой RLS.

DO $$
DECLARE
  t TEXT;
BEGIN
  -- Публикация могла быть удалена целиком — создаём при отсутствии.
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'k24_orders',
    'k24_shift_entries',
    'k24_production_logs',
    'k24_pack_designs',
    'k24_order_status_history',
    'k24_order_items',
    'k24_plan_overrides',
    'k24_settings',
    'k24_order_subtasks',
    'k24_order_comments'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;

  -- Гарантируем полный набор событий (INSERT/UPDATE/DELETE).
  ALTER PUBLICATION supabase_realtime SET (publish = 'insert, update, delete');
END $$;
