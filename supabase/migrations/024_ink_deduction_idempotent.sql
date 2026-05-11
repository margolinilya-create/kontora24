-- 024: списание краски идемпотентно — только один раз на заказ.
--
-- Проблема: auto_deduct_materials вызывается из updateOrderStatus каждый раз, когда
-- заказ переходит в статус 'print'. При откате на prepress и повторном продвижении
-- краска списывалась повторно. На 100-300 заказах в месяц с откатами это давало
-- двойной/тройной расход на бумаге.
--
-- Решение: флаг k24_orders.ink_deducted_at. RPC проверяет — если уже стоит, выходит.
-- Backfill: всем заказам, у которых есть транзакция 'Авто: печать заказа%' с type='ink',
-- проставляем ink_deducted_at = время этой транзакции.

ALTER TABLE k24_orders ADD COLUMN IF NOT EXISTS ink_deducted_at TIMESTAMPTZ;

-- Backfill: ставим флаг тем заказам, по которым уже было списание
UPDATE k24_orders o
SET ink_deducted_at = sub.created_at
FROM (
  SELECT t.order_id, MIN(t.created_at) AS created_at
  FROM k24_material_transactions t
  JOIN k24_materials m ON m.id = t.material_id
  WHERE m.type = 'ink'
    AND t.reason ILIKE 'Авто: печать заказа%'
    AND t.order_id IS NOT NULL
  GROUP BY t.order_id
) sub
WHERE o.id = sub.order_id
  AND o.ink_deducted_at IS NULL;

CREATE OR REPLACE FUNCTION auto_deduct_materials(p_order_id UUID, p_changed_by UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order RECORD;
  v_ink_id UUID;
  v_ink_ml NUMERIC;
BEGIN
  SELECT width_mm, height_mm, qty, ink_deducted_at INTO v_order
  FROM k24_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Идемпотентность: краска списывается один раз на жизнь заказа
  IF v_order.ink_deducted_at IS NOT NULL THEN RETURN; END IF;

  -- 12 мл краски на 1 м² площади стикеров (норма R-апдейта 11.05)
  v_ink_ml := (v_order.qty * v_order.width_mm * v_order.height_mm)::NUMERIC / 1000000.0 * 12;

  SELECT id INTO v_ink_id FROM k24_materials WHERE type = 'ink' ORDER BY name LIMIT 1;

  IF v_ink_id IS NOT NULL AND v_ink_ml > 0 THEN
    INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by)
    VALUES (v_ink_id, p_order_id, -v_ink_ml, 'Авто: печать заказа (краска)', p_changed_by);
    UPDATE k24_materials SET stock_qty = stock_qty - v_ink_ml, updated_at = now() WHERE id = v_ink_id;
    UPDATE k24_orders SET ink_deducted_at = now() WHERE id = p_order_id;
  END IF;
END;
$$;

ALTER FUNCTION public.auto_deduct_materials(uuid, uuid) SET search_path = public, pg_temp;
