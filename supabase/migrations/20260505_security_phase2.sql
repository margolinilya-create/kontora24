-- Security Phase 2: Financial data protection + column-level update restrictions
-- 1. Create secure view that hides financial fields from workers
-- 2. Add BEFORE UPDATE trigger to block workers from changing protected columns
-- 3. Fix order_status_history INSERT policy (prevent changed_by spoofing)

-- ============================================================
-- 1. Secure view for orders (hides financial data from non-admin/manager)
-- ============================================================

-- RPC function to fetch orders with role-based field filtering
CREATE OR REPLACE FUNCTION k24_get_orders_safe(p_user_id uuid DEFAULT auth.uid())
RETURNS SETOF k24_orders
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM k24_profiles WHERE id = p_user_id;

  IF v_role IN ('admin', 'manager') THEN
    -- Full access
    RETURN QUERY SELECT * FROM k24_orders;
  ELSE
    -- Zero out financial fields for workers
    RETURN QUERY
      SELECT
        id, number, deal_name, bitrix_deal_id, bitrix_url,
        order_type, status, qty, width_mm, height_mm,
        need_lam, lam_type, film_type, design_variants, stickers_per_pack,
        design_status, mockup_path, client_id, assigned_to, deadline,
        priority, notes, is_3d, is_urgent, needs_montage_film,
        needs_individual_cut, bopp_bag,
        -- Financial fields zeroed out
        NULL::numeric AS cost_materials,
        NULL::numeric AS cost_labor,
        NULL::numeric AS cost_total,
        NULL::numeric AS markup,
        NULL::numeric AS discount_pct,
        NULL::numeric AS price_final,
        NULL::numeric AS price_per_unit,
        -- Production fields (visible to all)
        printed_meters, resin_used, printed_qty, rejected_qty, checklist,
        -- Metadata
        is_partner, source, source_referrer, payment_status,
        delivery_type, delivery_city, delivery_address, delivery_notes,
        created_by, created_at, updated_at
      FROM k24_orders;
  END IF;
END;
$$;

-- ============================================================
-- 2. BEFORE UPDATE trigger: block workers from changing protected columns
-- ============================================================

CREATE OR REPLACE FUNCTION k24_protect_order_columns()
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
  THEN
    RAISE EXCEPTION 'Access denied: workers cannot modify protected order fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_order_columns ON k24_orders;
CREATE TRIGGER protect_order_columns
  BEFORE UPDATE ON k24_orders
  FOR EACH ROW
  EXECUTE FUNCTION k24_protect_order_columns();

-- ============================================================
-- 3. Fix order_status_history INSERT: enforce changed_by = current user
-- ============================================================

DROP POLICY IF EXISTS "order_status_history_insert" ON k24_order_status_history;

CREATE POLICY "order_status_history_insert" ON k24_order_status_history
  FOR INSERT TO authenticated
  WITH CHECK (changed_by = auth.uid());
