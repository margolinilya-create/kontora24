-- Migration 076: гигиена RLS по Supabase performance-advisors.
--
-- Две правки, обе семантически нейтральны (доступ не меняется):
--
-- 1. Снять две избыточные permissive-политики, которые полностью перекрыты
--    другой политикой USING(true) на той же таблице/команде/роли
--    (advisor multiple_permissive_policies):
--      • k24_profiles.own_profile   ⊂ profiles_select (authenticated, true)
--      • k24_materials.k24_materials_worker_select ⊂ materials_select (true)
--    Обе перекрытые давали SELECT более узкому набору — надмножество уже
--    открыто через *_select USING(true), так что удаление ничего не закрывает.
--
-- 2. Обернуть прямые вызовы auth.uid()/auth.role()/auth.jwt() в
--    (select …) во ВСЕХ политиках public (advisor rls_initplan): Postgres
--    вычисляет их один раз на запрос (InitPlan), а не построчно. Значение то
--    же → доступ идентичен. Делается транзакционно: DROP+CREATE каждой
--    затронутой политики с сохранением permissive/cmd/roles/выражений;
--    нормализация unwrap→wrap исключает двойные обёртки.

-- ── 1. Избыточные дубли ──
DROP POLICY IF EXISTS own_profile ON public.k24_profiles;
DROP POLICY IF EXISTS k24_materials_worker_select ON public.k24_materials;

-- ── 2. InitPlan-обёртка auth.*() ──
DO $mig$
DECLARE
  r record;
  v_roles text;
  v_cmd text;
  v_using text;
  v_check text;
BEGIN
  FOR r IN
    SELECT p.polname, c.relname, p.polpermissive, p.polcmd, p.polroles,
           pg_get_expr(p.polqual, p.polrelid)      AS using_expr,
           pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
    FROM pg_policy p
    JOIN pg_class c     ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND (COALESCE(pg_get_expr(p.polqual, p.polrelid), '')      ~ 'auth\.(uid|role|jwt)\(\)'
        OR COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '') ~ 'auth\.(uid|role|jwt)\(\)')
  LOOP
    -- Нормализация: сначала снять уже существующую обёртку (если есть),
    -- потом обернуть заново → ровно один (select …).
    v_using := r.using_expr;
    IF v_using IS NOT NULL THEN
      v_using := regexp_replace(v_using, '\(\s*SELECT\s+(auth\.(uid|role|jwt)\(\))\s*\)', '\1', 'gi');
      v_using := regexp_replace(v_using, '(auth\.(uid|role|jwt)\(\))', '(select \1)', 'g');
    END IF;
    v_check := r.check_expr;
    IF v_check IS NOT NULL THEN
      v_check := regexp_replace(v_check, '\(\s*SELECT\s+(auth\.(uid|role|jwt)\(\))\s*\)', '\1', 'gi');
      v_check := regexp_replace(v_check, '(auth\.(uid|role|jwt)\(\))', '(select \1)', 'g');
    END IF;

    v_cmd := CASE r.polcmd
               WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
               WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END;

    SELECT string_agg(CASE WHEN u.roleid = 0 THEN 'public' ELSE quote_ident(pr.rolname) END, ', ')
      INTO v_roles
      FROM unnest(r.polroles) AS u(roleid)
      LEFT JOIN pg_roles pr ON pr.oid = u.roleid;

    EXECUTE format('DROP POLICY %I ON public.%I', r.polname, r.relname);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS %s FOR %s TO %s %s %s',
      r.polname, r.relname,
      CASE WHEN r.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      v_cmd, v_roles,
      CASE WHEN v_using IS NOT NULL THEN 'USING (' || v_using || ')' ELSE '' END,
      CASE WHEN v_check IS NOT NULL THEN 'WITH CHECK (' || v_check || ')' ELSE '' END
    );
  END LOOP;
END
$mig$;
