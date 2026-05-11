-- 023: ламинация считается завершённой по lamination_qty (шт), а не lamination_meters > 0.
--
-- До этого RPC check_stage_completion(stage='lamination') возвращал is_complete=true
-- при любом lamination_meters > 0. Это означало, что печатник мог залогировать
-- 0.5 м ламинации на тираж 1000 стикеров и заказ автоматически двигался дальше
-- с 0 заламинированных штук.
--
-- Форма уже пишет lamination_qty (шт) с R-апдейта 11.05, но RPC об этом не знал.
-- Поправляем: считаем lamination_qty >= qty заказа.

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

  IF p_stage = 'print' THEN
    IF p_track = 'backgrounds' THEN
      SELECT COALESCE(SUM(backgrounds_printed), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'print' AND track = 'backgrounds' AND deleted_at IS NULL;
    ELSIF p_track = 'stickers' THEN
      SELECT COALESCE(SUM(stickers_printed), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'print' AND track = 'stickers' AND deleted_at IS NULL;
    ELSE
      SELECT COALESCE(SUM(stickers_printed), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'print' AND deleted_at IS NULL;
    END IF;

  ELSIF p_stage = 'lamination' THEN
    -- БЫЛО: SUM(lamination_meters) > 0 — фальшивое «готово» при 0.001 м.
    -- СТАЛО: SUM(lamination_qty) >= qty заказа.
    SELECT COALESCE(SUM(lamination_qty), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'lamination' AND deleted_at IS NULL;
    RETURN json_build_object('total', v_total, 'target', v_target, 'is_complete', v_total >= v_target);

  ELSIF p_stage = 'cutting' THEN
    IF p_track IS NOT NULL THEN
      SELECT COALESCE(SUM(qty_cut), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'cutting' AND track = p_track AND deleted_at IS NULL;
    ELSE
      SELECT COALESCE(SUM(qty_cut), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'cutting' AND deleted_at IS NULL;
    END IF;

  ELSIF p_stage = 'pouring' THEN
    SELECT COALESCE(SUM(stickers_good), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'pouring' AND deleted_at IS NULL;

  ELSIF p_stage = 'selection_pouring' THEN
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

ALTER FUNCTION public.check_stage_completion(uuid, text, text) SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.check_stage_completion(uuid, text, text) FROM anon;
