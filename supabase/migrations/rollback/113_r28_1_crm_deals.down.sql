-- Откат R28.1 (миграция 113). Удаляет ТОЛЬКО объекты, созданные в 113.
-- ВНИМАНИЕ: сделки и связь заказ↔сделка будут потеряны — сначала выгрузить k24_deals.
--
-- Шаг 1 (вручную, до этого скрипта): k24_orders_full зависит от k24_orders.deal_id.
-- Пересоздать view БЕЗ последней колонки deal_id: взять CREATE VIEW из
-- 113_r28_1_crm_deals.sql, убрать `deal_id`, выполнить
--   DROP VIEW public.k24_orders_full; CREATE VIEW public.k24_orders_full AS ...;
--   REVOKE ALL ON public.k24_orders_full FROM PUBLIC, anon;
--   GRANT SELECT ON public.k24_orders_full TO authenticated;
-- (CREATE OR REPLACE VIEW не умеет убирать колонки.)

BEGIN;

ALTER TABLE public.k24_orders DROP COLUMN IF EXISTS deal_id;

DROP TABLE IF EXISTS public.k24_deals;
DROP FUNCTION IF EXISTS public.k24_deals_before_write();
DROP TABLE IF EXISTS public.k24_crm_lost_reasons;
DROP TABLE IF EXISTS public.k24_crm_stages;
DROP TABLE IF EXISTS public.k24_crm_pipelines;

COMMIT;
