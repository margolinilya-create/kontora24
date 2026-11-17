-- 108 — допечатка запрещена для заказа на субподряде (маршрут v2 субподряда не
-- содержит производственных этапов, допечатка «застревала»). Клиент уже прячет
-- кнопку (canCreateReprint); здесь — серверный отказ в create_reprint_subtask.
-- Реализовано BEFORE INSERT-триггером на k24_order_subtasks, чтобы не
-- пересоздавать RPC целиком.
CREATE OR REPLACE FUNCTION public.fn_block_reprint_for_subcontract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.track = 'reprint' AND EXISTS (
    SELECT 1 FROM k24_orders
     WHERE id = NEW.order_id AND COALESCE(route_version, 1) >= 2 AND is_subcontract
  ) THEN
    RAISE EXCEPTION 'Допечатка недоступна: заказ выполняется на субподряде';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_block_reprint_for_subcontract ON public.k24_order_subtasks;
CREATE TRIGGER trg_block_reprint_for_subcontract
  BEFORE INSERT ON public.k24_order_subtasks
  FOR EACH ROW EXECUTE FUNCTION public.fn_block_reprint_for_subcontract();
