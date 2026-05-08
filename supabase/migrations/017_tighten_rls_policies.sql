-- 017_tighten_rls_policies.sql — финализация RLS-политик после жёсткого аудита.
-- Supabase advisor: rls_policy_always_true на нескольких политиках.
-- Сужаем до authenticated и удаляем дубли.

-- 1) k24_order_comments — удаляем дубли + сужаем INSERT до authenticated
DROP POLICY IF EXISTS "order_comments_insert" ON public.k24_order_comments;
DROP POLICY IF EXISTS "order_comments_select" ON public.k24_order_comments;
-- Оставляем "Авторизованные видят комментарии" и "Авторизованные добавляют коммент"
-- (уже корректные, проверяют auth.role() = 'authenticated').

-- 2) k24_pack_designs — INSERT/UPDATE требуют authenticated
DROP POLICY IF EXISTS "k24_pack_designs_insert" ON public.k24_pack_designs;
CREATE POLICY "k24_pack_designs_insert" ON public.k24_pack_designs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "k24_pack_designs_update" ON public.k24_pack_designs;
CREATE POLICY "k24_pack_designs_update" ON public.k24_pack_designs
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- 3) Storage bucket order-files: запрещаем anonymous listing.
-- В Kontora24 файлы хранятся как ссылки (mockup_path), bucket используется
-- редко. Сужаем SELECT до authenticated (вместо anon listing).
DROP POLICY IF EXISTS "order_files_select" ON storage.objects;
CREATE POLICY "order_files_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'order-files');
