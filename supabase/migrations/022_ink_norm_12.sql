-- Migration 022: норматив краски снижен с 50 до 12 мл/м²
--
-- 50 мл/м² было верхней границей для 100% сплошной заливки CMYK на принтерах конца 2000-х.
-- Реальный расход на современных eco-solvent (Roland/Mimaki/Mutoh) при типовом стикерном миксе
-- (фон + графика, не фуллколор-фото) ~10-15 мл/м². Берём 12 как среднее, потом откалибруем
-- по факту через сравнение с расходом из инвентаризации.

CREATE OR REPLACE FUNCTION auto_deduct_materials(p_order_id UUID, p_changed_by UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order RECORD;
  v_ink_id UUID;
  v_ink_ml NUMERIC;
BEGIN
  SELECT width_mm, height_mm, qty INTO v_order
  FROM k24_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- 12 мл краски на 1 м² площади стикеров
  v_ink_ml := (v_order.qty * v_order.width_mm * v_order.height_mm)::NUMERIC / 1000000.0 * 12;

  SELECT id INTO v_ink_id FROM k24_materials WHERE type = 'ink' ORDER BY name LIMIT 1;

  IF v_ink_id IS NOT NULL AND v_ink_ml > 0 THEN
    INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by)
    VALUES (v_ink_id, p_order_id, -v_ink_ml, 'Авто: печать заказа (краска)', p_changed_by);
    UPDATE k24_materials SET stock_qty = stock_qty - v_ink_ml, updated_at = now() WHERE id = v_ink_id;
  END IF;
END;
$$;

ALTER FUNCTION public.auto_deduct_materials(uuid, uuid) SET search_path = public, pg_temp;

-- Пересчёт списания краски по заказу #1: было -155.4 (50 мл/м²), стало -37.296 (12 мл/м²).
-- Возвращаем разницу 118.104 мл на склад.
DO $$
DECLARE
  v_order_id UUID;
  v_ink_id UUID;
  v_old_delta NUMERIC;
  v_new_delta NUMERIC;
  v_tx_id UUID;
BEGIN
  SELECT id INTO v_order_id FROM k24_orders WHERE number = 1;
  IF v_order_id IS NULL THEN RETURN; END IF;

  SELECT t.id, t.delta, t.material_id INTO v_tx_id, v_old_delta, v_ink_id
  FROM k24_material_transactions t
  JOIN k24_materials m ON m.id = t.material_id
  WHERE t.order_id = v_order_id
    AND m.type = 'ink'
    AND t.reason ILIKE 'Авто: печать заказа%'
  ORDER BY t.created_at ASC
  LIMIT 1;

  IF v_tx_id IS NULL THEN RETURN; END IF;

  -- Новый расход: 100 × 148 × 210 / 1000000 × 12 = 37.296 мл
  v_new_delta := -37.296;

  UPDATE k24_material_transactions
  SET delta = v_new_delta, reason = 'Авто: печать заказа (краска)'
  WHERE id = v_tx_id;

  -- Откатываем эффект старого delta и применяем новый: stock += -old + new
  UPDATE k24_materials
  SET stock_qty = stock_qty - v_old_delta + v_new_delta, updated_at = now()
  WHERE id = v_ink_id;
END $$;
