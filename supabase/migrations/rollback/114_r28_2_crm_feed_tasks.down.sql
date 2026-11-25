-- Откат R28.2 (миграция 114). Удаляет ТОЛЬКО объекты, созданные в 114.
-- ВНИМАНИЕ: заметки, задачи и лента будут потеряны — сначала выгрузить таблицы.

BEGIN;

DROP TRIGGER IF EXISTS trg_deals_log_activity ON public.k24_deals;
DROP FUNCTION IF EXISTS public.k24_deals_log_activity();
DROP TABLE IF EXISTS public.k24_activities;
DROP TABLE IF EXISTS public.k24_crm_tasks;
DROP TABLE IF EXISTS public.k24_crm_notes;

COMMIT;
