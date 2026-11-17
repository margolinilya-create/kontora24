-- 107 — укрепление безопасности по итогам большого код-ревью 17.11.
--
-- 1. handle_new_user: роль новой учётки больше не берётся из метаданных
--    регистрации (клиент мог передать role='admin'; по умолчанию было 'manager'
--    — доступ к финансам). Профиль создаётся с минимальной ролью post_printer;
--    api/users/create.js сразу после создания выставляет нужную роль
--    service-ключом (как и раньше).
-- 2. k24_profiles: authenticated может менять только display_name / name /
--    avatar_url / role (роль — только admin через RLS profiles_update_admin;
--    profiles_update_own запрещает менять свою роль). id / email / approved /
--    created_at — только сервер (api/users/*). INSERT профилей — только триггер.
-- 3. k24_protect_order_columns: к защищённым полям добавлены поля, от которых
--    зависит оплата и маршрут (stickers_per_pack, bopp_bag, is_3d, размеры,
--    ламинация, плёнка, доставка, подрядчик…). Работник больше не может поднять
--    себе ставку, изменив заказ из DevTools. + фиксированный search_path.
-- 4. fn_block_done_with_open_reprints (v2): гейт допечаток срабатывает при
--    ЛЮБОМ входе в зону после ТК (awaiting_pickup / delivery / done), а не
--    только при выходе с otk — прыжок «упаковка → Ждёт выдачи» его обходил.
-- 5. k24_settings['calculator'] (наценки, цены плёнок) читают только те, у кого
--    view:calculator или calc:settings. Остальные ключи — как раньше.
-- 6. Фиксированный search_path у 4 триггерных функций (advisor
--    function_search_path_mutable).
-- 7. Индексы на внешние ключи, по которым реально ходят запросы/каскады.

-- 1 ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.raw_user_meta_data->>'display_name' IS NOT NULL THEN
    INSERT INTO public.k24_profiles (id, role, display_name, email)
    VALUES (
      NEW.id,
      'post_printer',
      COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
      NEW.email
    ) ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

-- 2 ───────────────────────────────────────────────────────────────────────
REVOKE INSERT, UPDATE ON public.k24_profiles FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.k24_profiles FROM anon;
GRANT UPDATE (display_name, name, avatar_url, role) ON public.k24_profiles TO authenticated;

-- 3 ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.k24_protect_order_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text;
BEGIN
  -- Сервисные вызовы (service_role: webhook Bitrix, api/*) не ограничиваем.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT role INTO v_role FROM k24_profiles WHERE id = auth.uid();
  IF v_role IN ('admin', 'manager') THEN
    RETURN NEW;
  END IF;
  IF NEW.price_final IS DISTINCT FROM OLD.price_final
    OR NEW.cost_total IS DISTINCT FROM OLD.cost_total
    OR NEW.cost_materials IS DISTINCT FROM OLD.cost_materials
    OR NEW.cost_labor IS DISTINCT FROM OLD.cost_labor
    OR NEW.markup IS DISTINCT FROM OLD.markup
    OR NEW.discount_pct IS DISTINCT FROM OLD.discount_pct
    OR NEW.price_per_unit IS DISTINCT FROM OLD.price_per_unit
    OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
    OR NEW.deal_name IS DISTINCT FROM OLD.deal_name
    OR NEW.bitrix_deal_id IS DISTINCT FROM OLD.bitrix_deal_id
    OR NEW.qty IS DISTINCT FROM OLD.qty
    OR NEW.order_type IS DISTINCT FROM OLD.order_type
    OR NEW.client_id IS DISTINCT FROM OLD.client_id
    OR NEW.deadline IS DISTINCT FROM OLD.deadline
    OR NEW.priority IS DISTINCT FROM OLD.priority
    OR NEW.sticker_shape IS DISTINCT FROM OLD.sticker_shape
    OR NEW.route_version IS DISTINCT FROM OLD.route_version
    OR NEW.contractor_cost IS DISTINCT FROM OLD.contractor_cost
    OR NEW.is_subcontract IS DISTINCT FROM OLD.is_subcontract
    OR NEW.calc_snapshot IS DISTINCT FROM OLD.calc_snapshot
    OR NEW.route_snapshot IS DISTINCT FROM OLD.route_snapshot
    -- 107: поля, влияющие на оплату / маршрут / списание материалов
    OR NEW.stickers_per_pack IS DISTINCT FROM OLD.stickers_per_pack
    OR NEW.design_variants IS DISTINCT FROM OLD.design_variants
    OR NEW.bopp_bag IS DISTINCT FROM OLD.bopp_bag
    OR NEW.is_3d IS DISTINCT FROM OLD.is_3d
    OR NEW.is_partner IS DISTINCT FROM OLD.is_partner
    OR NEW.width_mm IS DISTINCT FROM OLD.width_mm
    OR NEW.height_mm IS DISTINCT FROM OLD.height_mm
    OR NEW.need_lam IS DISTINCT FROM OLD.need_lam
    OR NEW.lam_type IS DISTINCT FROM OLD.lam_type
    OR NEW.lam_material_id IS DISTINCT FROM OLD.lam_material_id
    OR NEW.film_type IS DISTINCT FROM OLD.film_type
    OR NEW.film_material_id IS DISTINCT FROM OLD.film_material_id
    OR NEW.film_type_stickers IS DISTINCT FROM OLD.film_type_stickers
    OR NEW.film_stickers_material_id IS DISTINCT FROM OLD.film_stickers_material_id
    OR NEW.needs_montage_film IS DISTINCT FROM OLD.needs_montage_film
    OR NEW.montage_material_id IS DISTINCT FROM OLD.montage_material_id
    OR NEW.delivery_type IS DISTINCT FROM OLD.delivery_type
    OR NEW.contractor_id IS DISTINCT FROM OLD.contractor_id
  THEN
    RAISE EXCEPTION 'Access denied: workers cannot modify protected order fields';
  END IF;
  RETURN NEW;
END;
$function$;

-- 4 ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_block_done_with_open_reprints()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_check BOOLEAN := false;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.route_version, 1) >= 2 THEN
    -- Вход в зону после ТК (из любого более раннего этапа, включая прыжок
    -- мимо otk) или закрытие заказа.
    v_check := (NEW.status IN ('awaiting_pickup', 'delivery', 'done')
                AND OLD.status NOT IN ('awaiting_pickup', 'delivery', 'done'))
            OR (NEW.status = 'done');
  ELSE
    v_check := (NEW.status = 'done');
  END IF;
  IF v_check AND EXISTS (
    SELECT 1 FROM k24_order_subtasks
     WHERE order_id = NEW.id
       AND track = 'reprint'
       AND NOT is_legacy
       AND status <> 'done'
  ) THEN
    RAISE EXCEPTION 'REPRINTS_NOT_DONE';
  END IF;
  RETURN NEW;
END;
$function$;

-- 5 ───────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS settings_select ON public.k24_settings;
CREATE POLICY settings_select ON public.k24_settings
  FOR SELECT TO authenticated
  USING (
    key <> 'calculator'
    OR EXISTS (
      SELECT 1
        FROM k24_profiles p
        JOIN k24_role_permissions rp ON rp.role = p.role
       WHERE p.id = (SELECT auth.uid())
         AND rp.allowed
         AND rp.permission IN ('view:calculator', 'calc:settings')
    )
  );

-- 6 ───────────────────────────────────────────────────────────────────────
ALTER FUNCTION public.fn_subtasks_updated_at() SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.fn_set_order_comments_updated_at() SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.fn_order_items_updated_at() SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.fn_plan_overrides_updated_at() SET search_path TO 'public', 'pg_temp';

-- 7 ───────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_client_id ON public.k24_orders (client_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_by ON public.k24_orders (created_by);
CREATE INDEX IF NOT EXISTS idx_orders_montage_material_id ON public.k24_orders (montage_material_id);
CREATE INDEX IF NOT EXISTS idx_materials_category_id ON public.k24_materials (category_id);
CREATE INDEX IF NOT EXISTS idx_materials_wh_status_id ON public.k24_materials (wh_status_id);
CREATE INDEX IF NOT EXISTS idx_order_materials_category_id ON public.k24_order_materials (category_id);
CREATE INDEX IF NOT EXISTS idx_order_comments_author_id ON public.k24_order_comments (author_id);
CREATE INDEX IF NOT EXISTS idx_order_attachments_uploaded_by ON public.k24_order_attachments (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_order_status_history_changed_by ON public.k24_order_status_history (changed_by);
CREATE INDEX IF NOT EXISTS idx_mat_tx_created_by ON public.k24_material_transactions (created_by);
