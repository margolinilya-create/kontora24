-- 110_replace_order_items — R27.0 (ТЗ 19.11, №5 «Доп. виды»)
--
-- Причина ошибки «нет прав» при создании заказа с несколькими видами:
-- replaceOrderItems (useOrderItems.js) после записи видов писал напрямую в
-- k24_order_subtasks (track='variant'), а 032_order_subtasks.sql:171 отзывает у
-- authenticated INSERT/UPDATE/DELETE на эту таблицу. Плюс DELETE+INSERT видов
-- с клиента шёл тремя запросами без транзакции.
--
-- Теперь состав видов меняется одной RPC в одной транзакции:
--   replace_order_items(p_order_id, p_items, p_expected_count)
--
-- Права: order:edit ИЛИ (order:create И заказ создан этим пользователем И
-- status='new'). Завершённые / отменённые заказы не меняются.
-- ⚠️ UPDATE k24_orders.qty/width/height проходит через триггер
-- k24_protect_order_columns: для ролей кроме admin/manager он отклонит смену
-- тиража/размера (как и при прямой правке заказа) — это согласовано.
--
-- Защита от гонок: SELECT … FOR UPDATE строки заказа (блокирует и вставку
-- логов через FK) + оптимистичная проверка p_expected_count = текущему числу
-- видов («Повторить» после потерянного ответа не задвоит виды).
--
-- p_items — массив 1..9 объектов:
--   { width_mm: number|null, height_mm: number|null, qty: int, src_idx?: int|null }
--   width/height null → общий размер заказа (если и он не задан — ошибка).
--   src_idx — исходный номер вида (для «убрать вид из середины»):
--     ключ отсутствует → позиционно (элемент i = вид i, если такой был);
--     null → новый вид.
--
-- Без перенумерации учёта (данные сотрудников не трогаем): k24_production_logs
-- .item_idx и k24_order_subtasks.view_ref ссылаются на номер вида. Вид можно
-- убрать, только если ни у него, ни у видов, номера которых сдвигаются, нет
-- учёта (логов, в т.ч. soft-deleted, и допечаток не-stickerpack3D с view_ref;
-- у stickerpack3D view_ref — номер дизайна в паке, а не вид изделия).
--
-- Тираж заказа = Σ тиражей видов пишется ТОЛЬКО при этом вызове: старые
-- заказы (у 45 из 64 мультивидовых тираж = тираж 1-го вида) не меняются, пока
-- их виды не правят. Изменения qty/width/height логирует log_order_changes;
-- сам состав видов — одна строка k24_order_audit(field_name='items').

BEGIN;

