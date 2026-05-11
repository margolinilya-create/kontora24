-- 028: атомарное удаление заказа через RPC.
--
-- До этого api/orders/delete.js делал 6+ независимых запросов: storage cleanup → soft-delete
-- production_logs → ink compensation → integration_log unlink → material_transactions unlink → DELETE.
-- При фейле посередине часть компенсаций уже применилась, заказ остался.
-- Откатить смешение состояний автоматически нельзя — это рассинхрон с инвентаризацией.
--
-- Решение: одна plpgsql-функция, всё в transaction-блоке. Storage cleanup остаётся
-- на стороне Node (он невратим в случае фейла, поэтому делаем его перед RPC и
-- логируем оrphan-файлы отдельно).
--
-- Краска: компенсация одной агрегированной транзакцией на материал, аналогично текущей логике.

CREATE OR REPLACE FUNCTION public.delete_order_cascade(p_order_id UUID, p_caller UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller_role TEXT;
  v_order_no INT;
  v_ink_record RECORD;
  v_sum_delta NUMERIC;
  v_stock NUMERIC;
BEGIN
  -- Авторизация: только admin
  SELECT role INTO v_caller_role FROM k24_profiles WHERE id = p_caller;
  IF v_caller_role IS NULL THEN
    RETURN json_build_object('error', 'Не авторизован');
  END IF;
  IF v_caller_role <> 'admin' THEN
    RETURN json_build_object('error', 'Только администратор может удалять заказы');
  END IF;

  -- Заказ существует?
  SELECT number INTO v_order_no FROM k24_orders WHERE id = p_order_id;
  IF v_order_no IS NULL THEN
    RETURN json_build_object('error', 'Заказ не найден');
  END IF;

  -- 1) Soft-delete production_logs → триггер вернёт стоки по плёнке/ламинации/смоле.
  --    На UPDATE триггер прочитает OLD (deleted_at IS NULL) и NEW (deleted_at IS NOT NULL),
  --    вычислит delta как 0 - old и впишет компенсационные транзакции.
  UPDATE k24_production_logs
  SET deleted_at = now()
  WHERE order_id = p_order_id
    AND deleted_at IS NULL;

  -- 2) Компенсация краски — агрегируем все «Авто: печать заказа%» по материалу,
  --    создаём обратную транзакцию и поправляем stock_qty. FOR UPDATE на материале
  --    защищает от гонки с другими списаниями краски в этот же момент.
  FOR v_ink_record IN
    SELECT t.material_id, SUM(t.delta) AS total_delta
    FROM k24_material_transactions t
    WHERE t.order_id = p_order_id
      AND t.reason IN ('Авто: печать заказа (краска)', 'Авто: печать заказа')
    GROUP BY t.material_id
  LOOP
    IF v_ink_record.total_delta IS NULL OR v_ink_record.total_delta = 0 THEN CONTINUE; END IF;

    -- Лок строки материала
    SELECT stock_qty INTO v_stock FROM k24_materials WHERE id = v_ink_record.material_id FOR UPDATE;
    IF v_stock IS NULL THEN CONTINUE; END IF;

    INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by)
    VALUES (v_ink_record.material_id, NULL, -v_ink_record.total_delta,
            'Возврат при удалении заказа #' || v_order_no, p_caller);

    UPDATE k24_materials
    SET stock_qty = stock_qty - v_ink_record.total_delta, updated_at = now()
    WHERE id = v_ink_record.material_id;
  END LOOP;

  -- 3) FK без ON DELETE — обнуляем order_id (history compensation нельзя терять).
  --    Делаем после soft-delete, чтобы захватить и компенсационные транзакции
  --    от триггера, которые тоже привязаны к этому order_id.
  UPDATE k24_integration_log SET order_id = NULL WHERE order_id = p_order_id;
  UPDATE k24_material_transactions SET order_id = NULL WHERE order_id = p_order_id;

  -- 4) DELETE — каскадом снимет k24_order_status_history, k24_order_comments,
  --    k24_order_attachments, k24_production_logs, k24_order_audit, k24_pack_designs.
  DELETE FROM k24_orders WHERE id = p_order_id;

  RETURN json_build_object('success', true, 'order_no', v_order_no);
EXCEPTION
  WHEN foreign_key_violation THEN
    RETURN json_build_object('error', 'fk', 'detail', SQLERRM);
  WHEN OTHERS THEN
    RETURN json_build_object('error', 'other', 'detail', SQLERRM);
END;
$$;

ALTER FUNCTION public.delete_order_cascade(uuid, uuid) SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.delete_order_cascade(uuid, uuid) FROM PUBLIC, anon;
-- service_role вызывает её через rpc; authenticated не нужен.
