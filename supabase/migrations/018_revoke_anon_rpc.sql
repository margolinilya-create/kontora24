-- 018_revoke_anon_rpc.sql — Supabase advisor: anon_security_definer_function_executable.
-- Anonymous пользователи не должны выполнять внутренние RPC. Webhooks идут через
-- service role (REVOKE не применяется к нему). handle_new_user — триггерная функция,
-- не вызывается напрямую через REST, REVOKE для defense-in-depth.

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_stock(uuid, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_deduct_materials(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reserve_materials(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.release_materials(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.consume_reservations(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_stage_completion(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_stage_completion(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.k24_get_orders_safe(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_pack_designs_for_order() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_pack_designs_on_order_update() FROM anon;
REVOKE EXECUTE ON FUNCTION public.k24_can_see_finance(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
-- Триггерные функции (defense-in-depth):
REVOKE EXECUTE ON FUNCTION public.log_order_changes() FROM anon;
REVOKE EXECUTE ON FUNCTION public.k24_protect_order_columns() FROM anon;
REVOKE EXECUTE ON FUNCTION public.k24_pack_designs_set_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM anon;
