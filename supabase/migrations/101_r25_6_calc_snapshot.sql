-- ============================================================
-- R25.6 (ТЗ 17.11, Фаза 6) — «Создать заказ» из калькулятора
-- ============================================================
-- Аддитивная и идемпотентная миграция (можно прогнать повторно):
--   1. k24_orders.calc_snapshot JSONB — снимок расчёта калькулятора (дата, кто,
--      запись истории настроек, входные данные, цена, итого, себестоимость,
--      наценка, текст «Скопировать подробно»). ФИНАНСОВАЯ колонка (процедура
--      миграции 072): колоночный GRANT для authenticated НЕ выдаём — сотрудник
--      цеха прямым запросом к k24_orders получит 42501.
--   2. k24_orders_full: тело 099 ДОСЛОВНО + calc_snapshot в конце, маска CASE
--      по view:finance (как price_final / contractor_cost).
--   3. k24_protect_order_columns: тело 099 ДОСЛОВНО + calc_snapshot (воркер не
--      может переписать снимок). Триггер BEFORE UPDATE — на INSERT не влияет:
--      заказ из калькулятора пишет цену и снимок при создании и без права на
--      финансы (ТЗ 6.2 «поле скрыто, но заполнено»).
--
-- Порядок: применить 101 ДО деплоя фронта R25.6 (фронт пишет calc_snapshot при
-- создании заказа и читает его из k24_orders_full во вкладке «Финансы»).
-- Rollback (данные не теряются): пересоздать k24_protect_order_columns из 099;
--   view и колонку оставить (лишняя замаскированная колонка безвредна).

-- ── 1. Колонка ──────────────────────────────────────────────
ALTER TABLE public.k24_orders
  ADD COLUMN IF NOT EXISTS calc_snapshot JSONB;

COMMENT ON COLUMN public.k24_orders.calc_snapshot IS
  'R25.6: снимок расчёта калькулятора, из которого создан заказ. ФИНАНСОВАЯ: без GRANT authenticated, читать через k24_orders_full.';

-- Финансовая колонка: колоночный GRANT SELECT НЕ выдаём. REVOKE — страховка
-- на случай ручной выдачи (повторный прогон безопасен: REVOKE несуществующей
-- привилегии — no-op).
REVOKE SELECT (calc_snapshot) ON public.k24_orders FROM authenticated;

-- ── 2. View: копия 099 + calc_snapshot в конце ──────────────
-- CREATE OR REPLACE VIEW допускает только добавление колонок в конец.
CREATE OR REPLACE VIEW public.k24_orders_full AS
SELECT
  o.id,
  o.number,
  o.client_id,
  o.order_type,
  o.status,
  o.width_mm,
  o.height_mm,
  o.qty,
  o.design_variants,
  o.need_lam,
  o.lam_type,
  CASE WHEN EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role WHERE p.id = auth.uid() AND rp.permission = 'view:finance' AND rp.allowed) THEN o.cost_materials END AS cost_materials,
  CASE WHEN EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role WHERE p.id = auth.uid() AND rp.permission = 'view:finance' AND rp.allowed) THEN o.cost_labor END AS cost_labor,
  CASE WHEN EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role WHERE p.id = auth.uid() AND rp.permission = 'view:finance' AND rp.allowed) THEN o.cost_total END AS cost_total,
  CASE WHEN EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role WHERE p.id = auth.uid() AND rp.permission = 'view:finance' AND rp.allowed) THEN o.markup END AS markup,
  CASE WHEN EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role WHERE p.id = auth.uid() AND rp.permission = 'view:finance' AND rp.allowed) THEN o.discount_pct END AS discount_pct,
  CASE WHEN EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role WHERE p.id = auth.uid() AND rp.permission = 'view:finance' AND rp.allowed) THEN o.price_final END AS price_final,
  CASE WHEN EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role WHERE p.id = auth.uid() AND rp.permission = 'view:finance' AND rp.allowed) THEN o.price_per_unit END AS price_per_unit,
  o.prod_days,
  o.assigned_to,
  o.created_by,
  o.deadline,
  o.notes,
  o.created_at,
  o.updated_at,
  o.bitrix_deal_id,
  o.bitrix_url,
  o.priority,
  o.checklist,
  o.status_changed_at,
  o.film_type,
  o.stickers_per_pack,
  o.is_3d,
  o.mockup_path,
  o.is_urgent,
  o.is_partner,
  o.needs_montage_film,
  o.needs_individual_cut,
  o.printed_meters,
  o.resin_used,
  o.rejected_qty,
  o.printed_qty,
  o.deal_name,
  o.source,
  o.source_referrer,
  o.payment_status,
  o.design_status,
  o.delivery_type,
  o.delivery_city,
  o.delivery_address,
  o.delivery_notes,
  o.bopp_bag,
  o.custom_number,
  o.film_type_stickers,
  o.ink_deducted_at,
  o.drying_started_at,
  o.film_material_id,
  o.film_stickers_material_id,
  o.lam_material_id,
  o.sticker_shape,
  o.route_version,
  o.product_name,
  o.is_subcontract,
  o.contractor_id,
  o.contractor_notes,
  CASE WHEN EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role WHERE p.id = auth.uid() AND rp.permission = 'view:finance' AND rp.allowed) THEN o.contractor_cost END AS contractor_cost,
  o.montage_material_id,
  CASE WHEN EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role WHERE p.id = auth.uid() AND rp.permission = 'view:finance' AND rp.allowed) THEN o.calc_snapshot END AS calc_snapshot
FROM k24_orders o;

REVOKE ALL ON public.k24_orders_full FROM PUBLIC, anon;
GRANT SELECT ON public.k24_orders_full TO authenticated;

-- ── 3. Protect-триггер: тело 099 + calc_snapshot ────────────
-- Триггер protect_order_columns (BEFORE UPDATE, security phase 2) не меняется.
CREATE OR REPLACE FUNCTION public.k24_protect_order_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM k24_profiles WHERE id = auth.uid();

  -- Admin and manager can change anything
  IF v_role IN ('admin', 'manager') THEN
    RETURN NEW;
  END IF;

  -- Workers can only change: status, assigned_to, checklist, updated_at
  -- Block changes to financial and deal fields
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
    -- 074: форма стикера определяет ставку заливки — воркерам нельзя.
    OR NEW.sticker_shape IS DISTINCT FROM OLD.sticker_shape
    -- 093: версия маршрута определяет оплату упаковки — воркерам нельзя.
    OR NEW.route_version IS DISTINCT FROM OLD.route_version
    -- 099: стоимость подрядчика — финансовая; субподряд меняет маршрут.
    OR NEW.contractor_cost IS DISTINCT FROM OLD.contractor_cost
    OR NEW.is_subcontract IS DISTINCT FROM OLD.is_subcontract
    -- 101: снимок расчёта калькулятора — финансовый.
    OR NEW.calc_snapshot IS DISTINCT FROM OLD.calc_snapshot
  THEN
    RAISE EXCEPTION 'Access denied: workers cannot modify protected order fields';
  END IF;

  RETURN NEW;
END;
$$;
