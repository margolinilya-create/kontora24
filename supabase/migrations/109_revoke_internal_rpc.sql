-- 109 — служебные SECURITY DEFINER-функции больше не вызываются из браузера.
--
-- delete_order_cascade(p_order_id, p_caller) проверял роль ПЕРЕДАННОГО p_caller,
-- а не auth.uid(): любой вошедший работник мог вызвать RPC с uuid админа
-- (k24_profiles читаются всеми) и удалить любой заказ. Вызывается только из
-- api/orders/delete.js сервисным ключом — authenticated право не нужно.
-- reserve/release/consume_reservations и auto_deduct_materials принимают
-- p_changed_by извне и меняют остатки склада; фронт их не вызывает (с 12.05).
REVOKE EXECUTE ON FUNCTION public.delete_order_cascade(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_materials(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_materials(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_reservations(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_deduct_materials(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_order_cascade(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_materials(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_materials(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_reservations(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_deduct_materials(uuid, uuid) TO service_role;
