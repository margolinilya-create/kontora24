-- Migration 029: поэвидовой учёт стикеров 3D-стикерпака → k24_production_logs
--
-- Фидбэк менеджера 14.05: поэвидовой ввод (PackDesignsForm) писал напрямую в
-- k24_pack_designs БЕЗ worker_id и НЕ создавал production_log. Поэтому работа
-- сотрудника «пропадала»: не видна в кабинете, не шла в сдельную оплату, а на
-- печати ещё и не двигала заказ (печать смотрит на production_logs).
--
-- Решение: поэвидовой ввод унифицирован на k24_production_logs. Каждый «+» по
-- виду создаёт production_log с worker_id + track='stickers' + design_index.
-- k24_pack_designs остаётся метаданными вида (design_index, name, qty_target);
-- прогресс по виду считается из логов.
--
-- БЕЗОПАСНОСТЬ: только ADD COLUMN IF NOT EXISTS + CREATE INDEX + идемпотентный
-- бэкфилл (NOT EXISTS-гард) + CREATE OR REPLACE FUNCTION. Существующие данные
-- не изменяются и не удаляются.

-- ============================================================
-- 1. КОЛОНКА design_index НА production_logs
-- ============================================================
ALTER TABLE k24_production_logs ADD COLUMN IF NOT EXISTS design_index INT;

CREATE INDEX IF NOT EXISTS idx_prod_logs_design
  ON k24_production_logs(order_id, stage, design_index)
  WHERE design_index IS NOT NULL AND deleted_at IS NULL;

-- ============================================================
-- 2. БЭКФИЛЛ существующего поэвидового прогресса
--    k24_pack_designs.qty_poured/qty_defects → k24_production_logs
--
--    qty_poured в старой схеме переиспользовался между этапами, но из-за
--    сломанной логики завершения поэвидовой ввод НЕ продвигал заказ — значит
--    заказ «застревал» на том этапе, где его вводили. Поэтому qty_poured
--    однозначно относится к ТЕКУЩЕМУ статусу заказа (если это поэвидовой этап).
--    Бэкфиллим только заказы, стоящие сейчас на print/cutting/selection_pouring.
--    Гард NOT EXISTS делает миграцию идемпотентной.
-- ============================================================
INSERT INTO k24_production_logs (
  order_id, stage, worker_id, track, design_index,
  stickers_printed, qty_cut, stickers_good, defects, notes, created_at
)
SELECT
  pd.order_id,
  o.status AS stage,
  COALESCE(
    o.assigned_to,
    o.created_by,
    (SELECT id FROM k24_profiles WHERE role IN ('admin', 'manager') ORDER BY role LIMIT 1)
  ) AS worker_id,
  'stickers' AS track,
  pd.design_index,
  CASE WHEN o.status = 'print' THEN COALESCE(pd.qty_poured, 0) ELSE 0 END,
  CASE WHEN o.status = 'cutting' THEN COALESCE(pd.qty_poured, 0) ELSE 0 END,
  CASE WHEN o.status = 'selection_pouring' THEN COALESCE(pd.qty_poured, 0) ELSE 0 END,
  CASE WHEN o.status IN ('cutting', 'selection_pouring') THEN COALESCE(pd.qty_defects, 0) ELSE 0 END,
  'Перенос прогресса по виду (миграция 029)' AS notes,
  NOW()
FROM k24_pack_designs pd
JOIN k24_orders o ON o.id = pd.order_id
WHERE o.order_type = 'stickerpack3D'
  AND o.status IN ('print', 'cutting', 'selection_pouring')
  AND (COALESCE(pd.qty_poured, 0) > 0 OR COALESCE(pd.qty_defects, 0) > 0)
  AND NOT EXISTS (
    SELECT 1 FROM k24_production_logs pl
    WHERE pl.order_id = pd.order_id
      AND pl.design_index IS NOT NULL
      AND pl.deleted_at IS NULL
  );

-- ============================================================
-- 3. check_stage_completion — поэвидовая завершённость стикеров
--    Для stickerpack3D на track='stickers' этапов print/cutting/selection_pouring
--    считаем завершённость как MIN по design_index суммы количественного поля
--    из k24_production_logs (каждый вид должен быть выполнен >= тиража).
--    Остальные ветки — как в миграции 023 (без изменений).
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

  -- stickerpack3D, трек «стикеры»: поэвидовая проверка по production_logs.
  IF v_order_type = 'stickerpack3D' AND p_track = 'stickers'
     AND p_stage IN ('print', 'cutting', 'selection_pouring') THEN
    SELECT COUNT(*) INTO v_designs_count FROM k24_pack_designs WHERE order_id = p_order_id;
    IF v_designs_count = 0 THEN
      RETURN json_build_object('total', 0, 'target', v_target, 'is_complete', false);
    END IF;
    SELECT COALESCE(MIN(per_total), 0) INTO v_min_per_design FROM (
      SELECT pd.design_index,
        COALESCE(SUM(
          CASE p_stage
            WHEN 'print' THEN pl.stickers_printed
            WHEN 'cutting' THEN pl.qty_cut
            WHEN 'selection_pouring' THEN pl.stickers_good
          END
        ), 0) AS per_total
      FROM k24_pack_designs pd
      LEFT JOIN k24_production_logs pl
        ON pl.order_id = pd.order_id
       AND pl.stage = p_stage
       AND pl.track = 'stickers'
       AND pl.design_index = pd.design_index
       AND pl.deleted_at IS NULL
      WHERE pd.order_id = p_order_id
      GROUP BY pd.design_index
    ) t;
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
