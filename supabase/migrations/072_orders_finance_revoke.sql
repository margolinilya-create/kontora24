-- Migration 072: REVOKE табличной SELECT-привилегии финколонок k24_orders
-- (Security phase 3, шаг B — по плану из 071; фронт на view задеплоен в прод
-- коммитом 4b21398, все прямые чтения k24_orders — явные нефинансовые списки).
--
-- До этого: authenticated имел SELECT на все 60 колонок + политика
-- orders_select = USING(true) → любой воркер (designer/printer/post_printer)
-- читал price_final прямым PostgREST-запросом из DevTools, хотя UI скрывал.
-- После: SELECT только на нефинансовые колонки; финансы — исключительно через
-- view k24_orders_full (CASE-маскирование по праву view:finance, миграция 071).
-- INSERT/UPDATE/DELETE не трогаем — их держат RLS-политики + триггер
-- k24_protect_order_columns (запись финансов воркером закрыта phase 2).
--
-- ВНИМАНИЕ (из 071): колоночный REVOKE НЕ фильтрует realtime-payload (walrus
-- авторизует по row-RLS, не по column-привилегиям) — остаточная realtime-утечка
-- сохраняется. Приложение financials из realtime не читает (payload — только
-- триггер refetch); полное закрытие realtime — отдельная задача.
--
-- Процесс для будущих ALTER TABLE k24_orders ADD COLUMN (см. 071):
--   1) GRANT SELECT (new_col) ON public.k24_orders TO authenticated
--      (если колонка нефинансовая) — иначе воркерский запрос упадёт 42501;
--   2) добавить колонку в конец списка CREATE OR REPLACE VIEW k24_orders_full.

DO $$
DECLARE
  v_cols text;
BEGIN
  -- Полный сброс SELECT: снимает и табличную привилегию, и любые колоночные.
  REVOKE SELECT ON public.k24_orders FROM authenticated;
  -- Анону на таблице делать нечего вовсе (RLS-политик для anon нет, но гранты
  -- висели с сида) — снимаем всё.
  REVOKE ALL ON public.k24_orders FROM anon;

  -- Колоночный GRANT на всё, кроме 7 финансовых. Список строим динамически —
  -- защита от опечаток; будущие колонки в грант НЕ попадают автоматически
  -- (см. процесс в шапке).
  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'k24_orders'
     AND column_name NOT IN (
       'cost_materials', 'cost_labor', 'cost_total',
       'markup', 'discount_pct', 'price_final', 'price_per_unit'
     );

  EXECUTE format('GRANT SELECT (%s) ON public.k24_orders TO authenticated', v_cols);
END$$;
