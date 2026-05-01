-- Migration 002: Sync migrations with actual production schema
-- All objects below already exist in prod Supabase (created via dashboard).
-- This migration documents them for reproducibility and version control.
-- Uses IF NOT EXISTS / IF EXISTS throughout to be idempotent.

-- ============================================================
-- 1. PROFILES — fix role constraint, add missing columns
-- ============================================================
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'manager', 'designer', 'printer', 'assembler', 'resin_pourer'));

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT true;

-- ============================================================
-- 2. ORDERS — add missing columns
-- ============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bitrix_deal_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bitrix_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dry_until TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checklist JSONB DEFAULT '{}';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;

-- ============================================================
-- 3. MATERIAL_TRANSACTIONS — add reservation_status
-- ============================================================
ALTER TABLE material_transactions ADD COLUMN IF NOT EXISTS reservation_status TEXT DEFAULT 'consumed';

-- ============================================================
-- 4. ORDER_COMMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS order_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  author_id UUID REFERENCES profiles(id),
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE order_comments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'order_comments' AND policyname = 'order_comments_select') THEN
    CREATE POLICY order_comments_select ON order_comments FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'order_comments' AND policyname = 'order_comments_insert') THEN
    CREATE POLICY order_comments_insert ON order_comments FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- 5. ORDER_ATTACHMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS order_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE order_attachments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'order_attachments' AND policyname = 'order_attachments_select') THEN
    CREATE POLICY order_attachments_select ON order_attachments FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'order_attachments' AND policyname = 'order_attachments_insert') THEN
    CREATE POLICY order_attachments_insert ON order_attachments FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'order_attachments' AND policyname = 'order_attachments_delete') THEN
    CREATE POLICY order_attachments_delete ON order_attachments FOR DELETE TO authenticated
      USING (uploaded_by = auth.uid() OR EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')
      ));
  END IF;
END $$;

-- ============================================================
-- 6. TIME_ENTRIES
-- ============================================================
CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  status TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'time_entries' AND policyname = 'time_entries_own') THEN
    CREATE POLICY time_entries_own ON time_entries FOR ALL TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'time_entries' AND policyname = 'time_entries_admin_select') THEN
    CREATE POLICY time_entries_admin_select ON time_entries FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')));
  END IF;
END $$;

-- ============================================================
-- 7. INTEGRATION_LOG (table already in 20260501 migration, ensure complete)
-- ============================================================
CREATE TABLE IF NOT EXISTS integration_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction TEXT NOT NULL,
  endpoint TEXT,
  payload JSONB,
  response JSONB,
  status TEXT NOT NULL,
  error_message TEXT,
  order_id UUID REFERENCES orders(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE integration_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'integration_log' AND policyname = 'integration_log_select') THEN
    CREATE POLICY integration_log_select ON integration_log FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'integration_log' AND policyname = 'integration_log_insert') THEN
    CREATE POLICY integration_log_insert ON integration_log FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- 8. ORDER_AUDIT
-- ============================================================
CREATE TABLE IF NOT EXISTS order_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ DEFAULT now(),
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT
);

ALTER TABLE order_audit ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'order_audit' AND policyname = 'order_audit_select') THEN
    CREATE POLICY order_audit_select ON order_audit FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')));
  END IF;
END $$;

-- ============================================================
-- 9. RPC FUNCTIONS
-- ============================================================

