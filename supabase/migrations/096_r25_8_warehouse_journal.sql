-- 096 (R25.8, ТЗ Фаза 8) — журнал склада: структура.
--
-- Аддитивная миграция (ничего не ломает текущий фронт):
--   1. Новые колонки k24_material_transactions: kind / op_date / supplier /
--      doc_number / is_auto / needs_review / updated_by / updated_at.
--   2. Классификатор k24_classify_material_tx(reason, delta) — общий для
--      BEFORE INSERT-страховки и переноса истории (097). JS-зеркало:
--      src/features/warehouse/lib/warehouse-journal.js → classifyMaterialOperation.
--   3. BEFORE INSERT-триггер: если kind не передан — ставит по причине/знаку,
--      op_date — дата внесения по Москве. Забытое место записи не ломает цех.
--   4. Индексы под журнал.
--   5. Аудит уточнений k24_material_transaction_audit.
--   6. Право warehouse:edit_operation (admin, manager).
--   7. Хелпер k24_user_can(permission) — проверка L2-права текущего юзера.
--   8. View k24_material_movements (операция + позиция/категория/заказ/автор +
--      «остаток после» + деньги, маскированные по view:finance) и
--      k24_materials_full (позиции с маскированной средней ценой).
--   9. RPC: warehouse_movements (фильтры журнала), warehouse_movements_totals,
--      warehouse_turnover (сводка 8.6), update_material_operation («Уточнить»),
--      warehouse_add_operation (приход/расход/начальный остаток — атомарно),
--      warehouse_inventory (массовая инвентаризация — атомарно).
--  10. recalc_material_wac → SECURITY DEFINER (тело без изменений): иначе WAC
--      не обновлялся у не-admin (RLS UPDATE k24_materials) и упадёт после 098
--      (колоночный REVOKE unit_cost).
--  11. deduct_materials_from_log (тело 092 дословно) и delete_order_cascade
--      (тело из прода дословно) — только добавлены kind / is_auto / op_date
--      в INSERT'ы операций.
--
-- ОТКЛОНЕНИЕ от ТЗ 8.9: view k24_material_movements сделан owner-run
-- (security_invoker = false), как k24_orders_full (071). security_invoker-view
-- после 098 падал бы 42501 у всех authenticated (в т.ч. с view:finance):
-- колоночные привилегии проверяются у вызывающего ДО CASE-маски. RLS базовых
-- таблиц (operations / materials / categories / profiles / orders) для
-- authenticated = USING(true), поэтому owner-run не расширяет видимость строк.
-- anon доступ закрыт явно.
--
-- Порядок применения: 096 → (деплой фронта R25.8) → 097 → 098.
-- 097 можно применять сразу после 096 (фронт с ним совместим), 098 — СТРОГО
-- после прод-деплоя фронта R25.8 (старый фронт читает unit_cost/total_cost
-- напрямую и сломается).

BEGIN;

-- ===========================================================================
-- 1. Колонки
-- ===========================================================================
ALTER TABLE public.k24_material_transactions
  ADD COLUMN IF NOT EXISTS kind         text,
  ADD COLUMN IF NOT EXISTS op_date      date,
  ADD COLUMN IF NOT EXISTS supplier     text,
  ADD COLUMN IF NOT EXISTS doc_number   text,
  ADD COLUMN IF NOT EXISTS is_auto      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_by   uuid REFERENCES public.k24_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at   timestamptz;

ALTER TABLE public.k24_material_transactions
  DROP CONSTRAINT IF EXISTS k24_material_transactions_kind_check;
ALTER TABLE public.k24_material_transactions
  ADD CONSTRAINT k24_material_transactions_kind_check
  CHECK (kind IS NULL OR kind IN (
    'purchase', 'opening', 'order_consumption',
    'manual_consumption', 'inventory', 'correction'
  ));

COMMENT ON COLUMN public.k24_material_transactions.kind IS
  'Вид операции (R25.8): purchase/opening/order_consumption/manual_consumption/inventory/correction. Ставит место записи; BEFORE INSERT-страховка — по причине и знаку.';
COMMENT ON COLUMN public.k24_material_transactions.op_date IS
  'Дата операции (у прихода — дата поступления по накладной, иначе дата внесения по Москве). created_at — время внесения.';
COMMENT ON COLUMN public.k24_material_transactions.is_auto IS
  'true — создана триггером списания/возвратом (не редактируется «Уточнить»).';
COMMENT ON COLUMN public.k24_material_transactions.needs_review IS
  'Пометка «Проверить после переноса» (097): свободный текст причины / отрицательный начальный остаток. Снимается update_material_operation.';

-- ===========================================================================
-- 2. Классификатор (таблица 8.3 ТЗ). IMMUTABLE — без обращения к таблицам.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.k24_classify_material_tx(p_reason text, p_delta numeric)
RETURNS TABLE (o_kind text, o_is_auto boolean, o_needs_review boolean)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN s.is_writeoff THEN
        CASE WHEN p_delta < 0 THEN 'order_consumption' ELSE 'correction' END
      WHEN s.r LIKE 'Возврат%' THEN 'correction'
      WHEN s.r LIKE 'Начальный остаток%' THEN 'opening'
      WHEN s.r = 'Инвентаризация' THEN 'inventory'
      WHEN p_delta > 0 THEN 'purchase'
      WHEN p_delta < 0 THEN 'manual_consumption'
      ELSE 'correction'
    END,
    (s.is_writeoff OR s.r LIKE 'Возврат%'),
    NOT (
      s.is_writeoff
      OR s.r LIKE 'Возврат%'
      OR s.r LIKE 'Начальный остаток%'
      OR s.r LIKE 'Заказ #%'
      OR s.r IN ('Инвентаризация', 'Приход', 'Расход')
    )
  FROM (
    SELECT
      btrim(COALESCE(p_reason, '')) AS r,
      (btrim(COALESCE(p_reason, '')) LIKE 'Списание по факту%'
        OR btrim(COALESCE(p_reason, '')) LIKE 'Авто:%'
        OR btrim(COALESCE(p_reason, '')) LIKE 'auto\_%') AS is_writeoff
  ) s
