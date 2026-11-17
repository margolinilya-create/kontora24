-- ============================================================
-- R25.7A (ТЗ 17.11, Фаза 7.2, 7.8) — снимок маршрута типа в заказе
-- ============================================================
-- Аддитивная и идемпотентная миграция (можно прогнать повторно). Требует 102.
--   1. k24_orders.route_snapshot JSONB:
--        { v:1, type, builtin, is_set, stages, production, rates, taken_at }
--      stages — полный маршрут v2 типа ДО правил конкретного заказа (макет от
--      клиента, ламинация, доставка, субподряд — их применяет getOrderRoute):
--        голова (без образца при head.sample=false, без препресса при
--        head.prepress=false) + production + packaging, otk, awaiting_pickup,
--        delivery, done.
--      НЕфинансовая колонка (ставки типа — не деньги заказа): колоночный
--      GRANT SELECT authenticated + в конец k24_orders_full.
--   2. k24_build_route_snapshot(type_key) — сборка снимка из k24_order_types.
--   3. FK k24_orders.order_type → k24_order_types(key): предпроверка
--      (RAISE со списком неизвестных значений) → NOT VALID → VALIDATE.
--      order_type допускает NULL (webhook Bitrix с неизвестным типом пишет NULL
--      + предупреждение в k24_integration_log).
--   4. Backfill: существующие заказы v2 получают снимок своего типа;
--      самопроверка DO-блоком — для встроенных типов snapshot.stages обязан
--      совпасть с ORDER_ROUTES_V2 (constants.js), иначе RAISE и откат.
--   5. Триггер BEFORE INSERT/UPDATE: заказ v2 без снимка получает снимок своего
--      типа; смена типа или перевод v1→v2 пересобирает снимок (если снимок не
--      задан явно в том же UPDATE). Правка ТИПА в настройках на существующие
--      заказы не действует (ТЗ 7.2).
--   6. k24_orders_full: тело 101 ДОСЛОВНО + route_snapshot в конце.
--   7. k24_protect_order_columns: тело 101 ДОСЛОВНО + route_snapshot.
--   8. RPC apply_type_route_to_order(order_id) — «Применить текущий маршрут
--      типа» (admin/manager, аудит в k24_order_audit).
--
-- Порядок: 102 → 103 → деплой фронта R25.7A (фронт выбирает route_snapshot
-- в списках/карточке/очередях/планировщике — без 103 запросы упадут 42703).
-- Rollback (данные не теряются):
--   DROP TRIGGER IF EXISTS trg_k24_orders_route_snapshot ON public.k24_orders;
--   ALTER TABLE public.k24_orders DROP CONSTRAINT IF EXISTS k24_orders_order_type_fkey_r257;
--   пересоздать k24_protect_order_columns из 101; view и колонку оставить
--   (фронт без снимка откатывается на маршрут из констант).

BEGIN;

-- ── 1. Колонка ──────────────────────────────────────────────
ALTER TABLE public.k24_orders
  ADD COLUMN IF NOT EXISTS route_snapshot JSONB;

COMMENT ON COLUMN public.k24_orders.route_snapshot IS
  'R25.7: снимок маршрута и ставок типа на момент создания заказа v2 ({v,type,builtin,is_set,stages,production,rates,taken_at}). Нефинансовая: GRANT authenticated.';

-- Нефинансовая колонка → колоночный GRANT (после 072 табличной SELECT нет).
GRANT SELECT (route_snapshot) ON public.k24_orders TO authenticated;

