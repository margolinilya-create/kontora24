-- Migration 064: R18.4 — имя заказчика на наклейке «на бокс» для всех сотрудников
--
-- Бриф 30.06: «Мы клеим наклейки с номером заказа на коробки, это может делать
-- любой сотрудник, но когда сотрудники печатают наклейку, у них не видно имени
-- заказчика (проблема у всех кроме менеджера). Нужно исправить».
--
-- Причина: RLS k24_clients SELECT ограничен admin/manager, поэтому join
-- client:k24_clients(*) в useOrderDetail у designer/printer/post_printer
-- возвращает null → на наклейке «—».
--
-- Решение (по решению пользователя — «только имя, без утечки контактов»):
-- SECURITY DEFINER функция возвращает ТОЛЬКО имя клиента по order_id.
-- Телефон/email/комментарий клиента остаются доступны лишь менеджеру.
-- RLS самой таблицы k24_clients НЕ трогаем.

CREATE OR REPLACE FUNCTION public.k24_order_client_name(p_order_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT c.name
  FROM k24_orders o
  JOIN k24_clients c ON c.id = o.client_id
  WHERE o.id = p_order_id
$$;

-- Доступ: любой аутентифицированный (наклейку печатает любой сотрудник),
-- но НЕ anon.
REVOKE ALL ON FUNCTION public.k24_order_client_name(uuid) FROM public;
REVOKE ALL ON FUNCTION public.k24_order_client_name(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.k24_order_client_name(uuid) TO authenticated;
