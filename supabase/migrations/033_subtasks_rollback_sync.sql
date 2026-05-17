-- Migration 033: автоматическая синхронизация подзадач при rollback статуса заказа
--
-- Tech debt из R7: при откате основного order.status через StageJumper
-- подзадачи k24_order_subtasks оставались на своих позициях — рассинхронизация.
-- Например, заказ откатили с 'lamination' на 'print', но подзадача
-- backgrounds оставалась 'laminating' → заказ показывался в очереди ламинации.
--
-- Триггер на UPDATE k24_orders.status — для stickerpack3D откатывает подзадачи
-- ВНИЗ по их маршруту до целевого статуса (по тому же CASE-маппингу что в
-- миграции 032). Если целевой статус >= текущего — не трогает (forward-moves
-- продвигаются через advance_subtask, а не через основной статус).
--
-- Cancelled: обе подзадачи принудительно 'cancelled'.

CREATE OR REPLACE FUNCTION fn_sync_subtasks_on_status_change() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bg_target TEXT;
  v_st_target TEXT;
  v_bg_route TEXT[] := ARRAY['pending','printing','laminating','cutting','selecting','ready'];
  v_st_route TEXT[] := ARRAY['pending','printing','cutting','pouring','ready'];
BEGIN
  IF NEW.order_type <> 'stickerpack3D' OR NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled' THEN
    UPDATE k24_order_subtasks SET status = 'cancelled', completed_at = NULL
      WHERE order_id = NEW.id;
    RETURN NEW;
  END IF;

  v_bg_target := CASE NEW.status
    WHEN 'new' THEN 'pending'
    WHEN 'design' THEN 'pending'
    WHEN 'prepress' THEN 'pending'
    WHEN 'print' THEN 'printing'
    WHEN 'lamination' THEN 'laminating'
    WHEN 'cutting' THEN 'cutting'
    WHEN 'selection_pouring' THEN 'selecting'
    WHEN 'assembly_3d' THEN 'ready'
    WHEN 'packaging' THEN 'ready'
    WHEN 'otk' THEN 'ready'
    WHEN 'done' THEN 'ready'
    ELSE NULL
  END;
  v_st_target := CASE NEW.status
    WHEN 'new' THEN 'pending'
    WHEN 'design' THEN 'pending'
    WHEN 'prepress' THEN 'pending'
    WHEN 'print' THEN 'printing'
    WHEN 'lamination' THEN 'cutting'  -- стикеры пропускают ламинацию
    WHEN 'cutting' THEN 'cutting'
    WHEN 'selection_pouring' THEN 'pouring'
    WHEN 'assembly_3d' THEN 'ready'
    WHEN 'packaging' THEN 'ready'
    WHEN 'otk' THEN 'ready'
    WHEN 'done' THEN 'ready'
    ELSE NULL
  END;

  IF v_bg_target IS NOT NULL THEN
    UPDATE k24_order_subtasks
      SET status = v_bg_target,
          completed_at = CASE WHEN v_bg_target = 'ready' THEN COALESCE(completed_at, NOW()) ELSE NULL END
      WHERE order_id = NEW.id AND track = 'backgrounds'
        AND array_position(v_bg_route, status) IS NOT NULL
        AND array_position(v_bg_route, v_bg_target) < array_position(v_bg_route, status);
  END IF;

  IF v_st_target IS NOT NULL THEN
    UPDATE k24_order_subtasks
      SET status = v_st_target,
          completed_at = CASE WHEN v_st_target = 'ready' THEN COALESCE(completed_at, NOW()) ELSE NULL END
      WHERE order_id = NEW.id AND track = 'stickers'
        AND array_position(v_st_route, status) IS NOT NULL
        AND array_position(v_st_route, v_st_target) < array_position(v_st_route, status);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_subtasks_on_status_change ON k24_orders;
CREATE TRIGGER trg_sync_subtasks_on_status_change
AFTER UPDATE OF status ON k24_orders
FOR EACH ROW EXECUTE FUNCTION fn_sync_subtasks_on_status_change();