-- ── 2. Сборка снимка из реестра типов ───────────────────────
CREATE OR REPLACE FUNCTION public.k24_build_route_snapshot(p_type TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  t      k24_order_types%ROWTYPE;
  v_head JSONB := '["new","awaiting_payment","design","design_approval"]'::jsonb;
BEGIN
  IF p_type IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO t FROM k24_order_types WHERE key = p_type;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Голова v2 (constants.js HEAD_V2): образец — три этапа вместе, препресс — отдельно.
  IF COALESCE((t.head->>'sample')::boolean, true) THEN
    v_head := v_head || '["sample_layout","sample_print","color_approval"]'::jsonb;
  END IF;
  IF COALESCE((t.head->>'prepress')::boolean, true) THEN
    v_head := v_head || '["prepress"]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'v',          1,
    'type',       t.key,
    'builtin',    t.is_builtin,
    'is_set',     t.is_set,
    'stages',     v_head || t.production || '["packaging","otk","awaiting_pickup","delivery","done"]'::jsonb,
    'production', t.production,
    'rates',      CASE WHEN t.is_builtin THEN NULL ELSE t.rates END,
    'taken_at',   now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.k24_build_route_snapshot(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.k24_build_route_snapshot(TEXT) TO authenticated;

-- ── 3. FK order_type → реестр типов ─────────────────────────
-- NULL допустим (webhook с неизвестным типом). DROP NOT NULL — ослабление,
-- данных не трогает; форма заказа по-прежнему требует тип (Zod).
ALTER TABLE public.k24_orders ALTER COLUMN order_type DROP NOT NULL;

DO $$
DECLARE
  v_unknown TEXT;
BEGIN
  SELECT string_agg(format('%s (%s шт.)', u.order_type, u.cnt), ', ')
    INTO v_unknown
    FROM (
      SELECT o.order_type, count(*) AS cnt
        FROM k24_orders o
       WHERE o.order_type IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM k24_order_types t WHERE t.key = o.order_type)
       GROUP BY o.order_type
    ) u;
  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'R25.7: в k24_orders есть типы, которых нет в k24_order_types: %. Добавьте их в реестр или исправьте заказы, затем повторите миграцию.', v_unknown;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'k24_orders_order_type_fkey_r257'
       AND conrelid = 'public.k24_orders'::regclass
  ) THEN
    ALTER TABLE public.k24_orders
      ADD CONSTRAINT k24_orders_order_type_fkey_r257
      FOREIGN KEY (order_type) REFERENCES public.k24_order_types(key)
      ON UPDATE CASCADE
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.k24_orders VALIDATE CONSTRAINT k24_orders_order_type_fkey_r257;

CREATE INDEX IF NOT EXISTS idx_k24_orders_order_type ON public.k24_orders (order_type);

-- ── 4. Backfill снимков существующих заказов v2 ─────────────
-- protect_order_columns на время backfill выключаем: в миграции auth.uid()
-- пуст, и на повторном прогоне (когда тело уже включает route_snapshot)
-- триггер счёл бы запись снимка попыткой воркера. Аудит-триггер
-- route_snapshot не пишет; триггер снимка (п.5) ещё не создан либо не
-- реагирует на UPDATE одной колонки route_snapshot.
ALTER TABLE public.k24_orders DISABLE TRIGGER protect_order_columns;

UPDATE public.k24_orders o
   SET route_snapshot = public.k24_build_route_snapshot(o.order_type)
 WHERE o.route_version >= 2
   AND o.route_snapshot IS NULL
   AND o.order_type IS NOT NULL
   AND EXISTS (SELECT 1 FROM public.k24_order_types t WHERE t.key = o.order_type);

ALTER TABLE public.k24_orders ENABLE TRIGGER protect_order_columns;

-- Самопроверка: встроенный тип без правок → stages = ORDER_ROUTES_V2 из констант.
DO $$
DECLARE
  v_head  CONSTANT JSONB := '["new","awaiting_payment","design","design_approval","sample_layout","sample_print","color_approval","prepress"]';
  v_tail  CONSTANT JSONB := '["packaging","otk","awaiting_pickup","delivery","done"]';
  v_flat  CONSTANT JSONB := '["print","lamination","cutting"]';
  v_3d    CONSTANT JSONB := '["print","cutting","pouring","drying","selection"]';
  v_univ  CONSTANT JSONB := '["print","lamination","cutting","selection","pouring","drying","assembly_3d"]';
  v_expected JSONB;
  v_bad   TEXT;
  r       RECORD;
BEGIN
  v_expected := jsonb_build_object(
    'sticker_cut',   v_head || v_flat || v_tail,
    'sticker_kiss',  v_head || v_flat || v_tail,
    'stickerpack',   v_head || v_flat || v_tail,
    'rect',          v_head || v_flat || v_tail,
    'big',           v_head || v_flat || v_tail,
    'sticker3D',     v_head || v_3d   || v_tail,
    'stickerpack3D', v_head || v_univ || v_tail,
    'other',         v_head || v_univ || v_tail
  );

  -- 1) Сборщик снимка для каждого встроенного типа (если администратор ещё
  --    не менял его маршрут/голову — иначе отличие законно).
  FOR r IN
    SELECT key FROM k24_order_types
     WHERE is_builtin
       AND production = default_production
       AND COALESCE((head->>'sample')::boolean, true)
       AND COALESCE((head->>'prepress')::boolean, true)
  LOOP
    IF v_expected ? r.key
       AND (public.k24_build_route_snapshot(r.key)->'stages') IS DISTINCT FROM (v_expected->r.key) THEN
      RAISE EXCEPTION 'R25.7: снимок типа % расходится с ORDER_ROUTES_V2: %',
        r.key, public.k24_build_route_snapshot(r.key)->'stages';
    END IF;
  END LOOP;

  -- 2) Заказы v2 встроенных типов: снимок есть и совпадает с константой.
  SELECT string_agg(format('#%s %s', o.number, o.order_type), ', ')
    INTO v_bad
    FROM k24_orders o
    JOIN k24_order_types t ON t.key = o.order_type
   WHERE o.route_version >= 2
     AND t.is_builtin
     AND t.production = t.default_production
     AND COALESCE((t.head->>'sample')::boolean, true)
     AND COALESCE((t.head->>'prepress')::boolean, true)
     AND (o.route_snapshot IS NULL
          OR (o.route_snapshot->'stages') IS DISTINCT FROM (v_expected->o.order_type));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'R25.7: снимок маршрута заказов расходится с константами: %', v_bad;
  END IF;
