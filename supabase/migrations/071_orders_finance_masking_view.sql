-- Migration 071: маскирующее view k24_orders_full + сужение plan_overrides
-- (Security phase 3, шаг A — аддитивный, ничего не ломает).
--
-- Проблема: RLS SELECT на k24_orders = USING(true). Рабочие роли
-- (designer/printer/post_printer) читают финансовые колонки прямым
-- PostgREST-запросом из DevTools, хотя UI их скрывает (известная дыра
-- R14.8). Запись финансов воркером уже закрыта триггером
-- k24_protect_order_columns (20260505_security_phase2).
--
-- Решение (двухшаговый деплой):
--   071 (этот файл): view с CASE-маскированием 7 финансовых колонок +
--     фронт переводится на него там, где нужны финансы.
--   072 (после прод-деплоя фронта): REVOKE табличной SELECT-привилегии
--     финансовых колонок — закрывает прямой DevTools-запрос к таблице.
--     ВНИМАНИЕ: колоночный REVOKE НЕ фильтрует realtime-payload (walrus
--     авторизует по row-RLS, не по column-привилегиям) — остаточная
--     realtime-утечка финансов сохраняется. Приложение не течёт (realtime
--     используется лишь как триггер refetch, финансы читаются через view),
--     но полное закрытие realtime — отдельная задача (не реплицировать
--     финколонки / отдельная publication). Проверяется живьём после 072.
--
-- View owner = postgres → обходит RLS/колоночные привилегии базовой
-- таблицы, поэтому маскирование делаем ЯВНО через CASE. Все строки видны
-- всем authenticated (спискам заказов строки нужны и воркерам), но 7
-- финансовых колонок = NULL для тех, у кого нет права view:finance.
-- Критерий — динамическое право view:finance (k24_role_permissions), а НЕ
-- жёсткий список ролей: совпадает с фронтом (useCanDo('view:finance')) и с
-- политикой plan_overrides ниже. Иначе выданное воркеру view:finance
-- показало бы финансовый UI, но пустой.
--
-- ВАЖНО (процесс для будущих ALTER TABLE k24_orders ADD COLUMN):
--   1) GRANT SELECT (new_col) ON k24_orders TO authenticated (если колонка
--      нефинансовая) — иначе после 072 воркерский запрос упадёт 403;
--   2) CREATE OR REPLACE VIEW k24_orders_full ... с колонкой в конце списка
--      (иначе она не появится в view — список зафиксирован здесь).

CREATE OR REPLACE VIEW public.k24_orders_full AS
SELECT
  o.id,
  o.number,
  o.client_id,
  o.order_type,
  o.status,
  o.width_mm,
  o.height_mm,
  o.qty,
  o.design_variants,
  o.need_lam,
  o.lam_type,
  -- 7 финансовых колонок — видны только при праве view:finance. Inline
  -- uncorrelated EXISTS сворачивается в InitPlan (1 проверка на запрос).
  CASE WHEN EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role WHERE p.id = auth.uid() AND rp.permission = 'view:finance' AND rp.allowed) THEN o.cost_materials END AS cost_materials,
  CASE WHEN EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role WHERE p.id = auth.uid() AND rp.permission = 'view:finance' AND rp.allowed) THEN o.cost_labor END AS cost_labor,
  CASE WHEN EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role WHERE p.id = auth.uid() AND rp.permission = 'view:finance' AND rp.allowed) THEN o.cost_total END AS cost_total,
  CASE WHEN EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role WHERE p.id = auth.uid() AND rp.permission = 'view:finance' AND rp.allowed) THEN o.markup END AS markup,
  CASE WHEN EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role WHERE p.id = auth.uid() AND rp.permission = 'view:finance' AND rp.allowed) THEN o.discount_pct END AS discount_pct,
  CASE WHEN EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role WHERE p.id = auth.uid() AND rp.permission = 'view:finance' AND rp.allowed) THEN o.price_final END AS price_final,
  CASE WHEN EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role WHERE p.id = auth.uid() AND rp.permission = 'view:finance' AND rp.allowed) THEN o.price_per_unit END AS price_per_unit,
  o.prod_days,
  o.assigned_to,
  o.created_by,
  o.deadline,
  o.notes,
  o.created_at,
  o.updated_at,
  o.bitrix_deal_id,
  o.bitrix_url,
  o.priority,
  o.checklist,
  o.status_changed_at,
  o.film_type,
  o.stickers_per_pack,
  o.is_3d,
  o.mockup_path,
  o.is_urgent,
  o.is_partner,
  o.needs_montage_film,
  o.needs_individual_cut,
  o.printed_meters,
  o.resin_used,
  o.rejected_qty,
  o.printed_qty,
  o.deal_name,
  o.source,
  o.source_referrer,
  o.payment_status,
  o.design_status,
  o.delivery_type,
  o.delivery_city,
  o.delivery_address,
  o.delivery_notes,
  o.bopp_bag,
  o.custom_number,
  o.film_type_stickers,
  o.ink_deducted_at,
  o.drying_started_at,
  o.film_material_id,
  o.film_stickers_material_id,
  o.lam_material_id,
  o.sticker_shape
FROM k24_orders o;

-- Default privileges Supabase выдали бы anon SELECT на новый view, а view с
-- owner=postgres обходит RLS базовой таблицы → закрываем немедленно.
REVOKE ALL ON public.k24_orders_full FROM PUBLIC, anon;
GRANT SELECT ON public.k24_orders_full TO authenticated;

COMMENT ON VIEW public.k24_orders_full IS
  'k24_orders с маскированием 7 финансовых колонок (NULL без права view:finance). Фронт использует его вместо таблицы там, где нужны финансы. Новые колонки таблицы добавлять в конец списка + GRANT (см. миграцию 072).';

-- ── k24_plan_overrides: SELECT по праву view:planning (было USING(true)) ──
-- Ревью: воркер с выданным view:planning должен видеть ТЕ ЖЕ закрепления,
-- что менеджер (pins влияют на расчёт расписания, а не только на бейджи),
-- поэтому политика следует за тем же L2-тумблером, что и UI.
DROP POLICY IF EXISTS plan_overrides_select ON public.k24_plan_overrides;
CREATE POLICY plan_overrides_select ON public.k24_plan_overrides
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM k24_profiles p
      JOIN k24_role_permissions rp ON rp.role = p.role
      WHERE p.id = auth.uid()
        AND rp.permission = 'view:planning'
        AND rp.allowed
    )
  );
