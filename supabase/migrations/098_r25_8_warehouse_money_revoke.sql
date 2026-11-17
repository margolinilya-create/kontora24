-- 098 (R25.8, ТЗ 8.8) — серверное закрытие денег склада.
--
-- !!! ПРИМЕНЯТЬ ТОЛЬКО ПОСЛЕ ПРОД-ДЕПЛОЯ ФРОНТА R25.8 !!!
-- Старый фронт читает k24_materials select('*') и total_cost/unit_cost
-- операций напрямую — после этой миграции такие запросы падают 42501.
-- Prereq: 096 (view k24_material_movements / k24_materials_full, RPC,
-- recalc_material_wac SECURITY DEFINER), 097, фронт R25.8 в проде.
--
-- По образцу 072 (k24_orders):
--   • k24_material_transactions: отзываем табличный SELECT у authenticated,
--     возвращаем колоночный SELECT на всё, кроме total_cost / unit_cost.
--     INSERT не трогаем — сумма прихода по-прежнему записывается (через RPC
--     warehouse_add_operation; прямой INSERT тоже остаётся по политике).
--   • k24_materials: то же для unit_cost (средняя цена позиции). Чтение —
--     через view k24_materials_full (маска по view:finance).
--   • anon — все привилегии на обе таблицы отозваны.
--
-- Ограничение (как в 072): колоночный REVOKE не фильтрует realtime-payload.
-- Обе таблицы НЕ входят в publication supabase_realtime (проверено 17.11),
-- поэтому утечки через realtime нет. При добавлении в publication — пересмотреть.
--
-- ПРОЦЕСС для новых колонок этих таблиц: GRANT SELECT (new_col) ... TO
-- authenticated (если не денежная), иначе select воркера упадёт 42501;
-- для k24_materials — ещё и добавить колонку в конец k24_materials_full.

BEGIN;

DO $$
DECLARE
  v_cols text;
BEGIN
  -- Операции склада
  REVOKE SELECT ON public.k24_material_transactions FROM authenticated;
  REVOKE ALL ON public.k24_material_transactions FROM anon;

  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'k24_material_transactions'
     AND column_name NOT IN ('total_cost', 'unit_cost');
  EXECUTE format('GRANT SELECT (%s) ON public.k24_material_transactions TO authenticated', v_cols);

  -- Позиции склада
  REVOKE SELECT ON public.k24_materials FROM authenticated;
  REVOKE ALL ON public.k24_materials FROM anon;

  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'k24_materials'
     AND column_name NOT IN ('unit_cost');
  EXECUTE format('GRANT SELECT (%s) ON public.k24_materials TO authenticated', v_cols);
END
$$;

COMMIT;

-- ===========================================================================
-- Проверки после применения (READ-ONLY):
--
-- -- денежные колонки не читаются authenticated напрямую:
-- SELECT table_name, column_name FROM information_schema.column_privileges
--  WHERE grantee = 'authenticated' AND privilege_type = 'SELECT'
--    AND ((table_name = 'k24_material_transactions' AND column_name IN ('total_cost','unit_cost'))
--      OR (table_name = 'k24_materials' AND column_name = 'unit_cost'));   -- 0 строк
-- -- табличного SELECT нет, у anon нет ничего:
-- SELECT grantee, table_name, privilege_type FROM information_schema.table_privileges
--  WHERE table_name IN ('k24_material_transactions','k24_materials')
--    AND (grantee = 'anon' OR (grantee = 'authenticated' AND privilege_type = 'SELECT'));  -- 0 строк
-- -- запись суммы прихода работает (INSERT остался):
-- SELECT has_column_privilege('authenticated', 'k24_material_transactions', 'total_cost', 'INSERT');  -- true
-- ===========================================================================
