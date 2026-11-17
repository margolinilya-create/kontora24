-- 097 (R25.8, ТЗ 8.3) — перенос истории склада в новые поля.
--
-- Prereq: 096. Количество, причина, время и автор существующих операций НЕ
-- меняются. Остатки (stock_qty) и средние цены (unit_cost) НЕ меняются —
-- миграция сама сверяет снимок «до/после» и откатывается при расхождении.
--
-- Шаги:
--   1. kind / is_auto / needs_review — по классификатору 096 (таблица 8.3):
--      «Списание по факту…»/«Авто:» с delta<0 → order_consumption (авто),
--      с delta>0 → correction (авто); «Возврат…» → correction (авто);
--      «Инвентаризация» → inventory; прочие delta>0 → purchase, delta<0 →
--      manual_consumption. Свободный текст причины (не «Приход»/«Расход»/
--      системные) → needs_review = true (на 17.11 — 46 записей).
--   2. op_date = дата внесения по Москве. Даты из текста причины не парсятся.
--   3. «Начальный остаток» на разницу stock_qty − Σ операций для позиций, где
--      они не сходятся (на 17.11 — 29 из 99, в т.ч. позиции без операций).
--      Дата — день перед первой операцией позиции, у позиций без операций —
--      дата применения миграции. Строка без total_cost → WAC-триггер её
--      пропускает, unit_cost не меняется. Остаток не трогаем (UPDATE stock_qty
--      нет) — строка лишь объясняет уже существующий остаток.
--      Отрицательная разница → needs_review (фильтр «Проверить после переноса»).
--   4. kind / op_date → NOT NULL (+ DEFAULT op_date на случай прямых INSERT'ов
--      в обход триггера не бывает, но DEFAULT дешёвый).
--
-- Идемпотентна: повторный запуск ничего не меняет (шаг 1–2 только для NULL,
-- шаг 3 после первого прогона даёт нулевые разницы).

BEGIN;

-- Блокировка от параллельных списаний между снимком и самопроверкой (ревью 096–098).
LOCK TABLE public.k24_materials, public.k24_material_transactions IN SHARE ROW EXCLUSIVE MODE;

-- Снимок остатков и средних цен ДО переноса.
CREATE TEMP TABLE _r25_8_before ON COMMIT DROP AS
SELECT id, stock_qty, unit_cost FROM public.k24_materials;

-- 1. Вид операции, авто, пометка проверки.
UPDATE public.k24_material_transactions t
   SET (kind, is_auto, needs_review) = (
         SELECT c.o_kind, c.o_is_auto, c.o_needs_review
           FROM public.k24_classify_material_tx(t.reason, t.delta) c
       )
 WHERE t.kind IS NULL;

-- 2. Дата операции = дата внесения по Москве.
UPDATE public.k24_material_transactions t
   SET op_date = (COALESCE(t.created_at, now()) AT TIME ZONE 'Europe/Moscow')::date
 WHERE t.op_date IS NULL;

-- 3. Начальный остаток на разницу.
INSERT INTO public.k24_material_transactions (
  material_id, delta, reason, created_by, created_at, reservation_status,
  total_cost, kind, is_auto, needs_review, op_date
)
SELECT
  s.id,
  s.stock_qty - s.ops_sum,
  'Начальный остаток (перенос истории)',
  NULL,
  now(),
  'consumed',
  NULL,                 -- без суммы: WAC-триггер пропускает, unit_cost не меняется
  'opening',
  false,
  (s.stock_qty - s.ops_sum) < 0,
  COALESCE(s.first_date - 1, (now() AT TIME ZONE 'Europe/Moscow')::date)
FROM (
  SELECT
    m.id,
    m.stock_qty,
    COALESCE(sum(t.delta) FILTER (WHERE COALESCE(t.reservation_status, 'consumed') = 'consumed'), 0) AS ops_sum,
    min(t.op_date) AS first_date
  FROM public.k24_materials m
  LEFT JOIN public.k24_material_transactions t ON t.material_id = m.id
  GROUP BY m.id, m.stock_qty
) s
WHERE s.stock_qty - s.ops_sum <> 0;

-- 4. NOT NULL.
ALTER TABLE public.k24_material_transactions
  ALTER COLUMN kind SET NOT NULL,
  ALTER COLUMN op_date SET NOT NULL,
  ALTER COLUMN op_date SET DEFAULT ((now() AT TIME ZONE 'Europe/Moscow')::date);

-- Самопроверка: остатки и средние цены не изменились, Σ операций = остаток.
DO $$
DECLARE
  v_changed  int;
  v_mismatch int;
BEGIN
  SELECT count(*) INTO v_changed
    FROM public.k24_materials m
    JOIN _r25_8_before b ON b.id = m.id
   WHERE m.stock_qty IS DISTINCT FROM b.stock_qty
      OR m.unit_cost IS DISTINCT FROM b.unit_cost;
  IF v_changed > 0 THEN
    RAISE EXCEPTION 'R25.8/097: изменились остатки или средние цены у % позиций — откат', v_changed;
  END IF;

  SELECT count(*) INTO v_mismatch
    FROM (
      SELECT m.id
        FROM public.k24_materials m
        LEFT JOIN public.k24_material_transactions t
          ON t.material_id = m.id AND COALESCE(t.reservation_status, 'consumed') = 'consumed'
       GROUP BY m.id, m.stock_qty
      HAVING m.stock_qty <> COALESCE(sum(t.delta), 0)
    ) x;
  IF v_mismatch > 0 THEN
    RAISE EXCEPTION 'R25.8/097: у % позиций Σ операций ≠ остатку — откат', v_mismatch;
  END IF;
END
$$;

COMMIT;

-- ===========================================================================
-- Проверки после применения (READ-ONLY):
--
-- SELECT kind, is_auto, count(*) FROM k24_material_transactions GROUP BY 1, 2 ORDER BY 1, 2;
--   -- прогон классификатора по проду 17.11 (1 288 строк): order_consumption/t 940,
--   -- correction/t 71, inventory/f 122, purchase/f 73, manual_consumption/f 82,
--   -- + opening/f 29 (новые строки); needs_review 46 (+ отриц. начальные остатки)
-- SELECT count(*) FROM k24_material_transactions WHERE kind IS NULL OR op_date IS NULL;  -- 0
-- -- Σ операций = остаток у всех позиций:
-- SELECT m.name, m.stock_qty, sum(t.delta) FROM k24_materials m
--   LEFT JOIN k24_material_transactions t ON t.material_id = m.id
--  GROUP BY m.id HAVING m.stock_qty <> COALESCE(sum(t.delta), 0);   -- 0 строк
-- -- «Остаток после» самой старой операции = её delta (остаток до = 0):
-- SELECT count(*) FROM (SELECT DISTINCT ON (material_id) * FROM k24_material_movements
--   ORDER BY material_id, op_date, created_at NULLS FIRST, id) v WHERE balance_after <> delta;  -- 0
-- ===========================================================================
