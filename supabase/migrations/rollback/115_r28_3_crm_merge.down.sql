-- Откат R28.3 (миграция 115): удаляет функции слияния.
-- Уже выполненные слияния НЕ отменяются (перенос заказов виден в k24_order_audit;
-- поглощённые записи помечены merged_into — вернуть можно вручную).
BEGIN;
DROP FUNCTION IF EXISTS public.crm_merge_clients(uuid, uuid);
DROP FUNCTION IF EXISTS public.crm_merge_contacts(uuid, uuid);
COMMIT;
