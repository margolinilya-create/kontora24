-- Migration 010: pack designs (виды стикеров в паке) + soft-delete production logs
-- ТЗ 06.05: 3D-стикерпак — у каждого вида свой прогресс залито/брак.
-- Также: soft-delete для k24_production_logs (редактирование/удаление записей).

-- ============================================================
-- 1. SOFT-DELETE FOR PRODUCTION LOGS
-- ============================================================
ALTER TABLE k24_production_logs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_prod_logs_active
  ON k24_production_logs(order_id, stage)
  WHERE deleted_at IS NULL;

-- ============================================================
-- 2. PACK DESIGNS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS k24_pack_designs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES k24_orders(id) ON DELETE CASCADE,
  design_index INT NOT NULL,
  name TEXT,
  qty_target INT NOT NULL,
  qty_poured INT NOT NULL DEFAULT 0,
  qty_defects INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (order_id, design_index)
);

CREATE INDEX IF NOT EXISTS idx_pack_designs_order ON k24_pack_designs(order_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION k24_pack_designs_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_pack_designs_updated_at ON k24_pack_designs;
CREATE TRIGGER trg_pack_designs_updated_at
BEFORE UPDATE ON k24_pack_designs FOR EACH ROW
EXECUTE FUNCTION k24_pack_designs_set_updated_at();

-- ============================================================
-- 3. RLS
-- ============================================================
ALTER TABLE k24_pack_designs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k24_pack_designs_select ON k24_pack_designs;
CREATE POLICY k24_pack_designs_select ON k24_pack_designs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS k24_pack_designs_insert ON k24_pack_designs;
CREATE POLICY k24_pack_designs_insert ON k24_pack_designs FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS k24_pack_designs_update ON k24_pack_designs;
CREATE POLICY k24_pack_designs_update ON k24_pack_designs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS k24_pack_designs_delete ON k24_pack_designs;
CREATE POLICY k24_pack_designs_delete ON k24_pack_designs FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM k24_profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')));

-- ============================================================
-- 4. AUTO-CREATE PACK DESIGNS WHEN ORDER IS CREATED
-- ============================================================
CREATE OR REPLACE FUNCTION create_pack_designs_for_order()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE i INT;
BEGIN
  IF NEW.order_type IN ('stickerpack', 'stickerpack3D')
     AND NEW.stickers_per_pack IS NOT NULL
     AND NEW.stickers_per_pack > 0 THEN
    FOR i IN 1..NEW.stickers_per_pack LOOP
      INSERT INTO k24_pack_designs (order_id, design_index, qty_target)
      VALUES (NEW.id, i, COALESCE(NEW.qty, 0))
      ON CONFLICT (order_id, design_index) DO NOTHING;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_pack_designs ON k24_orders;
CREATE TRIGGER trg_create_pack_designs
AFTER INSERT ON k24_orders FOR EACH ROW
EXECUTE FUNCTION create_pack_designs_for_order();

-- Также при изменении stickers_per_pack или qty синхронизировать
CREATE OR REPLACE FUNCTION sync_pack_designs_on_order_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE i INT;
BEGIN
  -- Только для пакетных типов
  IF NEW.order_type NOT IN ('stickerpack', 'stickerpack3D') THEN
    RETURN NEW;
  END IF;

  -- Если изменился тираж — обновить qty_target во всех видах
  IF NEW.qty IS DISTINCT FROM OLD.qty THEN
    UPDATE k24_pack_designs SET qty_target = COALESCE(NEW.qty, 0) WHERE order_id = NEW.id;
  END IF;

  -- Если увеличилось stickers_per_pack — добавить недостающие виды
  IF COALESCE(NEW.stickers_per_pack, 0) > COALESCE(OLD.stickers_per_pack, 0) THEN
    FOR i IN (COALESCE(OLD.stickers_per_pack, 0) + 1)..NEW.stickers_per_pack LOOP
      INSERT INTO k24_pack_designs (order_id, design_index, qty_target)
      VALUES (NEW.id, i, COALESCE(NEW.qty, 0))
      ON CONFLICT (order_id, design_index) DO NOTHING;
    END LOOP;
  END IF;
  -- Если уменьшилось — удалить лишние
  IF COALESCE(NEW.stickers_per_pack, 0) < COALESCE(OLD.stickers_per_pack, 0) THEN
    DELETE FROM k24_pack_designs
    WHERE order_id = NEW.id AND design_index > NEW.stickers_per_pack;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_pack_designs ON k24_orders;
CREATE TRIGGER trg_sync_pack_designs
AFTER UPDATE OF qty, stickers_per_pack ON k24_orders FOR EACH ROW
EXECUTE FUNCTION sync_pack_designs_on_order_update();

-- ============================================================
-- 5. UPDATE check_stage_completion
--    Для stickerpack3D на selection_pouring (track='stickers') —
--    проверяем что КАЖДЫЙ из видов залит >= qty_target.
-- ============================================================
CREATE OR REPLACE FUNCTION check_stage_completion(p_order_id UUID, p_stage TEXT, p_track TEXT DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_target INT;
  v_total INT;
  v_order_type TEXT;
  v_min_per_design INT;
  v_designs_count INT;
BEGIN
  SELECT qty, order_type INTO v_target, v_order_type FROM k24_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Order not found'); END IF;

  -- Для stickerpack3D на selection_pouring stickers track — проверка по pack_designs
  IF v_order_type = 'stickerpack3D' AND p_stage = 'selection_pouring' AND p_track = 'stickers' THEN
    SELECT COUNT(*) INTO v_designs_count FROM k24_pack_designs WHERE order_id = p_order_id;
    IF v_designs_count = 0 THEN
      -- Нет видов — нечего проверять
      RETURN json_build_object('total', 0, 'target', v_target, 'is_complete', false);
    END IF;
    SELECT COALESCE(MIN(qty_poured + qty_defects), 0) INTO v_min_per_design
    FROM k24_pack_designs WHERE order_id = p_order_id;
    RETURN json_build_object(
      'total', v_min_per_design,
      'target', v_target,
      'is_complete', v_min_per_design >= v_target
    );
  END IF;

  -- Для sticker3D на pouring — sum stickers_good (как было)
  IF p_stage = 'print' THEN
    IF p_track = 'backgrounds' THEN
      SELECT COALESCE(SUM(backgrounds_printed), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'print' AND track = 'backgrounds' AND deleted_at IS NULL;
    ELSIF p_track = 'stickers' THEN
      SELECT COALESCE(SUM(stickers_printed), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'print' AND track = 'stickers' AND deleted_at IS NULL;
    ELSE
      SELECT COALESCE(SUM(stickers_printed), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'print' AND deleted_at IS NULL;
    END IF;

  ELSIF p_stage = 'lamination' THEN
    SELECT COALESCE(SUM(lamination_meters), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'lamination' AND deleted_at IS NULL;
    RETURN json_build_object('total', v_total, 'target', v_target, 'is_complete', v_total > 0);

  ELSIF p_stage = 'cutting' THEN
    IF p_track IS NOT NULL THEN
      SELECT COALESCE(SUM(qty_cut), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'cutting' AND track = p_track AND deleted_at IS NULL;
    ELSE
      SELECT COALESCE(SUM(qty_cut), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'cutting' AND deleted_at IS NULL;
    END IF;

  ELSIF p_stage = 'pouring' THEN
    SELECT COALESCE(SUM(stickers_good), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'pouring' AND deleted_at IS NULL;

  ELSIF p_stage = 'selection_pouring' THEN
    -- track='backgrounds' — qty_selected; track='stickers' — stickers_good (для НЕ-3D pack)
    IF p_track = 'backgrounds' THEN
      SELECT COALESCE(SUM(qty_selected), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'selection_pouring' AND track = 'backgrounds' AND deleted_at IS NULL;
    ELSIF p_track = 'stickers' THEN
      SELECT COALESCE(SUM(stickers_good), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'selection_pouring' AND track = 'stickers' AND deleted_at IS NULL;
    ELSE
      SELECT COALESCE(SUM(qty_selected), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'selection_pouring' AND deleted_at IS NULL;
    END IF;

  ELSIF p_stage = 'assembly_3d' THEN
    SELECT COALESCE(SUM(packs_assembled), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'assembly_3d' AND deleted_at IS NULL;

  ELSIF p_stage = 'packaging' THEN
    SELECT COALESCE(SUM(packs_packaged), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'packaging' AND deleted_at IS NULL;

  ELSE
    v_total := 0;
  END IF;

  RETURN json_build_object('total', v_total, 'target', v_target, 'is_complete', v_total >= v_target);
END;
$$;
