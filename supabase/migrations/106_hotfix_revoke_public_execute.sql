-- 106 (ревью 17.11, хотфикс безопасности) — применена в прод 17.11.
-- SECURITY DEFINER-функции были исполняемы для PUBLIC (=X/postgres) → вызывались
-- анонимно с публичным anon-ключом из бандла. Главное: k24_get_orders_safe(p_user_id)
-- брала пользователя ПАРАМЕТРОМ — аноним с NULL получал все заказы (клиенты, адреса,
-- комментарии), любой с uuid админа — ещё и финансы. Функция в приложении не используется.
-- 075 отзывала у anon, но не у PUBLIC — права через PUBLIC остались.
REVOKE EXECUTE ON FUNCTION public.k24_get_orders_safe(uuid) FROM PUBLIC, anon, authenticated;
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.prosecdef
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.k24_get_orders_safe(uuid) FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
-- Проверка: SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace
--   AND prosecdef AND has_function_privilege('anon', oid, 'EXECUTE');  -- 0
