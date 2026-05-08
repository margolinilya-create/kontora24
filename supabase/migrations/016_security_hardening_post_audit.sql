-- 016_security_hardening_post_audit.sql — фиксы из жёсткого аудита R1-R10:
-- 0) BUGFIX: column в k24_order_audit называлась 'field', а trigger пишет в 'field_name'
--    → переименовываем column. До этого fix'а каждый UPDATE k24_orders падал с ошибкой
--    в trigger log_order_changes (но frontend показывал generic toast).
-- 1) UNIQUE constraint на k24_orders.number (EditableOrderNumber может создавать дубли)
-- 2) SET search_path для всех функций (Supabase advisor: function_search_path_mutable)
-- 3) Explicit no-update / no-delete политики на k24_order_audit
-- 4) Audit финансовые поля → видны только admin/manager

-- 0) Bugfix: rename field → field_name
ALTER TABLE public.k24_order_audit RENAME COLUMN field TO field_name;

-- 1) UNIQUE constraint на номер заказа
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'k24_orders' AND constraint_name = 'uq_k24_orders_number'
  ) THEN
    ALTER TABLE public.k24_orders ADD CONSTRAINT uq_k24_orders_number UNIQUE (number);
  END IF;
END $$;

-- 2) Закрепляем search_path для функций
ALTER FUNCTION public.log_order_changes() SET search_path = public, pg_temp;
ALTER FUNCTION public.is_admin() SET search_path = public, pg_temp;
ALTER FUNCTION public.release_materials(uuid, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.consume_reservations(uuid, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_stock(uuid, numeric) SET search_path = public, pg_temp;
ALTER FUNCTION public.auto_deduct_materials(uuid, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.reserve_materials(uuid, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.check_stage_completion(uuid, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.check_stage_completion(uuid, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.k24_get_orders_safe(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.k24_protect_order_columns() SET search_path = public, pg_temp;
ALTER FUNCTION public.k24_pack_designs_set_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.create_pack_designs_for_order() SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_pack_designs_on_order_update() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at() SET search_path = public, pg_temp;

-- 3) Явные UPDATE/DELETE политики на k24_order_audit
DROP POLICY IF EXISTS "k24_order_audit_no_update" ON public.k24_order_audit;
CREATE POLICY "k24_order_audit_no_update" ON public.k24_order_audit
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "k24_order_audit_no_delete" ON public.k24_order_audit;
CREATE POLICY "k24_order_audit_no_delete" ON public.k24_order_audit
  FOR DELETE TO authenticated USING (false);

-- 4) Helper для проверки финансового доступа
CREATE OR REPLACE FUNCTION public.k24_can_see_finance(p_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.k24_profiles
    WHERE id = p_user_id AND role IN ('admin', 'manager')
  );
$$;

-- 5) SELECT-политика: финансовые поля видны только admin/manager
DROP POLICY IF EXISTS "k24_order_audit_select" ON public.k24_order_audit;
CREATE POLICY "k24_order_audit_select" ON public.k24_order_audit
  FOR SELECT TO authenticated
  USING (
    field_name NOT IN ('price_final', 'cost_materials', 'cost_labor', 'cost_total', 'markup', 'discount_pct')
    OR public.k24_can_see_finance(auth.uid())
  );
