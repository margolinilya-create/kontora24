-- Migration 070: ветка prepress в check_stage_completion (QA follow-up).
--
-- До этого prepress уходил в общий ELSE (v_total=0) → is_complete всегда
-- false → авто-предложение перехода на препрессе не появлялось (TEST_REPORT
-- follow-up после PR #13). Общий хвост функции сравнивает с v_target = qty
-- (тираж), что для препресса неверно: таргет — число ВИДОВ, не тираж.
-- Поэтому ветка prepress имеет собственный RETURN.
--
-- Тело — актуальное из 058 (069 дропнул только 2-арг перегрузку) + новая
-- ветка + дочитывание order_type/design_variants в шапке.
--
-- Ограничение: у stickerpack3D препресс сохраняется через updateQtyPlanned
-- (k24_pack_designs.qty_planned), минуя addProductionLogAndCheckAdvance —
-- поэтому авто-предложение перехода на 3D-паке из этого пути не появится.
-- Ветка нужна для единого источника правды и будущих вызовов.

CREATE OR REPLACE FUNCTION public.check_stage_completion(
  p_order_id UUID,
  p_stage TEXT,
  p_track TEXT DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_target INT;
  v_total NUMERIC;
  v_has_sample BOOLEAN;
  v_order_type TEXT;
  v_design_variants INT;
  v_designs_total INT;
  v_designs_ready INT;
BEGIN
  SELECT qty, order_type, design_variants
    INTO v_target, v_order_type, v_design_variants
    FROM k24_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Order not found'); END IF;

  IF p_stage IN ('sample_layout', 'color_approval', 'batch_layout', 'drying') THEN
    RETURN json_build_object('total', 0, 'target', v_target, 'is_complete', true);

  ELSIF p_stage = 'sample_print' THEN
    -- R16.2: completion по наличию фото-образца, а не по sample_film_meters
    SELECT EXISTS (
      SELECT 1 FROM k24_order_attachments
      WHERE order_id = p_order_id AND kind = 'sample_print'
    ) INTO v_has_sample;
    RETURN json_build_object('total', CASE WHEN v_has_sample THEN 1 ELSE 0 END,
                              'target', 1,
                              'is_complete', v_has_sample);

  ELSIF p_stage = 'prepress' THEN
    IF v_order_type = 'stickerpack3D' THEN
      -- Препресс 3D-пака пишет только k24_pack_designs.qty_planned,
      -- production_logs может не быть вовсе. Завершено = все виды имеют план.
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
      -- Обычный заказ: prepared_qty («подготовлено видов») в production_logs,
      -- таргет = max(1, design_variants) (не тираж).
      SELECT COALESCE(SUM(prepared_qty), 0) INTO v_total
        FROM k24_production_logs
        WHERE order_id = p_order_id AND stage = 'prepress';
      RETURN json_build_object(
        'total', v_total,
        'target', GREATEST(1, COALESCE(v_design_variants, 1)),
        'is_complete', v_total >= GREATEST(1, COALESCE(v_design_variants, 1))
      );
    END IF;

  ELSIF p_stage = 'selection' THEN
    SELECT COALESCE(SUM(qty_selected), 0) INTO v_total
    FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'selection';

  ELSIF p_stage = 'print' THEN
    IF p_track = 'backgrounds' THEN
      SELECT COALESCE(SUM(backgrounds_printed), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'print' AND track = 'backgrounds';
    ELSIF p_track = 'stickers' THEN
      SELECT COALESCE(SUM(stickers_printed), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'print' AND track = 'stickers';
    ELSE
      SELECT COALESCE(SUM(stickers_printed), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'print';
    END IF;
  ELSIF p_stage = 'lamination' THEN
    SELECT COALESCE(SUM(lamination_meters), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'lamination';
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
$function$;
