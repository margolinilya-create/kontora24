-- R28.0 — ядро CRM: компании (k24_clients) + контакты + каналы связи контакта.
--
-- Боевая ERP → миграция ТОЛЬКО аддитивная:
--   * k24_clients: только ADD COLUMN (все nullable или с безопасным DEFAULT);
--     существующие RLS-политики clients_select/insert/update НЕ трогаем,
--     существующие строки НЕ изменяем (DEFAULT заполняет новые колонки).
--   * новые таблицы k24_contacts / k24_contact_identities с собственным RLS.
--   * хелпер k24_has_permission() — новый, ничего существующего не заменяет.
--   * права: view:crm включено только admin (скрытый запуск), остальные
--     crm:* — admin+manager, но без view:crm их не видно.
-- Откат: supabase/migrations/rollback/112_r28_0_crm_core_clients.down.sql

BEGIN;

-- ===========================================================================
-- 1. Хелпер проверки динамического права (L2 RBAC)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.k24_has_permission(p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.k24_profiles p
      JOIN public.k24_role_permissions rp ON rp.role = p.role
     WHERE p.id = auth.uid()
       AND rp.permission = p_permission
       AND rp.allowed
  );
$$;
REVOKE ALL ON FUNCTION public.k24_has_permission(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.k24_has_permission(text) TO authenticated;

-- ===========================================================================
-- 2. Компании: новые колонки k24_clients
-- ===========================================================================
ALTER TABLE public.k24_clients
  ADD COLUMN IF NOT EXISTS kind        text        NOT NULL DEFAULT 'company',
  ADD COLUMN IF NOT EXISTS inn         text,
  ADD COLUMN IF NOT EXISTS website     text,
  ADD COLUMN IF NOT EXISTS owner_id    uuid REFERENCES public.k24_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source      text,
  ADD COLUMN IF NOT EXISTS custom      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS merged_into uuid REFERENCES public.k24_clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at  timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'k24_clients_kind_check') THEN
    ALTER TABLE public.k24_clients
      ADD CONSTRAINT k24_clients_kind_check CHECK (kind IN ('company', 'person'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clients_owner ON public.k24_clients (owner_id);
CREATE INDEX IF NOT EXISTS idx_clients_inn   ON public.k24_clients (inn) WHERE inn IS NOT NULL;

-- ===========================================================================
-- 3. Контакты (люди)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.k24_contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid REFERENCES public.k24_clients(id) ON DELETE SET NULL,
  first_name  text NOT NULL,
  last_name   text,
  position    text,
  notes       text,
  owner_id    uuid REFERENCES public.k24_profiles(id) ON DELETE SET NULL,
  custom      jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived_at timestamptz,
  merged_into uuid REFERENCES public.k24_contacts(id) ON DELETE SET NULL,
  created_by  uuid DEFAULT auth.uid() REFERENCES public.k24_profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contacts_client ON public.k24_contacts (client_id);
CREATE INDEX IF NOT EXISTS idx_contacts_owner  ON public.k24_contacts (owner_id);
CREATE INDEX IF NOT EXISTS idx_contacts_created_by ON public.k24_contacts (created_by);
CREATE INDEX IF NOT EXISTS idx_contacts_merged_into ON public.k24_contacts (merged_into);
CREATE INDEX IF NOT EXISTS idx_clients_merged_into ON public.k24_clients (merged_into);

-- ===========================================================================
-- 4. Каналы связи контакта (телефоны, email, мессенджеры)
--    value_norm: телефон E.164 (+79991234567), email в нижнем регистре,
--    tg/max — id или @username в нижнем регистре. Нормализует фронт
--    (src/features/crm/lib/identity.js). Индекс НЕ уникальный: общий офисный
--    телефон у двух людей допустим — дубли показываем предупреждением.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.k24_contact_identities (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.k24_contacts(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('phone', 'email', 'telegram', 'max', 'other')),
  value      text NOT NULL,
  value_norm text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_identities_contact ON public.k24_contact_identities (contact_id);
CREATE INDEX IF NOT EXISTS idx_identities_lookup  ON public.k24_contact_identities (kind, value_norm);

-- updated_at
CREATE OR REPLACE FUNCTION public.k24_crm_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.k24_crm_touch_updated_at() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_contacts_updated_at ON public.k24_contacts;
CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON public.k24_contacts
  FOR EACH ROW EXECUTE FUNCTION public.k24_crm_touch_updated_at();

-- ===========================================================================
-- 5. RLS новых таблиц
--    Видимость: view:crm И (crm:see_all ИЛИ свой ИЛИ без ответственного).
--    Запись: + crm:edit. Удаление: crm:manage.
-- ===========================================================================
ALTER TABLE public.k24_contacts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.k24_contact_identities ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.k24_contacts, public.k24_contact_identities FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.k24_contacts, public.k24_contact_identities TO authenticated;

CREATE POLICY contacts_select ON public.k24_contacts
  FOR SELECT TO authenticated
  USING (
    public.k24_has_permission('view:crm')
    AND (public.k24_has_permission('crm:see_all') OR owner_id IS NULL OR owner_id = (SELECT auth.uid()))
  );

CREATE POLICY contacts_insert ON public.k24_contacts
  FOR INSERT TO authenticated
  WITH CHECK (public.k24_has_permission('view:crm') AND public.k24_has_permission('crm:edit'));

CREATE POLICY contacts_update ON public.k24_contacts
  FOR UPDATE TO authenticated
  USING (
    public.k24_has_permission('crm:edit')
    AND (public.k24_has_permission('crm:see_all') OR owner_id IS NULL OR owner_id = (SELECT auth.uid()))
  )
  WITH CHECK (public.k24_has_permission('crm:edit'));

CREATE POLICY contacts_delete ON public.k24_contacts
  FOR DELETE TO authenticated
  USING (public.k24_has_permission('crm:manage'));

-- Каналы связи наследуют видимость контакта (подзапрос идёт через RLS k24_contacts).
CREATE POLICY identities_select ON public.k24_contact_identities
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.k24_contacts c WHERE c.id = contact_id));

CREATE POLICY identities_insert ON public.k24_contact_identities
  FOR INSERT TO authenticated
  WITH CHECK (
    public.k24_has_permission('crm:edit')
    AND EXISTS (SELECT 1 FROM public.k24_contacts c WHERE c.id = contact_id)
  );

CREATE POLICY identities_update ON public.k24_contact_identities
  FOR UPDATE TO authenticated
  USING (
    public.k24_has_permission('crm:edit')
    AND EXISTS (SELECT 1 FROM public.k24_contacts c WHERE c.id = contact_id)
  )
  WITH CHECK (public.k24_has_permission('crm:edit'));

CREATE POLICY identities_delete ON public.k24_contact_identities
  FOR DELETE TO authenticated
  USING (
    public.k24_has_permission('crm:edit')
    AND EXISTS (SELECT 1 FROM public.k24_contacts c WHERE c.id = contact_id)
  );

-- ===========================================================================
-- 6. Права (скрытый запуск: view:crm только у admin)
-- ===========================================================================
INSERT INTO public.k24_role_permissions (role, permission, allowed)
SELECT r.role, p.permission,
       CASE p.permission
         WHEN 'view:crm'   THEN r.role = 'admin'
         WHEN 'crm:import' THEN r.role = 'admin'
         ELSE r.role IN ('admin', 'manager')
       END
  FROM (VALUES ('admin'), ('manager'), ('designer'), ('printer'), ('post_printer')) AS r(role)
 CROSS JOIN (VALUES ('view:crm'), ('crm:edit'), ('crm:manage'), ('crm:see_all'), ('crm:import')) AS p(permission)
ON CONFLICT (role, permission) DO NOTHING;

COMMIT;
