-- ============================================================
-- R22 — закрыть бэкап-таблицу миграции от API (advisor: rls_disabled_in_public)
-- ============================================================
-- _backup_r22_4_orders (создана миграцией 082) лежит в public без RLS —
-- читаема/писема через PostgREST любым authenticated. Данных финансов/PII нет
-- (номер/статус/тип заказа), но таблица не должна торчать в API.
--
-- Rollback: не требуется (только ужесточение доступа).

ALTER TABLE IF EXISTS _backup_r22_4_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON _backup_r22_4_orders FROM anon, authenticated;