CREATE OR REPLACE FUNCTION public.replace_order_items(
  p_order_id       uuid,
  p_items          jsonb,
  p_expected_count int
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid         uuid := auth.uid();
  v_order       record;
  v_cur_count   int;
  v_n           int;
  v_i           int;
  v_el          jsonb;
  v_w           numeric;
  v_h           numeric;
  v_q           bigint;
  v_src         int;
  v_total       bigint := 0;
  v_first_w     numeric;
  v_first_h     numeric;
  v_first_own   boolean := false;
  v_new_ws      numeric[] := ARRAY[]::numeric[];
  v_new_hs      numeric[] := ARRAY[]::numeric[];
  v_new_qs      bigint[]  := ARRAY[]::bigint[];
  v_new_src     int[]     := ARRAY[]::int[];
  v_used        int[]     := ARRAY[]::int[];
  v_acc         int[];
  v_a           int;
  v_removed_min int;
  v_old_text    text;
  v_new_text    text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Сессия не активна. Войдите заново.';
  END IF;

  SELECT id, status, created_by, width_mm, height_mm, qty, order_type
    INTO v_order
    FROM k24_orders
   WHERE id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Заказ не найден.';
  END IF;

  IF NOT (
    k24_user_can('order:edit')
    OR (k24_user_can('order:create')
        AND v_order.created_by = v_uid
        AND v_order.status = 'new')
  ) THEN
    RAISE EXCEPTION 'Нет прав на изменение видов заказа.';
  END IF;

  IF v_order.status IN ('done', 'cancelled') THEN
    RAISE EXCEPTION 'Заказ завершён или отменён — виды не меняются.';
  END IF;

  -- ── Оптимистичная проверка ──────────────────────────────────────────────
  SELECT count(*) INTO v_cur_count FROM k24_order_items WHERE order_id = p_order_id;
  IF p_expected_count IS NULL OR p_expected_count <> v_cur_count THEN
    RAISE EXCEPTION 'Виды заказа изменились, обновите страницу.';
  END IF;

  -- ── Валидация ───────────────────────────────────────────────────────────
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Неверный формат видов.';
  END IF;
  v_n := jsonb_array_length(p_items);
  IF v_n < 1 OR v_n > 9 THEN
    RAISE EXCEPTION 'Видов должно быть от 1 до 9.';
  END IF;

  FOR v_i IN 1..v_n LOOP
    v_el := p_items -> (v_i - 1);
    IF jsonb_typeof(v_el) <> 'object' THEN
      RAISE EXCEPTION 'Неверный формат вида %.', v_i;
    END IF;

    -- тираж
    IF COALESCE(jsonb_typeof(v_el -> 'qty'), 'null') NOT IN ('number', 'string') THEN
      RAISE EXCEPTION 'Укажите тираж вида %.', v_i;
    END IF;
    BEGIN
      v_q := (v_el ->> 'qty')::numeric;
      IF (v_el ->> 'qty')::numeric <> v_q THEN
        RAISE EXCEPTION 'Тираж вида % должен быть целым числом.', v_i;
      END IF;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Тираж вида % должен быть числом.', v_i;
    END;
    IF v_q < 1 OR v_q > 10000000 THEN
      RAISE EXCEPTION 'Тираж вида % должен быть от 1 до 10 000 000.', v_i;
    END IF;

    -- размер (null → общий размер заказа)
    BEGIN
      v_w := NULLIF(v_el ->> 'width_mm', '')::numeric;
      v_h := NULLIF(v_el ->> 'height_mm', '')::numeric;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Размер вида % должен быть числом.', v_i;
    END;
    IF v_i = 1 AND v_w IS NOT NULL AND v_h IS NOT NULL THEN
      v_first_own := true;
    END IF;
    v_w := COALESCE(v_w, v_order.width_mm);
    v_h := COALESCE(v_h, v_order.height_mm);
    IF v_w IS NULL OR v_h IS NULL THEN
      RAISE EXCEPTION 'Укажите размер вида % (у заказа нет общего размера).', v_i;
    END IF;
    IF v_w < 1 OR v_w > 100000 OR v_h < 1 OR v_h > 100000 THEN
      RAISE EXCEPTION 'Размер вида % должен быть от 1 до 100 000 мм.', v_i;
    END IF;

    -- исходный номер вида
    IF v_el ? 'src_idx' THEN
      BEGIN
        v_src := NULLIF(v_el ->> 'src_idx', '')::int;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Неверный номер исходного вида %.', v_i;
      END;
      IF v_src IS NOT NULL AND (v_src < 1 OR v_src > v_cur_count OR v_src = ANY (v_used)) THEN
        RAISE EXCEPTION 'Неверный номер исходного вида %.', v_i;
      END IF;
    ELSE
      v_src := CASE WHEN v_i <= v_cur_count AND NOT (v_i = ANY (v_used)) THEN v_i ELSE NULL END;
    END IF;
    IF v_src IS NOT NULL THEN
      v_used := array_append(v_used, v_src);
    END IF;

    v_new_ws  := array_append(v_new_ws, v_w);
    v_new_hs  := array_append(v_new_hs, v_h);
    v_new_qs  := array_append(v_new_qs, v_q);
    v_new_src := array_append(v_new_src, v_src);
    v_total   := v_total + v_q;
    IF v_i = 1 THEN
      v_first_w := v_w;
      v_first_h := v_h;
    END IF;
  END LOOP;

  IF v_total > 2147483647 THEN
    RAISE EXCEPTION 'Слишком большой общий тираж.';
  END IF;

  -- ── Учёт работы по видам: номера не перенумеровываются ──────────────────
  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_acc FROM (
    SELECT item_idx AS x
      FROM k24_production_logs
     WHERE order_id = p_order_id AND item_idx IS NOT NULL      -- включая soft-deleted
    UNION
    SELECT view_ref
      FROM k24_order_subtasks
     WHERE order_id = p_order_id
       AND track = 'reprint'
       AND view_ref IS NOT NULL
       AND v_order.order_type IS DISTINCT FROM 'stickerpack3D'
  ) s;

  IF v_acc IS NOT NULL THEN
    -- первый убираемый вид (для текста ошибки)
    SELECT min(k) INTO v_removed_min
      FROM generate_series(1, v_cur_count) k
     WHERE NOT (k = ANY (v_used));

    FOREACH v_a IN ARRAY v_acc LOOP
      -- учёт по номеру, которого нет среди текущих видов (старые данные) —
      -- к этой правке не относится
      CONTINUE WHEN v_a > v_cur_count;
      -- убирают сам вид с учётом
      IF NOT (v_a = ANY (v_used)) THEN
        RAISE EXCEPTION 'По виду % есть учёт работы — его нельзя убрать.', v_a;
      END IF;
      -- вид с учётом сохраняется, но его номер сдвигается
      -- (или на его место встаёт другой / новый вид)
      IF v_a > v_n OR v_new_src[v_a] IS DISTINCT FROM v_a THEN
        IF v_removed_min IS NOT NULL THEN
          RAISE EXCEPTION 'Нельзя убрать вид %: по виду % есть учёт работы — сначала уберите последние виды.', v_removed_min, v_a;
        END IF;
        RAISE EXCEPTION 'По виду % есть учёт работы — его номер нельзя менять.', v_a;
      END IF;
    END LOOP;
  END IF;

  -- ── Текст аудита «до» ───────────────────────────────────────────────────
  SELECT CASE WHEN count(*) = 0 THEN 'нет видов' ELSE
           count(*) || ' ' ||
           CASE WHEN count(*) % 10 = 1 AND count(*) % 100 <> 11 THEN 'вид'
                WHEN count(*) % 10 BETWEEN 2 AND 4 AND count(*) % 100 NOT BETWEEN 12 AND 14 THEN 'вида'
                ELSE 'видов' END
           || ', ' || COALESCE(sum(qty), 0) || ' шт ('
           || string_agg(trim_scale(width_mm)::text || '×' || trim_scale(height_mm)::text || ' мм — ' || qty, '; ' ORDER BY idx)
           || ')'
         END
    INTO v_old_text
    FROM k24_order_items WHERE order_id = p_order_id;

  -- ── Запись: id и created_at видов сохраняются ───────────────────────────
  FOR v_i IN 1..v_n LOOP
    INSERT INTO k24_order_items (order_id, idx, width_mm, height_mm, qty)
    VALUES (p_order_id, v_i, v_new_ws[v_i], v_new_hs[v_i], v_new_qs[v_i])
    ON CONFLICT (order_id, idx) DO UPDATE
       SET width_mm  = EXCLUDED.width_mm,
           height_mm = EXCLUDED.height_mm,
           qty       = EXCLUDED.qty
     WHERE (k24_order_items.width_mm, k24_order_items.height_mm, k24_order_items.qty)
           IS DISTINCT FROM (EXCLUDED.width_mm, EXCLUDED.height_mm, EXCLUDED.qty);
  END LOOP;
  DELETE FROM k24_order_items WHERE order_id = p_order_id AND idx > v_n;

  -- Защитный шаг: подзадачи track='variant' больше не используются (R27.0).
  DELETE FROM k24_order_subtasks WHERE order_id = p_order_id AND track = 'variant';

  -- ── Тираж и размер заказа ───────────────────────────────────────────────
  UPDATE k24_orders
     SET qty       = v_total::int,
         width_mm  = CASE WHEN v_first_own THEN v_first_w ELSE width_mm END,
         height_mm = CASE WHEN v_first_own THEN v_first_h ELSE height_mm END
   WHERE id = p_order_id
     AND (qty IS DISTINCT FROM v_total::int
          OR (v_first_own AND (width_mm IS DISTINCT FROM v_first_w
                               OR height_mm IS DISTINCT FROM v_first_h)));

  -- ── Аудит состава ───────────────────────────────────────────────────────
  SELECT count(*) || ' ' ||
         CASE WHEN count(*) % 10 = 1 AND count(*) % 100 <> 11 THEN 'вид'
              WHEN count(*) % 10 BETWEEN 2 AND 4 AND count(*) % 100 NOT BETWEEN 12 AND 14 THEN 'вида'
              ELSE 'видов' END
         || ', ' || COALESCE(sum(qty), 0) || ' шт ('
         || string_agg(trim_scale(width_mm)::text || '×' || trim_scale(height_mm)::text || ' мм — ' || qty, '; ' ORDER BY idx)
         || ')'
    INTO v_new_text
    FROM k24_order_items WHERE order_id = p_order_id;

  IF v_old_text IS DISTINCT FROM v_new_text THEN
    INSERT INTO k24_order_audit (order_id, field_name, old_value, new_value, changed_by)
    VALUES (p_order_id, 'items', v_old_text, v_new_text, v_uid);
  END IF;

  RETURN jsonb_build_object('ok', true, 'count', v_n, 'qty', v_total);
END;
$function$;

COMMENT ON FUNCTION public.replace_order_items(uuid, jsonb, int) IS
  'R27.0: атомарная замена видов заказа (k24_order_items). Права order:edit или автор нового заказа с order:create. p_expected_count — оптимистичная проверка. Виды с учётом работы не убираются и не перенумеровываются.';

REVOKE ALL ON FUNCTION public.replace_order_items(uuid, jsonb, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_order_items(uuid, jsonb, int) TO authenticated;

COMMIT;
