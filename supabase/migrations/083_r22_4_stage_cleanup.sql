-- ============================================================
-- R22.4 (ТЗ 20.07.2026, Фаза 4Б) — упразднение dual-track подзадач + RPC v3
-- ============================================================
-- 1) Убираем авто-создание и sync-триггеры старой системы подзадач.
-- 2) Всю старую систему (bg/stickers/extra) помечаем legacy (read-only).
-- 3) check_stage_completion v3: selection/pouring читают и исторические
--    selection_pouring-логи (совместимость мигрированных заказов).
-- 4) auto_advance_drying v3: order-level сушка stickerpack3D → assembly_3d.
--
-- Rollback: пересоздать триггеры из 032/033, функции из 073/081.

-- 1. Триггеры старой системы.
DROP TRIGGER IF EXISTS trg_create_3dpack_subtasks ON k24_orders;
DROP TRIGGER IF EXISTS trg_sync_subtasks_on_status_change ON k24_orders;

-- 2. Legacy для всей старой системы (bg/stickers/extra_stickers). variant и
--    reprint не трогаем — они активные.
UPDATE k24_order_subtasks
  SET is_legacy = true
  WHERE track IN ('backgrounds', 'stickers', 'extra_stickers') AND is_legacy = false;

-- 3. check_stage_completion v3.
CREATE OR REPLACE FUNCTION public.check_stage_completion(p_order_id uuid, p_stage text, p_track text DEFAULT NULL::text)
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
  v_items_count INT;
  v_items_qty INT;
BEGIN
  SELECT qty, order_type, design_variants
    INTO v_target, v_order_type, v_design_variants
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

  -- R22.4: «Выборка» учитывает и исторические selection_pouring-логи (фоны).
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
  ELSIF p_stage = 'cutting' THEN
    IF p_track IS NOT NULL THEN
      SELECT COALESCE(SUM(qty_cut), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'cutting' AND track = p_track AND deleted_at IS NULL;
    ELSE
      SELECT COALESCE(SUM(qty_cut), 0) INTO v_total FROM k24_production_logs WHERE order_id = p_order_id AND stage = 'cutting' AND deleted_at IS NULL;
    END IF;
  -- R22.4: «Заливка» учитывает и исторические selection_pouring-логи (стикеры).
  ELSIF p_stage = 'pouring' THEN
    SELECT COALESCE(SUM(stickers_good), 0) INTO v_total
    FROM k24_production_logs
    WHERE order_id = p_order_id AND deleted_at IS NULL
      AND (stage = 'pouring' OR (stage = 'selection_pouring' AND (track IS NULL OR track = 'stickers')));
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

-- 4. auto_advance_drying v3: order-level сушка обоих 3D-типов.
CREATE OR REPLACE FUNCTION public.auto_advance_drying()
RETURNS TABLE(orders_advanced integer, subtasks_advanced integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_orders INT := 0;
  v_subtasks INT := 0;
  r RECORD;
  v_idx INT;
  v_next TEXT;
  v_order_next TEXT;
BEGIN
  FOR r IN
    SELECT id, order_type FROM k24_orders
    WHERE status = 'drying' AND order_type IN ('sticker3D', 'stickerpack3D')
      AND drying_started_at IS NOT NULL
      AND drying_started_at <= NOW() - INTERVAL '36 hours'
    FOR UPDATE SKIP LOCKED
  LOOP
    v_order_next := CASE WHEN r.order_type = 'stickerpack3D' THEN 'assembly_3d' ELSE 'selection' END;
    UPDATE k24_orders SET status = v_order_next, updated_at = NOW() WHERE id = r.id;
    INSERT INTO k24_order_status_history (order_id, from_status, to_status, changed_by)
    VALUES (r.id, 'drying', v_order_next, NULL);
    v_orders := v_orders + 1;
  END LOOP;

  FOR r IN
    SELECT id, track, route FROM k24_order_subtasks
    WHERE status = 'drying'
      AND drying_started_at IS NOT NULL
      AND drying_started_at <= NOW() - INTERVAL '36 hours'
    FOR UPDATE SKIP LOCKED
  LOOP
    IF r.track = 'reprint' AND r.route IS NOT NULL THEN
      SELECT ord - 1 INTO v_idx
        FROM (SELECT elem, ordinality AS ord
                FROM jsonb_array_elements_text(r.route) WITH ORDINALITY AS t(elem, ordinality)) x
       WHERE elem = 'drying' LIMIT 1;
      v_next := COALESCE(r.route->>(v_idx + 1), 'done');
      UPDATE k24_order_subtasks
        SET status = v_next, completed_at = CASE WHEN v_next = 'done' THEN NOW() ELSE NULL END
        WHERE id = r.id;
    ELSE
      UPDATE k24_order_subtasks SET status = 'ready', completed_at = NOW() WHERE id = r.id;
    END IF;
    v_subtasks := v_subtasks + 1;
  END LOOP;

  RETURN QUERY SELECT v_orders, v_subtasks;
END;
$function$;
