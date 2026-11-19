-- R27.2 (ТЗ «доработки 19.11», 4.3–4.4): бумага и NFC-метка — данные.
-- Применять ПОСЛЕ деплоя фронта R27.2 (и после 111a): старый фронт показал
-- бы бумагу в калькуляторе без автоцены и NFC в заказе без тумблера.
--
-- Все UPDATE условные (не перетирают то, что администратор уже настроил),
-- каждый проверяет, что затронута ровно та позиция/категория, что ожидалась:
-- при count <> 1 — RAISE и откат всей миграции.
--   1. Категория «Бумага в рулонах»: show_in_order, order_field='print',
--      consume_stage='print', count_in_costs — только WHERE show_in_order=false.
--   2. Бумага Ситилайт: roll_width_m=1.27 (если не задана), unit='м'
--      (кириллица; калькулятор понимает и латинскую «m»), calc_display_name
--      «Бумага Ситилайт 200 г» (если не задано).
--   3. k24_settings['calculator'].nfc_material_id = «NFC-метки (NTAG216)» —
--      только если ключ ещё не задан. Через jsonb_set: триггер истории
--      калькулятора запишет новую версию настроек.
--   4. «Комплектующие» (одна активная позиция — NFC): show_in_order,
--      order_field='extra', norm_per_item=1, count_in_costs,
--      consume_stage='packaging'.
--      Отчёты прошлых периодов: стоимость доп. материалов берётся из
--      k24_material_transactions.in_order_costs, проставленного В МОМЕНТ
--      списания (105, deduct_materials_from_log) — флаг категории на старые
--      операции не влияет. Перед применением сверить:
--        SELECT count(*) FROM k24_material_transactions t
--          JOIN k24_materials m ON m.id = t.material_id
--          JOIN k24_warehouse_categories c ON c.id = m.category_id
--         WHERE c.name = 'Комплектующие' AND t.order_id IS NOT NULL;
--      (ожидаем 0 — списаний NFC по заказам ещё не было).
--
-- Имена позиций сверены с базой 19.11 (только чтение). Если позицию
-- переименовали — миграция упадёт с понятным сообщением, ничего не изменив.

BEGIN;

DO $$
DECLARE
  v_paper_cat uuid;
  v_kit_cat   uuid;
  v_paper     uuid;
  v_nfc       uuid;
  v_n         int;
BEGIN
  -- ── Позиции и категории ─────────────────────────────────────────────────
  SELECT id INTO v_paper_cat FROM k24_warehouse_categories WHERE name = 'Бумага в рулонах';
  IF v_paper_cat IS NULL THEN
    RAISE EXCEPTION '111b: категория «Бумага в рулонах» не найдена';
  END IF;
  SELECT id INTO v_kit_cat FROM k24_warehouse_categories WHERE name = 'Комплектующие';
  IF v_kit_cat IS NULL THEN
    RAISE EXCEPTION '111b: категория «Комплектующие» не найдена';
  END IF;

  SELECT count(*) INTO v_n FROM k24_materials
   WHERE name ILIKE '%Ситилайт%' AND archived_at IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '111b: ожидалась одна активная позиция «Ситилайт», найдено %', v_n;
  END IF;
  SELECT id INTO v_paper FROM k24_materials WHERE name ILIKE '%Ситилайт%' AND archived_at IS NULL;

  SELECT count(*) INTO v_n FROM k24_materials
   WHERE category_id = v_kit_cat AND archived_at IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '111b: в «Комплектующих» ожидалась одна активная позиция (NFC), найдено %', v_n;
  END IF;
  SELECT id INTO v_nfc FROM k24_materials
   WHERE category_id = v_kit_cat AND archived_at IS NULL AND name ILIKE '%NFC%';
  IF v_nfc IS NULL THEN
    RAISE EXCEPTION '111b: позиция NFC-меток в «Комплектующих» не найдена';
  END IF;

  -- ── 1. Категория бумаги → материал печати ───────────────────────────────
  UPDATE k24_warehouse_categories
     SET show_in_order = true,
         order_field = 'print',
         consume_stage = 'print',
         count_in_costs = true
   WHERE id = v_paper_cat
     AND show_in_order = false;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 1 THEN
    RAISE EXCEPTION '111b: категория бумаги — затронуто % строк', v_n;
  END IF;
  RAISE NOTICE '111b: категория «Бумага в рулонах» — обновлено %', v_n;

  -- ── 2. Бумага Ситилайт ──────────────────────────────────────────────────
  UPDATE k24_materials SET roll_width_m = 1.27, updated_at = now()
   WHERE id = v_paper AND roll_width_m IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE '111b: ширина рулона бумаги — обновлено %', v_n;

  UPDATE k24_materials SET unit = 'м', updated_at = now()
   WHERE id = v_paper AND unit IS DISTINCT FROM 'м';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE '111b: единица бумаги — обновлено %', v_n;

  UPDATE k24_materials SET calc_display_name = 'Бумага Ситилайт 200 г'
   WHERE id = v_paper AND calc_display_name IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE '111b: «Название в расчёте» бумаги — обновлено %', v_n;

  -- ── 3. NFC-метка по умолчанию в настройках калькулятора ─────────────────
  UPDATE k24_settings
     SET value = jsonb_set(value, '{nfc_material_id}', to_jsonb(v_nfc::text), true),
         updated_at = now()
   WHERE key = 'calculator'
     AND NULLIF(btrim(value->>'nfc_material_id'), '') IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 1 THEN
    RAISE EXCEPTION '111b: настройки калькулятора — затронуто % строк', v_n;
  END IF;
  RAISE NOTICE '111b: nfc_material_id — обновлено %', v_n;

  -- ── 4. «Комплектующие» → доп. материал заказа, списание на упаковке ─────
  UPDATE k24_warehouse_categories
     SET show_in_order = true,
         order_field = 'extra',
         norm_per_item = 1,
         count_in_costs = true,
         consume_stage = 'packaging'
   WHERE id = v_kit_cat
     AND show_in_order = false;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 1 THEN
    RAISE EXCEPTION '111b: категория «Комплектующие» — затронуто % строк', v_n;
  END IF;
  RAISE NOTICE '111b: категория «Комплектующие» — обновлено %', v_n;
END
$$;

COMMIT;

-- Проверка после применения:
--   SELECT name, show_in_order, order_field, consume_stage, norm_per_item, count_in_costs
--     FROM k24_warehouse_categories WHERE name IN ('Бумага в рулонах', 'Комплектующие');
--   SELECT name, unit, roll_width_m, calc_display_name FROM k24_materials WHERE name ILIKE '%Ситилайт%';
--   SELECT value->>'nfc_material_id' FROM k24_settings WHERE key = 'calculator';
--   -- под менеджером: бумага с price_cm2_raw ≈ 0,0146, NFC с nfc_unit_price 6,82
--   SELECT * FROM calc_material_prices();