-- update_stock: atomically update material stock
CREATE OR REPLACE FUNCTION update_stock(p_material_id UUID, p_delta NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE new_qty NUMERIC;
BEGIN
  UPDATE materials SET stock_qty = stock_qty + p_delta, updated_at = now()
  WHERE id = p_material_id RETURNING stock_qty INTO new_qty;
  RETURN new_qty;
END;
$$;

-- update_updated_at: trigger to auto-set updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- auto_deduct_materials: deduct film/ink/lam when order enters print
CREATE OR REPLACE FUNCTION auto_deduct_materials(p_order_id UUID, p_changed_by UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order RECORD;
  v_film_id UUID;
  v_ink_id UUID;
  v_film_area NUMERIC;
  v_ink_area NUMERIC;
BEGIN
  SELECT width_mm, height_mm, qty, need_lam INTO v_order
  FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_film_area := CEIL(v_order.qty::NUMERIC / GREATEST(FLOOR(1230.0 / (v_order.width_mm + 6)), 1))
    * (1230.0 * (v_order.height_mm + 30)) / 1000000;
  v_ink_area := (v_order.qty * v_order.width_mm * v_order.height_mm)::NUMERIC / 1000000;

  SELECT id INTO v_film_id FROM materials WHERE type = 'film' LIMIT 1;
  SELECT id INTO v_ink_id FROM materials WHERE type = 'ink' LIMIT 1;

  IF v_film_id IS NOT NULL AND v_film_area > 0 THEN
    INSERT INTO material_transactions (material_id, order_id, delta, reason, created_by)
    VALUES (v_film_id, p_order_id, -v_film_area, 'Авто: печать заказа', p_changed_by);
    UPDATE materials SET stock_qty = stock_qty - v_film_area, updated_at = now() WHERE id = v_film_id;
  END IF;

  IF v_ink_id IS NOT NULL AND v_ink_area > 0 THEN
    INSERT INTO material_transactions (material_id, order_id, delta, reason, created_by)
    VALUES (v_ink_id, p_order_id, -(v_ink_area * 50), 'Авто: печать заказа', p_changed_by);
    UPDATE materials SET stock_qty = stock_qty - (v_ink_area * 50), updated_at = now() WHERE id = v_ink_id;
  END IF;

  IF v_order.need_lam THEN
    DECLARE v_lam_id UUID;
    BEGIN
      SELECT id INTO v_lam_id FROM materials WHERE type = 'lam_film' LIMIT 1;
      IF v_lam_id IS NOT NULL THEN
        INSERT INTO material_transactions (material_id, order_id, delta, reason, created_by)
        VALUES (v_lam_id, p_order_id, -v_film_area, 'Авто: ламинация заказа', p_changed_by);
        UPDATE materials SET stock_qty = stock_qty - v_film_area, updated_at = now() WHERE id = v_lam_id;
      END IF;
    END;
  END IF;
END;
$$;

-- reserve_materials: reserve materials when order is created
CREATE OR REPLACE FUNCTION reserve_materials(p_order_id UUID, p_changed_by UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order RECORD;
  v_film_m2 NUMERIC;
  v_ink_m2 NUMERIC;
  v_lam_m2 NUMERIC;
  v_resin_g NUMERIC;
  v_material RECORD;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_film_m2 := CEIL(v_order.qty::NUMERIC / GREATEST(FLOOR(1230.0 / (v_order.width_mm + 6)), 1))
               * (1230.0 * (v_order.height_mm + 30)) / 1000000.0;
  v_ink_m2 := (v_order.qty * v_order.width_mm * v_order.height_mm) / 1000000.0;
  v_lam_m2 := CASE WHEN v_order.need_lam THEN v_film_m2 ELSE 0 END;
  v_resin_g := CASE WHEN v_order.order_type IN ('sticker3D', 'stickerpack3D')
               THEN (v_order.width_mm * v_order.height_mm / 100.0) * 0.1444 * v_order.qty ELSE 0 END;

  IF v_film_m2 > 0 THEN
    FOR v_material IN SELECT id FROM materials WHERE type = 'film' LIMIT 1 LOOP
      INSERT INTO material_transactions (material_id, order_id, delta, reason, created_by, reservation_status)
      VALUES (v_material.id, p_order_id, -v_film_m2, 'Резерв под заказ', p_changed_by, 'reserved');
    END LOOP;
  END IF;

  IF v_ink_m2 > 0 THEN
    FOR v_material IN SELECT id FROM materials WHERE type = 'ink' LIMIT 1 LOOP
      INSERT INTO material_transactions (material_id, order_id, delta, reason, created_by, reservation_status)
      VALUES (v_material.id, p_order_id, -v_ink_m2, 'Резерв под заказ', p_changed_by, 'reserved');
    END LOOP;
  END IF;

  IF v_lam_m2 > 0 THEN
    FOR v_material IN SELECT id FROM materials WHERE type = 'lam_film' LIMIT 1 LOOP
      INSERT INTO material_transactions (material_id, order_id, delta, reason, created_by, reservation_status)
      VALUES (v_material.id, p_order_id, -v_lam_m2, 'Резерв под заказ', p_changed_by, 'reserved');
    END LOOP;
  END IF;

  IF v_resin_g > 0 THEN
    FOR v_material IN SELECT id FROM materials WHERE type = 'resin' LIMIT 1 LOOP
      INSERT INTO material_transactions (material_id, order_id, delta, reason, created_by, reservation_status)
      VALUES (v_material.id, p_order_id, -v_resin_g, 'Резерв под заказ', p_changed_by, 'reserved');
    END LOOP;
  END IF;
END;
$$;

-- release_materials: return reserved materials when order is cancelled
CREATE OR REPLACE FUNCTION release_materials(p_order_id UUID, p_changed_by UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_tx RECORD;
BEGIN
  FOR v_tx IN
    SELECT id, material_id, delta FROM material_transactions
    WHERE order_id = p_order_id AND reservation_status = 'reserved'
  LOOP
    INSERT INTO material_transactions (material_id, order_id, delta, reason, created_by, reservation_status)
    VALUES (v_tx.material_id, p_order_id, -v_tx.delta, 'Возврат резерва', p_changed_by, 'released');
    UPDATE materials SET stock_qty = stock_qty + (-v_tx.delta), updated_at = NOW() WHERE id = v_tx.material_id;
    UPDATE material_transactions SET reservation_status = 'released' WHERE id = v_tx.id;
  END LOOP;
END;
$$;

-- consume_reservations: mark reserved materials as consumed
CREATE OR REPLACE FUNCTION consume_reservations(p_order_id UUID, p_changed_by UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE material_transactions
  SET reservation_status = 'consumed'
  WHERE order_id = p_order_id AND reservation_status = 'reserved';
END;
$$;

-- is_admin: helper for RLS policies
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;