$$;

-- ===========================================================================
-- 3. BEFORE INSERT-страховка
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.k24_material_tx_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  c record;
BEGIN
  IF NEW.kind IS NULL THEN
    SELECT * INTO c FROM public.k24_classify_material_tx(NEW.reason, NEW.delta);
    NEW.kind := c.o_kind;
    NEW.is_auto := COALESCE(NEW.is_auto, false) OR c.o_is_auto;
  END IF;
  IF NEW.op_date IS NULL THEN
    NEW.op_date := (COALESCE(NEW.created_at, now()) AT TIME ZONE 'Europe/Moscow')::date;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_material_tx_defaults ON public.k24_material_transactions;
CREATE TRIGGER trg_material_tx_defaults
  BEFORE INSERT ON public.k24_material_transactions
  FOR EACH ROW EXECUTE FUNCTION public.k24_material_tx_defaults();

-- ===========================================================================
-- 4. Индексы
-- ===========================================================================
CREATE INDEX IF NOT EXISTS idx_mat_tx_opdate
  ON public.k24_material_transactions (op_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mat_tx_material_opdate
  ON public.k24_material_transactions (material_id, op_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mat_tx_kind_opdate
  ON public.k24_material_transactions (kind, op_date);

-- ===========================================================================
-- 5. Аудит уточнений
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.k24_material_transaction_audit (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.k24_material_transactions(id) ON DELETE CASCADE,
  field_name     text NOT NULL,
  old_value      text,
  new_value      text,
  changed_by     uuid REFERENCES public.k24_profiles(id) ON DELETE SET NULL,
  changed_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mat_tx_audit_tx
  ON public.k24_material_transaction_audit (transaction_id, changed_at DESC);

-- ===========================================================================
-- 7. Хелпер прав (до политик/view, которые его используют)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.k24_user_can(p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM k24_profiles p
      JOIN k24_role_permissions rp ON rp.role = p.role
     WHERE p.id = auth.uid()
       AND rp.permission = p_permission
       AND rp.allowed
  )
$$;
REVOKE ALL ON FUNCTION public.k24_user_can(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.k24_user_can(text) TO authenticated;

ALTER TABLE public.k24_material_transaction_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mat_tx_audit_select ON public.k24_material_transaction_audit;
CREATE POLICY mat_tx_audit_select ON public.k24_material_transaction_audit
  FOR SELECT TO authenticated
  USING (public.k24_user_can('view:warehouse'));
-- Записи — только через update_material_operation (SECURITY DEFINER).
REVOKE ALL ON public.k24_material_transaction_audit FROM PUBLIC, anon;
GRANT SELECT ON public.k24_material_transaction_audit TO authenticated;

-- ===========================================================================
-- 6. Право warehouse:edit_operation (admin + manager). DO NOTHING — не
--    перетираем, если право уже настроили через UI.
-- ===========================================================================
INSERT INTO public.k24_role_permissions (role, permission, allowed) VALUES
  ('admin',        'warehouse:edit_operation', true),
  ('manager',      'warehouse:edit_operation', true),
  ('designer',     'warehouse:edit_operation', false),
  ('printer',      'warehouse:edit_operation', false),
  ('post_printer', 'warehouse:edit_operation', false)
ON CONFLICT (role, permission) DO NOTHING;

-- ===========================================================================
-- 10. WAC-триггер → SECURITY DEFINER (тело = 036 без изменений)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.recalc_material_wac()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_qty   NUMERIC;
  v_old_cost  NUMERIC;
  v_new_qty   NUMERIC;
  v_new_avg   NUMERIC;
BEGIN
  IF NEW.delta IS NULL OR NEW.delta <= 0 OR NEW.total_cost IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT stock_qty, COALESCE(unit_cost, 0)
    INTO v_old_qty, v_old_cost
  FROM k24_materials
  WHERE id = NEW.material_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_new_qty := COALESCE(v_old_qty, 0) + NEW.delta;
  IF v_new_qty > 0 THEN
    v_new_avg := (COALESCE(v_old_qty, 0) * v_old_cost + NEW.total_cost) / v_new_qty;
  ELSE
    v_new_avg := NEW.total_cost / NULLIF(NEW.delta, 0);
  END IF;

  NEW.unit_cost := NEW.total_cost / NEW.delta;

  UPDATE k24_materials
     SET unit_cost = v_new_avg,
         updated_at = now()
   WHERE id = NEW.material_id;

  RETURN NEW;
END
$$;

-- ===========================================================================
-- 8a. View операций с «остатком после» и маской денег
-- ===========================================================================
-- «Остаток после» = текущий остаток позиции минус все БОЛЕЕ ПОЗДНИЕ операции
-- (порядок op_date, created_at, id). У самой свежей операции = stock_qty.
-- После переноса (097) у каждой позиции Σ операций = stock_qty, поэтому у
-- самой старой операции остаток после = её delta (остаток до = 0).
-- Резервы (reservation_status='reserved'/'released') — не движения склада.
CREATE OR REPLACE VIEW public.k24_material_movements AS
SELECT
  t.id,
  t.material_id,
  m.name                     AS material_name,
  m.unit,
  m.type                     AS material_type,
  m.category_id,
  c.name                     AS category_name,
  (m.archived_at IS NOT NULL) AS material_archived,
  t.kind,
  t.is_auto,
  t.needs_review,
  t.op_date,
  t.created_at,
  t.delta,
  t.reason,
  t.supplier,
  t.doc_number,
  t.order_id,
  o.number                   AS order_number,
  o.custom_number            AS order_custom_number,
  t.created_by,
  p.display_name             AS created_by_name,
  t.updated_by,
  t.updated_at,
  CASE WHEN f.can_fin THEN t.total_cost END AS total_cost,
  CASE WHEN f.can_fin THEN t.unit_cost  END AS unit_cost,
  m.stock_qty - COALESCE(SUM(t.delta) OVER w, 0) AS balance_after
FROM public.k24_material_transactions t
JOIN public.k24_materials m ON m.id = t.material_id
LEFT JOIN public.k24_warehouse_categories c ON c.id = m.category_id
LEFT JOIN public.k24_orders o ON o.id = t.order_id
LEFT JOIN public.k24_profiles p ON p.id = t.created_by
-- Некоррелированный подзапрос (OFFSET 0 запрещает pull-up) → право
-- проверяется один раз на запрос, а не на каждую строку.
CROSS JOIN (SELECT public.k24_user_can('view:finance') AS can_fin OFFSET 0) f
WHERE COALESCE(t.reservation_status, 'consumed') = 'consumed'
WINDOW w AS (
  PARTITION BY t.material_id
  ORDER BY t.op_date DESC, t.created_at DESC NULLS LAST, t.id DESC
  ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
);

REVOKE ALL ON public.k24_material_movements FROM PUBLIC, anon;
GRANT SELECT ON public.k24_material_movements TO authenticated;
COMMENT ON VIEW public.k24_material_movements IS
  'R25.8: журнал склада. total_cost/unit_cost = NULL без права view:finance. Owner-run (см. шапку 096).';

-- ===========================================================================
-- 8b. Позиции склада с маскированной средней ценой (читатель для 098)
-- ===========================================================================
-- ВАЖНО (процесс): новая колонка k24_materials → (1) GRANT SELECT (col) ON
-- k24_materials TO authenticated (после 098), (2) добавить в конец этого view.
CREATE OR REPLACE VIEW public.k24_materials_full AS
SELECT
  m.id,
  m.type,
  m.name,
  m.stock_qty,
  m.unit,
  m.min_qty,
  CASE WHEN f.can_fin THEN m.unit_cost END AS unit_cost,
  m.updated_at,
  m.material_code,
  m.capacity_per_box,
  m.archived_at,
  m.width_mm,
  m.height_mm,
  m.manufacturer,
  m.product_line,
  m.roll_width_m,
  m.finish,
  m.color,
  m.supplier,
  m.category_id,
  m.wh_status_id,
  c.name AS category_name
FROM public.k24_materials m
LEFT JOIN public.k24_warehouse_categories c ON c.id = m.category_id
CROSS JOIN (SELECT public.k24_user_can('view:finance') AS can_fin OFFSET 0) f;

REVOKE ALL ON public.k24_materials_full FROM PUBLIC, anon;
GRANT SELECT ON public.k24_materials_full TO authenticated;
COMMENT ON VIEW public.k24_materials_full IS
  'R25.8: k24_materials с unit_cost = NULL без права view:finance. Owner-run (как k24_orders_full).';

-- ===========================================================================
-- 9a. Журнал с фильтрами (одно определение фильтров для списка/итогов/Excel)
-- ===========================================================================
-- p_filters (все ключи опциональны):
--   from, to         — 'YYYY-MM-DD', по op_date включительно
--   category_ids     — ["uuid", …]
--   material_id      — uuid
--   kinds            — ["purchase", …]
--   auto             — 'auto' | 'manual'
--   needs_review     — true
--   supplier         — подстрока (без учёта регистра)
--   order_number     — номер заказа (number или custom_number)
--   created_by       — uuid
--   q                — подстрока в комментарии или № документа
-- Подстроки — через strpos (без LIKE-шаблонов → % и _ из ввода не спецсимволы).
CREATE OR REPLACE FUNCTION public.warehouse_movements(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS SETOF public.k24_material_movements
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT v.*
    FROM public.k24_material_movements v
   WHERE (NULLIF(p_filters->>'from', '') IS NULL OR v.op_date >= (p_filters->>'from')::date)
     AND (NULLIF(p_filters->>'to', '') IS NULL OR v.op_date <= (p_filters->>'to')::date)
     AND (
       jsonb_typeof(p_filters->'category_ids') IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_filters->'category_ids') = 0
       OR v.category_id::text IN (SELECT jsonb_array_elements_text(p_filters->'category_ids'))
     )
     AND (NULLIF(p_filters->>'material_id', '') IS NULL OR v.material_id = (p_filters->>'material_id')::uuid)
     AND (
       jsonb_typeof(p_filters->'kinds') IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_filters->'kinds') = 0
       OR v.kind IN (SELECT jsonb_array_elements_text(p_filters->'kinds'))
     )
     AND (
       COALESCE(p_filters->>'auto', '') NOT IN ('auto', 'manual')
       OR v.is_auto = ((p_filters->>'auto') = 'auto')
     )
     AND (COALESCE((p_filters->>'needs_review')::boolean, false) = false OR v.needs_review)
     AND (
       NULLIF(btrim(p_filters->>'supplier'), '') IS NULL
       OR strpos(lower(COALESCE(v.supplier, '')), lower(btrim(p_filters->>'supplier'))) > 0
     )
     AND (
       NULLIF(btrim(p_filters->>'order_number'), '') IS NULL
       OR v.order_number::text = btrim(p_filters->>'order_number')
       OR v.order_custom_number = btrim(p_filters->>'order_number')
     )
     AND (NULLIF(p_filters->>'created_by', '') IS NULL OR v.created_by = (p_filters->>'created_by')::uuid)
     AND (
       NULLIF(btrim(p_filters->>'q'), '') IS NULL
       OR strpos(
            lower(COALESCE(v.reason, '') || ' ' || COALESCE(v.doc_number, '')),
            lower(btrim(p_filters->>'q'))
          ) > 0
     )
$$;
REVOKE ALL ON FUNCTION public.warehouse_movements(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.warehouse_movements(jsonb) TO authenticated;

-- ===========================================================================
-- 9b. Итоги журнала по всему фильтру (не по загруженной странице)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.warehouse_movements_totals(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE (
  op_count     bigint,
  qty_in       numeric,
  qty_out      numeric,
  qty_net      numeric,
  unit_count   bigint,
  unit         text,
  purchase_sum numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    count(*),
    COALESCE(sum(v.delta) FILTER (WHERE v.delta > 0), 0),
    COALESCE(-sum(v.delta) FILTER (WHERE v.delta < 0), 0),
    COALESCE(sum(v.delta), 0),
    count(DISTINCT v.unit),
    CASE WHEN count(DISTINCT v.unit) = 1 THEN min(v.unit) END,
    -- total_cost уже замаскирован view → без view:finance сумма = NULL.
    sum(v.total_cost) FILTER (WHERE v.kind = 'purchase')
  FROM public.warehouse_movements(p_filters) v
$$;
REVOKE ALL ON FUNCTION public.warehouse_movements_totals(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.warehouse_movements_totals(jsonb) TO authenticated;

-- ===========================================================================
-- 9c. Оборотная ведомость (сводка 8.6) — по строке на позицию
-- ===========================================================================
-- opening = stock_qty − Σ(delta, op_date ≥ p_from)
-- closing = stock_qty − Σ(delta, op_date > p_to)
-- opening + purchased − order_consumption − manual_consumption + inventory
--   + corrections = closing  (6 видов покрывают все операции).
-- SECURITY DEFINER: читает total_cost таблицы (после 098 у authenticated
-- колонка отозвана); сумма маскируется по view:finance явно.
CREATE OR REPLACE FUNCTION public.warehouse_turnover(
  p_from date,
  p_to date,
  p_category_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  material_id        uuid,
  material_name      text,
  unit               text,
  category_id        uuid,
  category_name      text,
  archived           boolean,
  opening            numeric,
  purchased          numeric,
  order_consumption  numeric,
  manual_consumption numeric,
  inventory          numeric,
  corrections        numeric,
  closing            numeric,
  purchase_count     bigint,
  last_purchase_date date,
  purchase_sum       numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_fin boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.k24_user_can('view:warehouse') THEN
    RAISE EXCEPTION 'Нет доступа к складу' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'Некорректный период' USING ERRCODE = '22023';
  END IF;
  v_fin := public.k24_user_can('view:finance');

  RETURN QUERY
  WITH tx AS (
    SELECT t.material_id AS mid, t.kind AS k, t.delta AS d, t.op_date AS od, t.total_cost AS tc
      FROM public.k24_material_transactions t
     WHERE COALESCE(t.reservation_status, 'consumed') = 'consumed'
  ),
  agg AS (
    SELECT
      m.id AS mid,
      COALESCE(sum(tx.d) FILTER (WHERE tx.od >= p_from), 0) AS since_from,
      COALESCE(sum(tx.d) FILTER (WHERE tx.od > p_to), 0) AS after_to,
      COALESCE(sum(tx.d) FILTER (WHERE tx.k = 'purchase' AND tx.od BETWEEN p_from AND p_to), 0) AS a_purchased,
      COALESCE(-sum(tx.d) FILTER (WHERE tx.k = 'order_consumption' AND tx.od BETWEEN p_from AND p_to), 0) AS a_order,
      COALESCE(-sum(tx.d) FILTER (WHERE tx.k = 'manual_consumption' AND tx.od BETWEEN p_from AND p_to), 0) AS a_manual,
      COALESCE(sum(tx.d) FILTER (WHERE tx.k = 'inventory' AND tx.od BETWEEN p_from AND p_to), 0) AS a_inventory,
      COALESCE(sum(tx.d) FILTER (WHERE tx.k IN ('correction', 'opening') AND tx.od BETWEEN p_from AND p_to), 0) AS a_corr,
      count(tx.d) FILTER (WHERE tx.k = 'purchase' AND tx.od BETWEEN p_from AND p_to) AS a_purchase_count,
      count(tx.d) FILTER (WHERE tx.od BETWEEN p_from AND p_to) AS a_ops,
      max(tx.od) FILTER (WHERE tx.k = 'purchase') AS a_last_purchase,
      sum(tx.tc) FILTER (WHERE tx.k = 'purchase' AND tx.od BETWEEN p_from AND p_to) AS a_sum
    FROM public.k24_materials m
    LEFT JOIN tx ON tx.mid = m.id
    WHERE p_category_ids IS NULL
       OR cardinality(p_category_ids) = 0
       OR m.category_id = ANY (p_category_ids)
    GROUP BY m.id
  )
  SELECT
    m.id,
    m.name,
    m.unit,
    m.category_id,
    c.name,
    (m.archived_at IS NOT NULL),
    m.stock_qty - a.since_from,
    a.a_purchased,
    a.a_order,
    a.a_manual,
    a.a_inventory,
    a.a_corr,
    m.stock_qty - a.after_to,
    a.a_purchase_count,
    a.a_last_purchase,
    CASE WHEN v_fin THEN a.a_sum END
  FROM agg a
  JOIN public.k24_materials m ON m.id = a.mid
  LEFT JOIN public.k24_warehouse_categories c ON c.id = m.category_id
  WHERE m.archived_at IS NULL
     OR a.a_ops > 0
     OR (m.stock_qty - a.since_from) <> 0
  ORDER BY c.sort_order NULLS LAST, c.name NULLS LAST, m.name;
END
$$;
REVOKE ALL ON FUNCTION public.warehouse_turnover(date, date, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.warehouse_turnover(date, date, uuid[]) TO authenticated;

-- ===========================================================================
-- 9d. «Уточнить» — правка реквизитов ручной операции (без qty и суммы)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.update_material_operation(
  p_id         uuid,
  p_op_date    date,
  p_kind       text,
  p_supplier   text DEFAULT NULL,
  p_doc_number text DEFAULT NULL,
  p_reason     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row       public.k24_material_transactions%ROWTYPE;
  v_uid       uuid := auth.uid();
  v_today     date := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_supplier  text := NULLIF(btrim(p_supplier), '');
  v_doc       text := NULLIF(btrim(p_doc_number), '');
  v_reason    text := NULLIF(btrim(p_reason), '');
BEGIN
  IF v_uid IS NULL OR NOT public.k24_user_can('warehouse:edit_operation') THEN
    RAISE EXCEPTION 'Нет права уточнять операции склада' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.k24_material_transactions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Операция не найдена' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.is_auto THEN
    RAISE EXCEPTION 'Автоматическую операцию уточнить нельзя' USING ERRCODE = '22023';
  END IF;
  IF p_op_date IS NULL OR p_op_date > v_today THEN
    RAISE EXCEPTION 'Дата операции не может быть пустой или позже сегодняшней' USING ERRCODE = '22023';
  END IF;
  IF p_kind IS NULL
     OR p_kind = 'order_consumption'
     OR (v_row.delta > 0 AND p_kind NOT IN ('purchase', 'opening', 'inventory', 'correction'))
     OR (v_row.delta < 0 AND p_kind NOT IN ('manual_consumption', 'opening', 'inventory', 'correction'))
     OR (v_row.delta = 0 AND p_kind NOT IN ('inventory', 'correction'))
  THEN
    RAISE EXCEPTION 'Вид операции не подходит к знаку количества' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.k24_material_transaction_audit (transaction_id, field_name, old_value, new_value, changed_by)
  SELECT p_id, x.f, x.o, x.n, v_uid
    FROM (VALUES
      ('op_date',    v_row.op_date::text, p_op_date::text),
      ('kind',       v_row.kind,          p_kind),
      ('supplier',   v_row.supplier,      v_supplier),
      ('doc_number', v_row.doc_number,    v_doc),
      ('reason',     v_row.reason,        v_reason)
    ) AS x(f, o, n)
   WHERE x.o IS DISTINCT FROM x.n;

  UPDATE public.k24_material_transactions
     SET op_date      = p_op_date,
         kind         = p_kind,
         supplier     = v_supplier,
         doc_number   = v_doc,
         reason       = v_reason,
         needs_review = false,
         updated_by   = v_uid,
         updated_at   = now()
   WHERE id = p_id;
END
$$;
REVOKE ALL ON FUNCTION public.update_material_operation(uuid, date, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_material_operation(uuid, date, text, text, text, text) TO authenticated;

-- ===========================================================================
-- 9e. Приход / расход / начальный остаток — операция + остаток атомарно.
--     Раньше клиент делал INSERT + rpc(update_stock) двумя запросами, а откат
--     (DELETE) молча не срабатывал: у таблицы нет DELETE-политики.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.warehouse_add_operation(
  p_material_id uuid,
  p_delta       numeric,
  p_kind        text,
  p_reason      text    DEFAULT NULL,
  p_order_id    uuid    DEFAULT NULL,
  p_total_cost  numeric DEFAULT NULL,
  p_op_date     date    DEFAULT NULL,
  p_supplier    text    DEFAULT NULL,
  p_doc_number  text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_today  date := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_date   date := COALESCE(p_op_date, (now() AT TIME ZONE 'Europe/Moscow')::date);
  v_reason text := NULLIF(btrim(p_reason), '');
  v_cost   numeric;
  v_id     uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.k24_user_can('material:add_transaction') THEN
    RAISE EXCEPTION 'Нет прав на внесение прихода/расхода' USING ERRCODE = '42501';
  END IF;
  IF p_material_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.k24_materials WHERE id = p_material_id) THEN
    RAISE EXCEPTION 'Позиция склада не найдена' USING ERRCODE = 'P0002';
  END IF;
  IF p_delta IS NULL OR p_delta = 0 THEN
    RAISE EXCEPTION 'Количество должно быть ненулевым' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'purchase' AND p_delta < 0 THEN
    RAISE EXCEPTION 'Поступление должно быть положительным' USING ERRCODE = '22023';
  ELSIF p_kind = 'manual_consumption' AND p_delta > 0 THEN
    RAISE EXCEPTION 'Расход должен быть отрицательным' USING ERRCODE = '22023';
  ELSIF p_kind IS NULL OR p_kind NOT IN ('purchase', 'manual_consumption', 'opening') THEN
    RAISE EXCEPTION 'Недопустимый вид операции: %', p_kind USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'manual_consumption' AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Укажите, на что списано' USING ERRCODE = '22023';
  END IF;
  IF v_date > v_today THEN
    RAISE EXCEPTION 'Дата операции не может быть позже сегодняшней' USING ERRCODE = '22023';
  END IF;

  -- Сумма — только у поступления. Триггер recalc_material_wac (BEFORE INSERT)
  -- читает «старый» stock_qty — поэтому INSERT строго ДО обновления остатка.
  IF p_kind = 'purchase' AND p_total_cost IS NOT NULL THEN
    IF p_total_cost < 0 THEN
      RAISE EXCEPTION 'Сумма не может быть отрицательной' USING ERRCODE = '22023';
    END IF;
    v_cost := p_total_cost;
  END IF;

  INSERT INTO public.k24_material_transactions (
    material_id, delta, reason, order_id, created_by, total_cost,
    kind, is_auto, op_date, supplier, doc_number
  ) VALUES (
    p_material_id, p_delta,
    COALESCE(v_reason, CASE p_kind WHEN 'purchase' THEN 'Приход' WHEN 'opening' THEN 'Начальный остаток' END),
    p_order_id, v_uid, v_cost,
    p_kind, false, v_date,
    CASE WHEN p_kind = 'purchase' THEN NULLIF(btrim(p_supplier), '') END,
    CASE WHEN p_kind = 'purchase' THEN NULLIF(btrim(p_doc_number), '') END
  )
  RETURNING id INTO v_id;

  UPDATE public.k24_materials
     SET stock_qty = stock_qty + p_delta,
         updated_at = now()
   WHERE id = p_material_id;

  RETURN v_id;
END
$$;
REVOKE ALL ON FUNCTION public.warehouse_add_operation(uuid, numeric, text, text, uuid, numeric, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.warehouse_add_operation(uuid, numeric, text, text, uuid, numeric, date, text, text) TO authenticated;

-- ===========================================================================
-- 9f. Массовая инвентаризация — одна транзакция на всю пачку.
--     p_items = [{ "material_id": uuid, "fact": number }, …]
--     delta = fact − текущий остаток под блокировкой строки (не клиентский).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.warehouse_inventory(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_today   date := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_item    jsonb;
  v_mid     uuid;
  v_fact    numeric;
  v_stock   numeric;
  v_delta   numeric;
  v_updated int := 0;
  v_skipped int := 0;
BEGIN
  IF v_uid IS NULL OR NOT public.k24_user_can('material:add_transaction') THEN
    RAISE EXCEPTION 'Нет прав на инвентаризацию' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Ожидается массив позиций' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_mid := NULLIF(v_item->>'material_id', '')::uuid;
    v_fact := NULLIF(v_item->>'fact', '')::numeric;
    IF v_mid IS NULL OR v_fact IS NULL OR v_fact < 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    SELECT stock_qty INTO v_stock FROM public.k24_materials WHERE id = v_mid FOR UPDATE;
    IF NOT FOUND THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    v_delta := v_fact - COALESCE(v_stock, 0);
    IF abs(v_delta) < 0.0001 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    INSERT INTO public.k24_material_transactions (
      material_id, delta, reason, created_by, kind, is_auto, op_date
    ) VALUES (
      v_mid, v_delta, 'Инвентаризация', v_uid, 'inventory', false, v_today
    );
    UPDATE public.k24_materials
       SET stock_qty = stock_qty + v_delta, updated_at = now()
     WHERE id = v_mid;
    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object('updated', v_updated, 'skipped', v_skipped);
END
$$;
REVOKE ALL ON FUNCTION public.warehouse_inventory(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.warehouse_inventory(jsonb) TO authenticated;

-- ===========================================================================
-- 11a. deduct_materials_from_log — тело 092 ДОСЛОВНО, в 5 INSERT'ов добавлены
--      kind / is_auto / op_date. Знак записи −v_delta: < 0 — списание на заказ,
--      > 0 — возврат при правке/удалении записи учёта.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.deduct_materials_from_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id UUID := COALESCE(NEW.order_id, OLD.order_id);
  v_user UUID := COALESCE(NEW.worker_id, OLD.worker_id);
  v_track TEXT := COALESCE(NEW.track, OLD.track);
  v_film_bg TEXT;
  v_film_st TEXT;
  v_lam_type TEXT;
  v_order_type TEXT;
  v_film_bg_mid UUID;
  v_film_st_mid UUID;
  v_lam_mid UUID;
  v_film_code TEXT;
  v_target_film_mid UUID;
  v_material_id UUID;
  v_old_active BOOLEAN := (TG_OP IN ('UPDATE','DELETE')) AND (OLD.deleted_at IS NULL);
  v_new_active BOOLEAN := (TG_OP IN ('INSERT','UPDATE')) AND (NEW.deleted_at IS NULL);
  v_old_film NUMERIC := CASE WHEN v_old_active THEN COALESCE(OLD.film_meters, 0) ELSE 0 END;
  v_new_film NUMERIC := CASE WHEN v_new_active THEN COALESCE(NEW.film_meters, 0) ELSE 0 END;
  v_old_lam NUMERIC := CASE WHEN v_old_active THEN COALESCE(OLD.lamination_meters, 0) ELSE 0 END;
  v_new_lam NUMERIC := CASE WHEN v_new_active THEN COALESCE(NEW.lamination_meters, 0) ELSE 0 END;
  v_old_resin NUMERIC := CASE WHEN v_old_active THEN COALESCE(OLD.resin_grams, 0) ELSE 0 END;
  v_new_resin NUMERIC := CASE WHEN v_new_active THEN COALESCE(NEW.resin_grams, 0) ELSE 0 END;
  -- R24: упаковка — БОПП-пакеты (по packs_packaged) и коробки (по boxes_used).
  v_old_bag NUMERIC := CASE WHEN v_old_active THEN COALESCE(OLD.packs_packaged, 0) ELSE 0 END;
  v_new_bag NUMERIC := CASE WHEN v_new_active THEN COALESCE(NEW.packs_packaged, 0) ELSE 0 END;
  v_old_box NUMERIC := CASE WHEN v_old_active THEN COALESCE(OLD.boxes_used, 0) ELSE 0 END;
  v_new_box NUMERIC := CASE WHEN v_new_active THEN COALESCE(NEW.boxes_used, 0) ELSE 0 END;
  v_old_bag_mid UUID := CASE WHEN v_old_active THEN OLD.packaging_bag_material_id ELSE NULL END;
  v_new_bag_mid UUID := CASE WHEN v_new_active THEN NEW.packaging_bag_material_id ELSE NULL END;
  v_old_box_mid UUID := CASE WHEN v_old_active THEN OLD.box_material_id ELSE NULL END;
  v_new_box_mid UUID := CASE WHEN v_new_active THEN NEW.box_material_id ELSE NULL END;
  v_delta NUMERIC;
BEGIN
  SELECT
    film_type, film_type_stickers, lam_type, order_type,
    film_material_id, film_stickers_material_id, lam_material_id
    INTO
    v_film_bg, v_film_st, v_lam_type, v_order_type,
    v_film_bg_mid, v_film_st_mid, v_lam_mid
  FROM k24_orders WHERE id = v_order_id;

  IF v_track = 'stickers'
     AND v_order_type = 'stickerpack3D'
     AND v_film_st IS NULL
     AND v_film_st_mid IS NULL
     AND (v_new_film - v_old_film) <> 0
  THEN
    INSERT INTO k24_integration_log (direction, endpoint, status, error_message, payload, order_id)
    VALUES (
      'incoming',
      'deduct_materials_from_log',
      'warning',
      'film_type_stickers и film_stickers_material_id пусты — плёнка списана с film_type/film_material_id (фонов). Дозаполните в редакторе заказа.',
      jsonb_build_object(
        'log_id', COALESCE(NEW.id, OLD.id),
        'track', v_track,
        'film_type_bg', v_film_bg,
        'film_bg_mid', v_film_bg_mid,
        'meters_delta', (v_new_film - v_old_film)
      ),
      v_order_id
    );
  END IF;

  IF v_track = 'stickers' THEN
    v_target_film_mid := v_film_st_mid;
    v_film_code := COALESCE(v_film_st, v_film_bg);
    IF v_target_film_mid IS NULL AND v_film_st IS NULL THEN
      v_target_film_mid := v_film_bg_mid;
    END IF;
  ELSE
    v_target_film_mid := v_film_bg_mid;
    v_film_code := v_film_bg;
  END IF;

  v_delta := v_new_film - v_old_film;
  IF v_delta <> 0 THEN
    v_material_id := v_target_film_mid;
    IF v_material_id IS NULL AND v_film_code IS NOT NULL THEN
      SELECT id INTO v_material_id
      FROM k24_materials
      WHERE type = 'film' AND material_code = v_film_code
      LIMIT 1;
    END IF;
    IF v_material_id IS NULL THEN
      SELECT id INTO v_material_id FROM k24_materials WHERE type = 'film' ORDER BY name LIMIT 1;
    END IF;
    IF v_material_id IS NOT NULL THEN
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by, kind, is_auto, op_date)
      VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: плёнка', v_user,
              CASE WHEN v_delta > 0 THEN 'order_consumption' ELSE 'correction' END, true,
              (now() AT TIME ZONE 'Europe/Moscow')::date);
      UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_material_id;
    END IF;
  END IF;

  v_delta := v_new_lam - v_old_lam;
  IF v_delta <> 0 THEN
    v_material_id := v_lam_mid;
    IF v_material_id IS NULL AND v_lam_type IS NOT NULL THEN
      SELECT id INTO v_material_id
      FROM k24_materials
      WHERE type = 'lam_film' AND material_code = v_lam_type
      LIMIT 1;
    END IF;
    IF v_material_id IS NULL THEN
      SELECT id INTO v_material_id FROM k24_materials WHERE type = 'lam_film' ORDER BY name LIMIT 1;
    END IF;
    IF v_material_id IS NOT NULL THEN
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by, kind, is_auto, op_date)
      VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: ламинация', v_user,
              CASE WHEN v_delta > 0 THEN 'order_consumption' ELSE 'correction' END, true,
              (now() AT TIME ZONE 'Europe/Moscow')::date);
      UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_material_id;
    END IF;
  END IF;

  v_delta := v_new_resin - v_old_resin;
  IF v_delta <> 0 THEN
    SELECT id INTO v_material_id
    FROM k24_materials
    WHERE type = 'resin' AND material_code = 'resin'
    LIMIT 1;
    IF v_material_id IS NULL THEN
      SELECT id INTO v_material_id FROM k24_materials WHERE type = 'resin' AND unit = 'g' ORDER BY name LIMIT 1;
    END IF;
    IF v_material_id IS NOT NULL THEN
      INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by, kind, is_auto, op_date)
      VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: смола', v_user,
              CASE WHEN v_delta > 0 THEN 'order_consumption' ELSE 'correction' END, true,
              (now() AT TIME ZONE 'Europe/Moscow')::date);
      UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_material_id;
    END IF;
  END IF;

  -- R24: БОПП-пакеты — списываем по количеству упакованного (packs_packaged).
  -- Материал берём из NEW (или OLD при DELETE-реверсе). Дельта NEW−OLD.
  v_material_id := COALESCE(v_new_bag_mid, v_old_bag_mid);
  v_delta := v_new_bag - v_old_bag;
  IF v_material_id IS NOT NULL AND v_delta <> 0 THEN
    INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by, kind, is_auto, op_date)
    VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: БОПП-пакет', v_user,
            CASE WHEN v_delta > 0 THEN 'order_consumption' ELSE 'correction' END, true,
            (now() AT TIME ZONE 'Europe/Moscow')::date);
    UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_material_id;
  END IF;

  -- R24: коробки — списываем по введённому числу (boxes_used).
  v_material_id := COALESCE(v_new_box_mid, v_old_box_mid);
  v_delta := v_new_box - v_old_box;
  IF v_material_id IS NOT NULL AND v_delta <> 0 THEN
    INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by, kind, is_auto, op_date)
    VALUES (v_material_id, v_order_id, -v_delta, 'Списание по факту: коробка', v_user,
            CASE WHEN v_delta > 0 THEN 'order_consumption' ELSE 'correction' END, true,
            (now() AT TIME ZONE 'Europe/Moscow')::date);
    UPDATE k24_materials SET stock_qty = stock_qty - v_delta, updated_at = now() WHERE id = v_material_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ===========================================================================
-- 11b. delete_order_cascade — тело из прода (pg_get_functiondef 17.11) ДОСЛОВНО,
--      в INSERT возврата добавлены kind='correction', is_auto, op_date.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.delete_order_cascade(p_order_id uuid, p_caller uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_role TEXT;
  v_order_no INT;
  v_ink_record RECORD;
  v_stock NUMERIC;
BEGIN
  SELECT role INTO v_caller_role FROM k24_profiles WHERE id = p_caller;
  IF v_caller_role IS NULL THEN
    RETURN json_build_object('error', 'Не авторизован');
  END IF;
  IF v_caller_role <> 'admin' THEN
    RETURN json_build_object('error', 'Только администратор может удалять заказы');
  END IF;

  SELECT number INTO v_order_no FROM k24_orders WHERE id = p_order_id;
  IF v_order_no IS NULL THEN
    RETURN json_build_object('error', 'Заказ не найден');
  END IF;

  UPDATE k24_production_logs
  SET deleted_at = now()
  WHERE order_id = p_order_id AND deleted_at IS NULL;

  FOR v_ink_record IN
    SELECT t.material_id, SUM(t.delta) AS total_delta
    FROM k24_material_transactions t
    WHERE t.order_id = p_order_id
      AND t.reason IN ('Авто: печать заказа (краска)', 'Авто: печать заказа')
    GROUP BY t.material_id
  LOOP
    IF v_ink_record.total_delta IS NULL OR v_ink_record.total_delta = 0 THEN CONTINUE; END IF;
    SELECT stock_qty INTO v_stock FROM k24_materials WHERE id = v_ink_record.material_id FOR UPDATE;
    IF v_stock IS NULL THEN CONTINUE; END IF;
    INSERT INTO k24_material_transactions (material_id, order_id, delta, reason, created_by, kind, is_auto, op_date)
    VALUES (v_ink_record.material_id, NULL, -v_ink_record.total_delta,
            'Возврат при удалении заказа #' || v_order_no, p_caller,
            'correction', true, (now() AT TIME ZONE 'Europe/Moscow')::date);
    UPDATE k24_materials
    SET stock_qty = stock_qty - v_ink_record.total_delta, updated_at = now()
    WHERE id = v_ink_record.material_id;
  END LOOP;

  UPDATE k24_integration_log SET order_id = NULL WHERE order_id = p_order_id;
  UPDATE k24_material_transactions SET order_id = NULL WHERE order_id = p_order_id;

  DELETE FROM k24_orders WHERE id = p_order_id;

  RETURN json_build_object('success', true, 'order_no', v_order_no);
EXCEPTION
  WHEN foreign_key_violation THEN
    RETURN json_build_object('error', 'fk', 'detail', SQLERRM);
  WHEN OTHERS THEN
    RETURN json_build_object('error', 'other', 'detail', SQLERRM);
END;
$function$;

COMMIT;

-- ===========================================================================
-- Проверки после применения (выполнить вручную, READ-ONLY):
--
-- -- колонки и триггер на месте
-- SELECT column_name, is_nullable FROM information_schema.columns
--  WHERE table_name = 'k24_material_transactions'
--    AND column_name IN ('kind','op_date','supplier','doc_number','is_auto','needs_review','updated_by','updated_at');
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'k24_material_transactions'::regclass AND NOT tgisinternal;
--   -- ожидаем: trg_material_tx_defaults, trg_recalc_material_wac
--
-- -- классификатор = таблица 8.3
-- SELECT * FROM k24_classify_material_tx('Списание по факту: плёнка', -1);  -- order_consumption, t, f
-- SELECT * FROM k24_classify_material_tx('Списание по факту: плёнка', 1);   -- correction, t, f
-- SELECT * FROM k24_classify_material_tx('Возврат: смена коробки', 1);      -- correction, t, f
-- SELECT * FROM k24_classify_material_tx('Инвентаризация', -3);             -- inventory, f, f
-- SELECT * FROM k24_classify_material_tx('закупка', 5);                     -- purchase, f, t
-- SELECT * FROM k24_classify_material_tx('забрал ярослав', -1);             -- manual_consumption, f, t
--
-- -- право засеяно
-- SELECT role, allowed FROM k24_role_permissions WHERE permission = 'warehouse:edit_operation';
--
-- -- view отдаёт «остаток после» = stock_qty у самой свежей строки (после 097 — у всех позиций)
-- SELECT material_id, balance_after, (SELECT stock_qty FROM k24_materials m WHERE m.id = v.material_id)
--   FROM (SELECT DISTINCT ON (material_id) * FROM k24_material_movements
--          ORDER BY material_id, op_date DESC, created_at DESC NULLS LAST, id DESC) v
--  WHERE balance_after <> (SELECT stock_qty FROM k24_materials m WHERE m.id = v.material_id);  -- 0 строк
--
-- -- anon не видит view/функции
-- SELECT grantee, privilege_type FROM information_schema.table_privileges
--  WHERE table_name IN ('k24_material_movements','k24_materials_full') AND grantee IN ('anon','PUBLIC');  -- 0 строк
-- ===========================================================================