END $$;

-- ── 5. Триггер: снимок при создании, смене типа, переводе v1→v2 ──
-- Имя trg_k24_orders_route_snapshot > protect_order_columns по алфавиту:
-- BEFORE-триггеры идут по имени, protect видит исходный NEW (без пересборки).
CREATE OR REPLACE FUNCTION public.k24_orders_route_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF COALESCE(NEW.route_version, 1) < 2 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.route_snapshot IS NULL THEN
      NEW.route_snapshot := public.k24_build_route_snapshot(NEW.order_type);
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: явно переданный снимок не трогаем (apply_type_route_to_order).
  IF NEW.route_snapshot IS DISTINCT FROM OLD.route_snapshot THEN
    RETURN NEW;
  END IF;
  IF NEW.order_type IS DISTINCT FROM OLD.order_type
     OR COALESCE(OLD.route_version, 1) < 2
     OR NEW.route_snapshot IS NULL THEN
    NEW.route_snapshot := public.k24_build_route_snapshot(NEW.order_type);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.k24_orders_route_snapshot() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_k24_orders_route_snapshot ON public.k24_orders;
CREATE TRIGGER trg_k24_orders_route_snapshot
  BEFORE INSERT OR UPDATE OF order_type, route_version ON public.k24_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.k24_orders_route_snapshot();

-- ── 6. View: копия 101 + route_snapshot в конце ─────────────
-- CREATE OR REPLACE VIEW допускает только добавление колонок в конец.
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
  o.sticker_shape,
  o.route_version,
  o.product_name,
  o.is_subcontract,
  o.contractor_id,
  o.contractor_notes,
  CASE WHEN EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role WHERE p.id = auth.uid() AND rp.permission = 'view:finance' AND rp.allowed) THEN o.contractor_cost END AS contractor_cost,
  o.montage_material_id,
  CASE WHEN EXISTS (SELECT 1 FROM k24_profiles p JOIN k24_role_permissions rp ON rp.role = p.role WHERE p.id = auth.uid() AND rp.permission = 'view:finance' AND rp.allowed) THEN o.calc_snapshot END AS calc_snapshot,
  o.route_snapshot
FROM k24_orders o;

REVOKE ALL ON public.k24_orders_full FROM PUBLIC, anon;
GRANT SELECT ON public.k24_orders_full TO authenticated;

-- ── 7. Protect-триггер: тело 101 + route_snapshot ───────────
-- Триггер protect_order_columns (BEFORE UPDATE, security phase 2) не меняется.
CREATE OR REPLACE FUNCTION public.k24_protect_order_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM k24_profiles WHERE id = auth.uid();

  -- Admin and manager can change anything
  IF v_role IN ('admin', 'manager') THEN
    RETURN NEW;
  END IF;

  -- Workers can only change: status, assigned_to, checklist, updated_at
  -- Block changes to financial and deal fields
  IF NEW.price_final IS DISTINCT FROM OLD.price_final
    OR NEW.cost_total IS DISTINCT FROM OLD.cost_total
    OR NEW.cost_materials IS DISTINCT FROM OLD.cost_materials
    OR NEW.cost_labor IS DISTINCT FROM OLD.cost_labor
    OR NEW.markup IS DISTINCT FROM OLD.markup
    OR NEW.discount_pct IS DISTINCT FROM OLD.discount_pct
    OR NEW.price_per_unit IS DISTINCT FROM OLD.price_per_unit
    OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
    OR NEW.deal_name IS DISTINCT FROM OLD.deal_name
    OR NEW.bitrix_deal_id IS DISTINCT FROM OLD.bitrix_deal_id
    OR NEW.qty IS DISTINCT FROM OLD.qty
    OR NEW.order_type IS DISTINCT FROM OLD.order_type
    OR NEW.client_id IS DISTINCT FROM OLD.client_id
    OR NEW.deadline IS DISTINCT FROM OLD.deadline
    OR NEW.priority IS DISTINCT FROM OLD.priority
    -- 074: форма стикера определяет ставку заливки — воркерам нельзя.
    OR NEW.sticker_shape IS DISTINCT FROM OLD.sticker_shape
    -- 093: версия маршрута определяет оплату упаковки — воркерам нельзя.
    OR NEW.route_version IS DISTINCT FROM OLD.route_version
    -- 099: стоимость подрядчика — финансовая; субподряд меняет маршрут.
    OR NEW.contractor_cost IS DISTINCT FROM OLD.contractor_cost
    OR NEW.is_subcontract IS DISTINCT FROM OLD.is_subcontract
    -- 101: снимок расчёта калькулятора — финансовый.
    OR NEW.calc_snapshot IS DISTINCT FROM OLD.calc_snapshot
    -- 103: снимок маршрута определяет этапы и сдельные ставки — воркерам нельзя.
    OR NEW.route_snapshot IS DISTINCT FROM OLD.route_snapshot
  THEN
    RAISE EXCEPTION 'Access denied: workers cannot modify protected order fields';
  END IF;

  RETURN NEW;
