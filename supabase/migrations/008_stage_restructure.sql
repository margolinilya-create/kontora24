-- Migration 008: Stage system restructure
-- Cleans test data, adds new stages, replaces roles, updates production logging
-- IMPORTANT: This is a destructive migration — all order data is cleared (clean start)

-- ============================================================
-- 1. CLEAN ALL ORDER-RELATED DATA (test data, fresh start)
-- ============================================================
TRUNCATE TABLE k24_production_logs CASCADE;
TRUNCATE TABLE k24_shift_entries CASCADE;
TRUNCATE TABLE k24_order_status_history CASCADE;
TRUNCATE TABLE k24_order_comments CASCADE;
TRUNCATE TABLE k24_order_attachments CASCADE;
TRUNCATE TABLE k24_time_entries CASCADE;
TRUNCATE TABLE k24_material_transactions CASCADE;
TRUNCATE TABLE k24_integration_log CASCADE;
TRUNCATE TABLE k24_order_audit CASCADE;
TRUNCATE TABLE k24_order_templates CASCADE;
TRUNCATE TABLE k24_orders CASCADE;

-- ============================================================
-- 2. UPDATE ROLES: assembler + resin_pourer → post_printer
-- ============================================================
UPDATE k24_profiles SET role = 'post_printer' WHERE role IN ('assembler', 'resin_pourer');

ALTER TABLE k24_profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE k24_profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'manager', 'designer', 'printer', 'post_printer'));

-- ============================================================
-- 3. DROP dry_until FROM ORDERS (no more automatic timer)
-- ============================================================
ALTER TABLE k24_orders DROP COLUMN IF EXISTS dry_until;

-- ============================================================
-- 4. ADD COLUMNS TO production_logs FOR NEW STAGES
-- ============================================================
ALTER TABLE k24_production_logs ADD COLUMN IF NOT EXISTS track TEXT DEFAULT NULL;
-- track values: NULL (single-track), 'backgrounds', 'stickers'

ALTER TABLE k24_production_logs ADD COLUMN IF NOT EXISTS lamination_meters NUMERIC DEFAULT 0;
ALTER TABLE k24_production_logs ADD COLUMN IF NOT EXISTS defects INT DEFAULT 0;
ALTER TABLE k24_production_logs ADD COLUMN IF NOT EXISTS qty_cut INT DEFAULT 0;
ALTER TABLE k24_production_logs ADD COLUMN IF NOT EXISTS qty_selected INT DEFAULT 0;

-- Index for track-based queries
CREATE INDEX IF NOT EXISTS idx_prod_logs_track ON k24_production_logs(order_id, stage, track);

-- ============================================================
-- 5. UPDATE check_stage_completion RPC FOR NEW STAGES + TRACK
-- ============================================================
CREATE OR REPLACE FUNCTION check_stage_completion(p_order_id UUID, p_stage TEXT, p_track TEXT DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_target INT;
  v_total INT;
BEGIN
  SELECT qty INTO v_target FROM k24_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Order not found'); END IF;

  IF p_stage = 'print' THEN
    IF p_track = 'backgrounds' THEN
      SELECT COALESCE(SUM(backgrounds_printed), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'print' AND track = 'backgrounds';
    ELSIF p_track = 'stickers' THEN
      SELECT COALESCE(SUM(stickers_printed), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'print' AND track = 'stickers';
    ELSE
      SELECT COALESCE(SUM(stickers_printed), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'print';
    END IF;

  ELSIF p_stage = 'lamination' THEN
    SELECT COALESCE(SUM(lamination_meters), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'lamination';
    -- Lamination completion is not qty-based, return meters logged
    RETURN json_build_object('total', v_total, 'target', v_target, 'is_complete', v_total > 0);

  ELSIF p_stage = 'cutting' THEN
    IF p_track IS NOT NULL THEN
      SELECT COALESCE(SUM(qty_cut), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'cutting' AND track = p_track;
    ELSE
      SELECT COALESCE(SUM(qty_cut), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'cutting';
    END IF;

  ELSIF p_stage = 'pouring' THEN
    SELECT COALESCE(SUM(stickers_good), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'pouring';

  ELSIF p_stage = 'selection_pouring' THEN
    IF p_track = 'backgrounds' THEN
      SELECT COALESCE(SUM(qty_selected), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'selection_pouring' AND track = 'backgrounds';
    ELSIF p_track = 'stickers' THEN
      SELECT COALESCE(SUM(stickers_good), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'selection_pouring' AND track = 'stickers';
    ELSE
      SELECT COALESCE(SUM(qty_selected), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'selection_pouring';
    END IF;

  ELSIF p_stage = 'assembly_3d' THEN
    SELECT COALESCE(SUM(packs_assembled), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'assembly_3d';

  ELSIF p_stage = 'packaging' THEN
    SELECT COALESCE(SUM(packs_packaged), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'packaging';

  ELSE
    v_total := 0;
  END IF;

  RETURN json_build_object('total', v_total, 'target', v_target, 'is_complete', v_total >= v_target);
END;
$$;

-- ============================================================
-- 6. REMOVE CALCULATOR/MARKUP SETTINGS
-- ============================================================
DELETE FROM k24_settings WHERE key IN ('calculator', 'markups');

-- ============================================================
-- 7. UPDATE RLS POLICIES FOR NEW ROLES
-- ============================================================
-- Drop and recreate policies that reference old roles
DROP POLICY IF EXISTS k24_orders_worker_update ON k24_orders;
CREATE POLICY k24_orders_worker_update ON k24_orders FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM k24_profiles WHERE id = auth.uid() AND role IN ('admin', 'manager', 'printer', 'post_printer')
  ));

DROP POLICY IF EXISTS k24_materials_worker_select ON k24_materials;
CREATE POLICY k24_materials_worker_select ON k24_materials FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM k24_profiles WHERE id = auth.uid() AND role IN ('admin', 'manager', 'printer', 'post_printer')
  ));
