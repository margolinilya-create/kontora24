-- k24_production_logs — core production tracking table
-- Workers log quantities at each stage. Order advances when total >= тираж.
CREATE TABLE IF NOT EXISTS k24_production_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES k24_orders(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  worker_id UUID NOT NULL REFERENCES k24_profiles(id),
  -- Print stage
  stickers_printed INT DEFAULT 0,
  backgrounds_printed INT DEFAULT 0,
  film_meters NUMERIC DEFAULT 0,
  film_type TEXT,
  -- Resin stage
  stickers_poured INT DEFAULT 0,
  stickers_good INT DEFAULT 0,
  resin_grams NUMERIC DEFAULT 0,
  -- Assembly stage (выборка + сборка)
  packs_selected INT DEFAULT 0,
  packs_assembled INT DEFAULT 0,
  -- Packaging stage
  packs_packaged INT DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prod_logs_order_stage ON k24_production_logs(order_id, stage);
CREATE INDEX IF NOT EXISTS idx_prod_logs_worker ON k24_production_logs(worker_id, created_at);

ALTER TABLE k24_production_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY prod_logs_select ON k24_production_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY prod_logs_insert ON k24_production_logs FOR INSERT TO authenticated WITH CHECK (worker_id = auth.uid());
CREATE POLICY prod_logs_admin_insert ON k24_production_logs FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM k24_profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
);

-- k24_shift_entries — worker clock-in / clock-out
CREATE TABLE IF NOT EXISTS k24_shift_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES k24_profiles(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_minutes INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shift_worker ON k24_shift_entries(worker_id, started_at);

ALTER TABLE k24_shift_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY shift_select ON k24_shift_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY shift_own ON k24_shift_entries FOR ALL TO authenticated USING (worker_id = auth.uid());
CREATE POLICY shift_admin ON k24_shift_entries FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM k24_profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
);

-- RPC: check if stage is complete (total logged >= order qty)
CREATE OR REPLACE FUNCTION check_stage_completion(p_order_id UUID, p_stage TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_target INT;
  v_total INT;
BEGIN
  SELECT qty INTO v_target FROM k24_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Order not found'); END IF;

  IF p_stage = 'print' THEN
    SELECT COALESCE(SUM(stickers_printed), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'print';
  ELSIF p_stage = 'resin_pouring' THEN
    SELECT COALESCE(SUM(stickers_good), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'resin_pouring';
  ELSIF p_stage = 'assembly' THEN
    SELECT COALESCE(SUM(packs_assembled), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'assembly';
  ELSIF p_stage = 'packaging' THEN
    SELECT COALESCE(SUM(packs_packaged), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'packaging';
  ELSIF p_stage = 'post_processing' THEN
    SELECT COALESCE(SUM(stickers_printed), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'post_processing';
  ELSE
    v_total := 0;
  END IF;

  RETURN json_build_object('total', v_total, 'target', v_target, 'is_complete', v_total >= v_target);
END;
$$;