END;
$$;

-- ── 8. RPC «Применить текущий маршрут типа» ─────────────────
-- Только admin/manager (кнопка в карточке заказа, ТЗ 7.2; UI — часть C).
-- Отказ: заказ завершён/отменён, маршрут v1, субподряд (маршрут не зависит
-- от типа), тип не найден, текущий этап отсутствует в новом маршруте.
-- Аудит: k24_order_audit(field_name='route_snapshot', old/new = stages).
CREATE OR REPLACE FUNCTION public.apply_type_route_to_order(p_order_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid   UUID := auth.uid();
  v_role  TEXT;
  v_order RECORD;
  v_snap  JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Сессия не активна. Войдите заново.');
  END IF;
  SELECT role INTO v_role FROM k24_profiles WHERE id = v_uid;
  IF v_role IS NULL OR v_role NOT IN ('admin', 'manager') THEN
    RETURN json_build_object('ok', false, 'error', 'Применить маршрут типа может только администратор или руководитель.');
  END IF;

  SELECT id, status, order_type, route_version, is_subcontract, route_snapshot
    INTO v_order
    FROM k24_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'Заказ не найден.');
  END IF;
  IF v_order.status IN ('done', 'cancelled') THEN
    RETURN json_build_object('ok', false, 'error', 'Заказ завершён или отменён — маршрут не меняется.');
  END IF;
  IF COALESCE(v_order.route_version, 1) < 2 THEN
    RETURN json_build_object('ok', false, 'error', 'У заказа маршрут версии 1 — сначала переведите его на новый маршрут.');
  END IF;
  IF v_order.is_subcontract THEN
    RETURN json_build_object('ok', false, 'error', 'Заказ на субподряде — его маршрут не зависит от типа.');
  END IF;

  v_snap := public.k24_build_route_snapshot(v_order.order_type);
  IF v_snap IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Тип заказа не найден в справочнике типов.');
  END IF;
  IF NOT ((v_snap->'stages') ? v_order.status) THEN
    RETURN json_build_object('ok', false, 'error',
      format('Текущего этапа заказа нет в новом маршруте типа (%s) — сначала переведите заказ на этап из нового маршрута.', v_order.status));
  END IF;

  UPDATE k24_orders SET route_snapshot = v_snap WHERE id = p_order_id;

  INSERT INTO k24_order_audit (order_id, field_name, old_value, new_value, changed_by)
  VALUES (
    p_order_id,
    'route_snapshot',
    (v_order.route_snapshot->'stages')::text,
    (v_snap->'stages')::text,
    v_uid
  );

  RETURN json_build_object('ok', true, 'route_snapshot', v_snap);
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_type_route_to_order(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_type_route_to_order(UUID) TO authenticated;

COMMIT;

-- Проверка после применения:
-- SELECT order_type, route_snapshot->'stages' FROM k24_orders WHERE route_version >= 2 LIMIT 10;
-- SELECT count(*) FROM k24_orders WHERE route_version >= 2 AND route_snapshot IS NULL;  -- 0 (кроме order_type NULL)
-- SELECT has_column_privilege('authenticated', 'public.k24_orders', 'route_snapshot', 'SELECT'); -- true
-- SELECT convalidated FROM pg_constraint WHERE conname = 'k24_orders_order_type_fkey_r257';     -- true
