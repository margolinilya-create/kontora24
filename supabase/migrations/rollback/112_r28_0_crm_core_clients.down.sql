-- Откат R28.0 (миграция 112). Удаляет ТОЛЬКО объекты, созданные в 112.
-- ВНИМАНИЕ: данные контактов и новых колонок компаний будут потеряны —
-- перед запуском сделать выгрузку k24_contacts / k24_contact_identities.

BEGIN;

DELETE FROM public.k24_role_permissions
 WHERE permission IN ('view:crm', 'crm:edit', 'crm:manage', 'crm:see_all', 'crm:import');

DROP TABLE IF EXISTS public.k24_contact_identities;
DROP TABLE IF EXISTS public.k24_contacts;
DROP FUNCTION IF EXISTS public.k24_crm_touch_updated_at();

DROP INDEX IF EXISTS public.idx_clients_owner;
DROP INDEX IF EXISTS public.idx_clients_inn;
DROP INDEX IF EXISTS public.idx_clients_merged_into;
ALTER TABLE public.k24_clients
  DROP CONSTRAINT IF EXISTS k24_clients_kind_check,
  DROP COLUMN IF EXISTS kind,
  DROP COLUMN IF EXISTS inn,
  DROP COLUMN IF EXISTS website,
  DROP COLUMN IF EXISTS owner_id,
  DROP COLUMN IF EXISTS source,
  DROP COLUMN IF EXISTS custom,
  DROP COLUMN IF EXISTS archived_at,
  DROP COLUMN IF EXISTS merged_into,
  DROP COLUMN IF EXISTS updated_at;

-- Только если более поздние миграции (113+) ещё не ссылаются на хелпер:
DROP FUNCTION IF EXISTS public.k24_has_permission(text);

COMMIT;
