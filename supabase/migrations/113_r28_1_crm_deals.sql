-- R28.1 — CRM: воронки, этапы, причины проигрыша, сделки; связь заказа со сделкой.
--
-- Боевая ERP → только аддитивно:
--   * новые таблицы k24_crm_pipelines / k24_crm_stages / k24_crm_lost_reasons / k24_deals;
--   * k24_orders: ОДНА nullable-колонка deal_id (FK ON DELETE SET NULL) + колоночный
--     GRANT SELECT (правило R14/R25) + deal_id в КОНЕЦ k24_orders_full.
--     Определение view взято из прода 25.11 (pg_get_viewdef), не из репо;
--     CREATE OR REPLACE VIEW сохраняет гранты и owner.
--   * существующие политики/триггеры k24_orders не трогаем.
-- Права: используются уже созданные в 112 (view:crm, crm:edit, crm:manage, crm:see_all).
-- Откат: supabase/migrations/rollback/113_r28_1_crm_deals.down.sql

BEGIN;

-- ===========================================================================
-- 1. Воронки и этапы
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.k24_crm_pipelines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  sort        int  NOT NULL DEFAULT 0,
  is_default  boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.k24_crm_stages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES public.k24_crm_pipelines(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color       text NOT NULL DEFAULT '#9CA3AF',
  sort        int  NOT NULL DEFAULT 0,
  probability int  NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
  kind        text NOT NULL DEFAULT 'open' CHECK (kind IN ('open', 'won', 'lost')),
  rot_days    int  CHECK (rot_days IS NULL OR rot_days > 0),
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_stages_pipeline ON public.k24_crm_stages (pipeline_id, sort);

CREATE TABLE IF NOT EXISTS public.k24_crm_lost_reasons (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  sort        int  NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ===========================================================================
-- 2. Сделки
-- ===========================================================================
CREATE SEQUENCE IF NOT EXISTS public.k24_deals_number_seq;

CREATE TABLE IF NOT EXISTS public.k24_deals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number           int  NOT NULL DEFAULT nextval('public.k24_deals_number_seq'),
  title            text NOT NULL,
  pipeline_id      uuid NOT NULL REFERENCES public.k24_crm_pipelines(id),
  stage_id         uuid NOT NULL REFERENCES public.k24_crm_stages(id),
  client_id        uuid REFERENCES public.k24_clients(id) ON DELETE SET NULL,
  contact_id       uuid REFERENCES public.k24_contacts(id) ON DELETE SET NULL,
  owner_id         uuid REFERENCES public.k24_profiles(id) ON DELETE SET NULL,
  amount           numeric(14, 2),
  expected_close   date,
  source           text,
  notes            text,
  lost_reason_id   uuid REFERENCES public.k24_crm_lost_reasons(id) ON DELETE SET NULL,
  lost_comment     text,
  stage_changed_at timestamptz NOT NULL DEFAULT now(),
  closed_at        timestamptz,
  custom           jsonb NOT NULL DEFAULT '{}'::jsonb,
  bitrix_deal_id   text,
  archived_at      timestamptz,
  created_by       uuid DEFAULT auth.uid() REFERENCES public.k24_profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER SEQUENCE public.k24_deals_number_seq OWNED BY public.k24_deals.number;
CREATE UNIQUE INDEX IF NOT EXISTS uq_deals_number ON public.k24_deals (number);
CREATE INDEX IF NOT EXISTS idx_deals_board       ON public.k24_deals (pipeline_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage       ON public.k24_deals (stage_id);
CREATE INDEX IF NOT EXISTS idx_deals_client      ON public.k24_deals (client_id);
CREATE INDEX IF NOT EXISTS idx_deals_contact     ON public.k24_deals (contact_id);
CREATE INDEX IF NOT EXISTS idx_deals_owner       ON public.k24_deals (owner_id);
CREATE INDEX IF NOT EXISTS idx_deals_created_by  ON public.k24_deals (created_by);
CREATE INDEX IF NOT EXISTS idx_deals_lost_reason ON public.k24_deals (lost_reason_id);

-- Этап определяет воронку; смена этапа → stage_changed_at; won/lost → closed_at.
CREATE OR REPLACE FUNCTION public.k24_deals_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_kind text;
  v_pipeline uuid;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    SELECT kind, pipeline_id INTO v_kind, v_pipeline FROM public.k24_crm_stages WHERE id = NEW.stage_id;
    IF v_pipeline IS NOT NULL THEN
      NEW.pipeline_id := v_pipeline;
    END IF;
    NEW.stage_changed_at := now();
    IF v_kind IN ('won', 'lost') THEN
      NEW.closed_at := COALESCE(NEW.closed_at, now());
    ELSE
      NEW.closed_at := NULL;
      NEW.lost_reason_id := NULL;
      NEW.lost_comment := NULL;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.k24_deals_before_write() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_deals_before_write ON public.k24_deals;
CREATE TRIGGER trg_deals_before_write
  BEFORE INSERT OR UPDATE ON public.k24_deals
  FOR EACH ROW EXECUTE FUNCTION public.k24_deals_before_write();

-- ===========================================================================
-- 3. RLS
-- ===========================================================================
ALTER TABLE public.k24_crm_pipelines    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.k24_crm_stages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.k24_crm_lost_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.k24_deals            ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.k24_crm_pipelines, public.k24_crm_stages, public.k24_crm_lost_reasons, public.k24_deals FROM PUBLIC, anon;
REVOKE ALL ON SEQUENCE public.k24_deals_number_seq FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.k24_crm_pipelines, public.k24_crm_stages, public.k24_crm_lost_reasons, public.k24_deals TO authenticated;
GRANT USAGE ON SEQUENCE public.k24_deals_number_seq TO authenticated;

-- Справочники: читают все с view:crm, правят — crm:manage.
CREATE POLICY crm_pipelines_select ON public.k24_crm_pipelines FOR SELECT TO authenticated
  USING (public.k24_has_permission('view:crm'));
CREATE POLICY crm_pipelines_write ON public.k24_crm_pipelines FOR ALL TO authenticated
  USING (public.k24_has_permission('crm:manage')) WITH CHECK (public.k24_has_permission('crm:manage'));

CREATE POLICY crm_stages_select ON public.k24_crm_stages FOR SELECT TO authenticated
  USING (public.k24_has_permission('view:crm'));
CREATE POLICY crm_stages_write ON public.k24_crm_stages FOR ALL TO authenticated
  USING (public.k24_has_permission('crm:manage')) WITH CHECK (public.k24_has_permission('crm:manage'));

CREATE POLICY crm_lost_reasons_select ON public.k24_crm_lost_reasons FOR SELECT TO authenticated
  USING (public.k24_has_permission('view:crm'));
CREATE POLICY crm_lost_reasons_write ON public.k24_crm_lost_reasons FOR ALL TO authenticated
  USING (public.k24_has_permission('crm:manage')) WITH CHECK (public.k24_has_permission('crm:manage'));

-- Сделки: как контакты (свои / без ответственного / все при crm:see_all).
CREATE POLICY deals_select ON public.k24_deals FOR SELECT TO authenticated
  USING (
    public.k24_has_permission('view:crm')
    AND (public.k24_has_permission('crm:see_all') OR owner_id IS NULL OR owner_id = (SELECT auth.uid()))
  );
CREATE POLICY deals_insert ON public.k24_deals FOR INSERT TO authenticated
  WITH CHECK (public.k24_has_permission('view:crm') AND public.k24_has_permission('crm:edit'));
CREATE POLICY deals_update ON public.k24_deals FOR UPDATE TO authenticated
  USING (
    public.k24_has_permission('crm:edit')
    AND (public.k24_has_permission('crm:see_all') OR owner_id IS NULL OR owner_id = (SELECT auth.uid()))
  )
  WITH CHECK (public.k24_has_permission('crm:edit'));
CREATE POLICY deals_delete ON public.k24_deals FOR DELETE TO authenticated
  USING (public.k24_has_permission('crm:manage'));

-- ===========================================================================
-- 4. Сид: воронка «Продажи» + причины проигрыша (только если пусто)
-- ===========================================================================
DO $$
DECLARE v_pipeline uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.k24_crm_pipelines) THEN
    INSERT INTO public.k24_crm_pipelines (name, sort, is_default) VALUES ('Продажи', 1, true)
      RETURNING id INTO v_pipeline;
    INSERT INTO public.k24_crm_stages (pipeline_id, name, color, sort, probability, kind, rot_days) VALUES
      (v_pipeline, 'Новая заявка',        '#60A5FA', 1, 10,  'open', 2),
      (v_pipeline, 'Расчёт и КП',         '#A78BFA', 2, 30,  'open', 3),
      (v_pipeline, 'Согласование макета', '#FBBF24', 3, 50,  'open', 5),
      (v_pipeline, 'Ожидает оплаты',      '#F97316', 4, 80,  'open', 5),
      (v_pipeline, 'Выиграна',            '#22C55E', 5, 100, 'won',  NULL),
      (v_pipeline, 'Проиграна',           '#EF4444', 6, 0,   'lost', NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.k24_crm_lost_reasons) THEN
    INSERT INTO public.k24_crm_lost_reasons (name, sort) VALUES
      ('Дорого', 1), ('Не устроили сроки', 2), ('Выбрали другого', 3),
      ('Не выходит на связь', 4), ('Передумал', 5), ('Другое', 6);
  END IF;
END $$;

-- ===========================================================================
-- 5. Заказ ↔ сделка
-- ===========================================================================
ALTER TABLE public.k24_orders
  ADD COLUMN IF NOT EXISTS deal_id uuid REFERENCES public.k24_deals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_deal ON public.k24_orders (deal_id) WHERE deal_id IS NOT NULL;
GRANT SELECT (deal_id) ON public.k24_orders TO authenticated;

-- k24_orders_full: определение из прода 25.11 (pg_get_viewdef) + deal_id в конце.
-- Финансовые CASE не меняются.
CREATE OR REPLACE VIEW public.k24_orders_full AS
 SELECT id, number, client_id, order_type, status, width_mm, height_mm, qty, design_variants, need_lam, lam_type,
    CASE WHEN (EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role
      WHERE p.id = auth.uid() AND rp.permission = 'view:finance'::text AND rp.allowed)) THEN cost_materials ELSE NULL::numeric END AS cost_materials,
    CASE WHEN (EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role
      WHERE p.id = auth.uid() AND rp.permission = 'view:finance'::text AND rp.allowed)) THEN cost_labor ELSE NULL::numeric END AS cost_labor,
    CASE WHEN (EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role
      WHERE p.id = auth.uid() AND rp.permission = 'view:finance'::text AND rp.allowed)) THEN cost_total ELSE NULL::numeric END AS cost_total,
    CASE WHEN (EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role
      WHERE p.id = auth.uid() AND rp.permission = 'view:finance'::text AND rp.allowed)) THEN markup ELSE NULL::numeric END AS markup,
    CASE WHEN (EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role
      WHERE p.id = auth.uid() AND rp.permission = 'view:finance'::text AND rp.allowed)) THEN discount_pct ELSE NULL::numeric END AS discount_pct,
    CASE WHEN (EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role
      WHERE p.id = auth.uid() AND rp.permission = 'view:finance'::text AND rp.allowed)) THEN price_final ELSE NULL::numeric END AS price_final,
    CASE WHEN (EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role
      WHERE p.id = auth.uid() AND rp.permission = 'view:finance'::text AND rp.allowed)) THEN price_per_unit ELSE NULL::numeric END AS price_per_unit,
    prod_days, assigned_to, created_by, deadline, notes, created_at, updated_at, bitrix_deal_id, bitrix_url,
    priority, checklist, status_changed_at, film_type, stickers_per_pack, is_3d, mockup_path, is_urgent,
    is_partner, needs_montage_film, needs_individual_cut, printed_meters, resin_used, rejected_qty, printed_qty,
    deal_name, source, source_referrer, payment_status, design_status, delivery_type, delivery_city,
    delivery_address, delivery_notes, bopp_bag, custom_number, film_type_stickers, ink_deducted_at,
    drying_started_at, film_material_id, film_stickers_material_id, lam_material_id, sticker_shape,
    route_version, product_name, is_subcontract, contractor_id, contractor_notes,
    CASE WHEN (EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role
      WHERE p.id = auth.uid() AND rp.permission = 'view:finance'::text AND rp.allowed)) THEN contractor_cost ELSE NULL::numeric END AS contractor_cost,
    montage_material_id,
    CASE WHEN (EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role
      WHERE p.id = auth.uid() AND rp.permission = 'view:finance'::text AND rp.allowed)) THEN calc_snapshot ELSE NULL::jsonb END AS calc_snapshot,
    route_snapshot,
    deal_id
   FROM k24_orders o;

COMMIT;
