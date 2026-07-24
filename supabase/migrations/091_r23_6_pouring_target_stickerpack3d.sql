-- ============================================================
-- R23.6 (фидбэк 24.07) — заливка stickerpack3D: таргет в стикерах
-- ============================================================
-- check_stage_completion v5: ветка pouring для stickerpack3D сравнивает сумму
-- залитых (stickers_good) с qty × stickers_per_pack, а не с qty (тиражом
-- паков). Раньше диалог «Все данные заполнены, завершить этап?» на заливке
-- всплывал уже при «тираж» залитых стикеров. Остальные ветки без изменений
-- (копия v4 из 085).
--
-- Rollback: пересоздать v4 из 085_r22_7_cutting_defects.sql.

CREATE OR REPLACE FUNCTION public.check_stage_completion(p_order_id uuid, p_stage text, p_track text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_target INT;
  v_total NUMERIC;
  v_defects NUMERIC;
  v_has_sample BOOLEAN;
  v_order_type TEXT;
  v_design_variants INT;
  v_stickers_per_pack INT;
  v_designs_total INT;
  v_designs_ready INT;
  v_items_count INT;
  v_items_qty INT;
BEGIN
  SELECT qty, order_type, design_variants, stickers_per_pack
    INTO v_target, v_order_type, v_design_variants, v_stickers_per_pack
    FROM k24_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Order not found'); END IF;

  SELECT COUNT(*), COALESCE(SUM(qty), 0) INTO v_items_count, v_items_qty
    FROM k24_order_items WHERE order_id = p_order_id;
  IF v_items_count > 1 THEN v_target := v_items_qty; END IF;

  IF p_stage IN ('sample_layout', 'color_approval', 'batch_layout', 'drying') THEN
    RETURN json_build_object('total', 0, 'target', v_target, 'is_complete', true);

  ELSIF p_stage = 'sample_print' THEN
    SELECT EXISTS (
      SELECT 1 FROM k24_order_attachments
      WHERE order_id = p_order_id AND kind = 'sample_print'
    ) INTO v_has_sample;
    RETURN json_build_object('total', CASE WHEN v_has_sample THEN 1 ELSE 0 END,
                              'target', 1, 'is_complete', v_has_sample);

  ELSIF p_stage = 'prepress' THEN
    IF v_order_type = 'stickerpack3D' THEN
      SELECT COUNT(*), COUNT(*) FILTER (WHERE COALESCE(qty_planned, 0) > 0)
        INTO v_designs_total, v_designs_ready
        FROM k24_pack_designs WHERE order_id = p_order_id;
      RETURN json_build_object(
        'total', COALESCE(v_designs_ready, 0),
        'target', COALESCE(v_designs_total, 0),
        'is_complete', COALESCE(v_designs_total, 0) > 0
                        AND COALESCE(v_designs_ready, 0) >= COALESCE(v_designs_total, 0)
      );
    ELSE
      SELECT COALESCE(SUM(prepared_qty), 0) INTO v_total
        FROM k24_production_logs
        WHERE order_id = p_order_id AND stage = 'prepress' AND deleted_at IS NULL;
      RETURN json_build_object(
        'total', v_total,
        'target', GREATEST(1, COALESCE(v_design_variants, 1)),
        'is_complete', v_total >= GREATEST(1, COALESCE(v_design_variants, 1))
      );
    END IF;

  ELSIF p_stage = 'selection' THEN
    SELECT COALESCE(SUM(qty_selected), 0) INTO v_total
    FROM k24_production_logs
    WHERE order_id = p_order_id AND deleted_at IS NULL
      AND (stage = 'selection' OR (stage = 'selection_pouring' AND (track IS NULL OR track = 'backgrounds')));

  ELSIF p_stage = 'print' THEN
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

  -- R22.7: резка — брак уменьшает завершение (годные = нарезано − брак).
  ELSIF p_stage = 'cutting' THEN
    IF p_track IS NOT NULL THEN
      SELECT COALESCE(SUM(qty_cut), 0), COALESCE(SUM(defects), 0) INTO v_total, v_defects
        FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'cutting' AND track = p_track AND deleted_at IS NULL;
    ELSE
      SELECT COALESCE(SUM(qty_cut), 0), COALESCE(SUM(defects), 0) INTO v_total, v_defects
        FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'cutting' AND deleted_at IS NULL;
    END IF;
    v_total := GREATEST(0, v_total - v_defects);

  -- R23.6: заливка stickerpack3D — считается в стикерах, таргет тоже в стикерах.
  ELSIF p_stage = 'pouring' THEN
    SELECT COALESCE(SUM(stickers_good), 0) INTO v_total
    FROM k24_production_logs
    WHERE order_id = p_order_id AND deleted_at IS NULL
      AND (stage = 'pouring' OR (stage = 'selection_pouring' AND (track IS NULL OR track = 'stickers')));
    IF v_order_type = 'stickerpack3D' THEN
      v_target := v_target * GREATEST(1, COALESCE(v_stickers_per_pack, 1));
    END IF;
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
$function$;
