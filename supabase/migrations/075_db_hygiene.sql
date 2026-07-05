-- Migration 075: гигиена БД по Supabase advisors + ревью 05.07.
--
-- 1. Пять пар полностью идентичных индексов (advisor duplicate_index) —
--    дропаем по одному из пары (определения сверены с pg_indexes 05.07).
-- 2. Три параллельные permissive UPDATE-политики на k24_orders, одна из
--    которых тянет несуществующую роль 'assembler' — консолидация в одну.
--    designer сохраняет доступ (был в orders_update_workers: пишет
--    mockup_path на этапе дизайна), 'assembler' уходит.
-- 3. REVOKE EXECUTE у anon на все функции public (advisor
--    anon_security_definer_function_executable): 018 отзывал точечно, после
--    неё появились новые функции. Все клиентские RPC ходят под authenticated,
--    вебхуки Bitrix — под service_role; anon не вызывает ничего.
-- 4. Legacy-политики PinheadOS «foto i1iz3l_*» на storage.objects давали
--    роли public ЧТЕНИЕ/ЗАПИСЬ/УДАЛЕНИЕ в бакете sku-photos — дропаем.
--    Сам бакет (4 файла) не трогаем — удаление содержимого решает владелец.

-- ── 1. Дубли индексов ──
DROP INDEX IF EXISTS public.idx_attachments_order;          -- = idx_k24_order_attachments_order_id
DROP INDEX IF EXISTS public.order_comments_order_id_idx;    -- = idx_k24_order_comments_order_id
DROP INDEX IF EXISTS public.idx_prod_logs_active;           -- = idx_prod_logs_order_active
DROP INDEX IF EXISTS public.idx_time_entries_order;         -- = idx_k24_time_entries_order_id
DROP INDEX IF EXISTS public.idx_time_entries_user;          -- = idx_k24_time_entries_user_id

-- ── 2. UPDATE-политики k24_orders ──
DROP POLICY IF EXISTS orders_update_admin_manager ON public.k24_orders;
DROP POLICY IF EXISTS orders_update_workers ON public.k24_orders;       -- тянула 'assembler'
DROP POLICY IF EXISTS k24_orders_worker_update ON public.k24_orders;
DROP POLICY IF EXISTS orders_update ON public.k24_orders;
CREATE POLICY orders_update ON public.k24_orders
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM k24_profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'designer', 'printer', 'post_printer')
    )
  );

-- ── 3. anon EXECUTE ──
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
-- Будущие функции тоже без anon EXECUTE (default privileges от postgres —
-- владельца всех наших миграционных функций).
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- ── 4. Legacy storage-политики PinheadOS ──
DROP POLICY IF EXISTS "foto i1iz3l_0" ON storage.objects;
DROP POLICY IF EXISTS "foto i1iz3l_1" ON storage.objects;
DROP POLICY IF EXISTS "foto i1iz3l_2" ON storage.objects;
DROP POLICY IF EXISTS "foto i1iz3l_3" ON storage.objects;
