-- 026: pack_designs INSERT/UPDATE — только роли, которые с ними работают.
--
-- Было: USING (true) / WITH CHECK (true) — любой залогиненный мог править pack_designs чужого заказа.
-- Стало: INSERT — auth (создание через триггер create_pack_designs_for_order работает под
--        SECURITY DEFINER и обходит RLS, поэтому ручной INSERT можно жёстко ограничить).
--        UPDATE — admin/manager/post_printer/printer (printer как helper по CLAUDE.md).
-- DELETE остаётся admin/manager (как было в 010).

DROP POLICY IF EXISTS "k24_pack_designs_insert" ON public.k24_pack_designs;
CREATE POLICY "k24_pack_designs_insert" ON public.k24_pack_designs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM k24_profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'post_printer', 'printer')
    )
  );

DROP POLICY IF EXISTS "k24_pack_designs_update" ON public.k24_pack_designs;
CREATE POLICY "k24_pack_designs_update" ON public.k24_pack_designs
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM k24_profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'post_printer', 'printer')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM k24_profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'post_printer', 'printer')
    )
  );
