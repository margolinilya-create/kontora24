-- R27.2 (ТЗ «доработки 19.11», №4): «Материал» в калькуляторе — автоцена
-- по складу и NFC-метка. Применять ДО деплоя фронта R27.2 (фронт вызывает
-- calc_material_prices; без функции калькулятор работает только по группам).
--
-- Только функции, идемпотентно (CREATE OR REPLACE), данных не меняет:
--   1. RPC calc_material_prices() — цена 1 см² материалов печати по складу
--      (без коэффициента K — он в настройках калькулятора и применяется на
--      фронте) + цена одной NFC-метки (позиция settings.calculator.nfc_material_id).
--      ВНИМАНИЕ: из price_cm2_raw и roll_width_m выводится unit_cost позиции.
--      Допустимо, пока калькулятор (view:calculator) есть только у admin и
--      manager — у обоих есть view:finance. Если выдать калькулятор роли без
--      финансов, она увидит закупочные цены материалов печати и NFC через
--      эту функцию. В интерфейсе ₽/см² показывается только с view:finance.
--   2. calc_save_settings — сигнатура прежняя (jsonb, jsonb):
--      • группа / «Название в расчёте» — для любой позиции материалов печати
--        (категории с order_field='print' или служебный type='film');
--      • display_name пишется только если ключ передан (group — аналогично);
--      • сервер проверяет material_k (0,5–5) и nfc_material_id (существующая
--        позиция склада).
--   3. k24_calc_settings_history_write — в снимок материалов попадают и
--      позиции с calc_display_name без группы (без цен, как раньше).
--
-- Rollback: пересоздать calc_save_settings и k24_calc_settings_history_write
-- из 100; DROP FUNCTION public.calc_material_prices().

BEGIN;

-- ===========================================================================
-- 1. RPC calc_material_prices
-- ===========================================================================
-- Единица «м» (кириллица) / «m» (латиница) — погонный метр рулона:
--   price_cm2_raw = unit_cost / (roll_width_m · 10 000)
-- «м²» / «м2» / «m²» / «m2»:
--   price_cm2_raw = unit_cost / 10 000
-- Иначе, при unit_cost ≤ 0 / NULL или без ширины рулона — NULL (нет автоцены;
-- причину фронт выводит по unit / roll_width_m).
CREATE OR REPLACE FUNCTION public.calc_material_prices()
RETURNS TABLE (
  id             uuid,
  unit           text,
  roll_width_m   numeric,
  price_cm2_raw  numeric,
  nfc_unit_price numeric,
  is_nfc         boolean,
  archived       boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nfc_txt text;
  v_nfc     uuid;
BEGIN
  IF NOT (public.k24_user_can('view:calculator') OR public.k24_user_can('calc:settings')) THEN
    RAISE EXCEPTION 'Нет доступа к калькулятору' USING ERRCODE = '42501';
  END IF;

  SELECT NULLIF(btrim(s.value->>'nfc_material_id'), '')
    INTO v_nfc_txt
    FROM k24_settings s
   WHERE s.key = 'calculator';
  IF v_nfc_txt ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_nfc := v_nfc_txt::uuid;
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.unit,
    m.roll_width_m,
    CASE
      WHEN m.unit_cost IS NULL OR m.unit_cost <= 0 THEN NULL
      WHEN lower(btrim(m.unit)) IN ('м', 'm')
        THEN m.unit_cost / (NULLIF(m.roll_width_m, 0) * 10000)
      WHEN lower(btrim(m.unit)) IN ('м²', 'м2', 'm²', 'm2')
        THEN m.unit_cost / 10000
      ELSE NULL
    END::numeric,
    NULL::numeric,
    false,
    false
  FROM k24_materials m
  LEFT JOIN k24_warehouse_categories c ON c.id = m.category_id
  WHERE m.archived_at IS NULL
    AND (
      (c.show_in_order AND c.order_field = 'print')
      OR (m.category_id IS NULL AND m.type = 'film')
    )
  UNION ALL
  SELECT
    m.id,
    m.unit,
    m.roll_width_m,
    NULL::numeric,
    CASE WHEN m.archived_at IS NULL AND m.unit_cost > 0 THEN m.unit_cost END::numeric,
    true,
    m.archived_at IS NOT NULL
  FROM k24_materials m
  WHERE v_nfc IS NOT NULL
    AND m.id = v_nfc;
END;
$$;

COMMENT ON FUNCTION public.calc_material_prices() IS
  'R27.2: ₽/см² материалов печати по складу (без K) и цена NFC-метки для калькулятора. Выводит unit_cost — только для ролей с калькулятором (admin/manager).';

REVOKE ALL ON FUNCTION public.calc_material_prices() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calc_material_prices() TO authenticated;

-- ===========================================================================
-- 2. calc_save_settings — материалы печати любой категории + проверки
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.calc_save_settings(p_value jsonb, p_films jsonb DEFAULT '[]'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_film  jsonb;
  v_group text;
  v_k     numeric;
  v_nfc   text;
BEGIN
  IF NOT public.k24_user_can('calc:settings') THEN
    RAISE EXCEPTION 'Нет права менять настройки калькулятора' USING ERRCODE = '42501';
  END IF;
  IF p_value IS NULL OR jsonb_typeof(p_value) <> 'object' THEN
    RAISE EXCEPTION 'Настройки калькулятора должны быть объектом' USING ERRCODE = '22023';
  END IF;

  -- Коэффициент материала (позиции по цене склада): 0,5–5.
  IF p_value ? 'material_k' AND jsonb_typeof(p_value->'material_k') <> 'null' THEN
    IF jsonb_typeof(p_value->'material_k') <> 'number' THEN
      RAISE EXCEPTION 'Коэффициент материала должен быть числом' USING ERRCODE = '22023';
    END IF;
    v_k := (p_value->>'material_k')::numeric;
    IF v_k < 0.5 OR v_k > 5 THEN
      RAISE EXCEPTION 'Коэффициент материала — от 0,5 до 5' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- NFC-метка: существующая позиция склада.
  v_nfc := NULLIF(btrim(p_value->>'nfc_material_id'), '');
  IF v_nfc IS NOT NULL THEN
    IF v_nfc !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR NOT EXISTS (SELECT 1 FROM k24_materials m WHERE m.id = v_nfc::uuid) THEN
      RAISE EXCEPTION 'Позиция NFC-метки не найдена на складе' USING ERRCODE = '22023';
    END IF;
  END IF;

  FOR v_film IN SELECT * FROM jsonb_array_elements(COALESCE(p_films, '[]'::jsonb)) LOOP
    v_group := NULLIF(v_film->>'group', '');
    IF v_group IS NOT NULL AND v_group NOT IN ('white', 'holo', 'metal') THEN
      RAISE EXCEPTION 'Неизвестная ценовая группа: %', v_group USING ERRCODE = '22023';
    END IF;
    UPDATE k24_materials m
       SET calc_price_group  = CASE WHEN v_film ? 'group' THEN v_group ELSE m.calc_price_group END,
           calc_display_name = CASE WHEN v_film ? 'display_name'
                                    THEN NULLIF(btrim(v_film->>'display_name'), '')
                                    ELSE m.calc_display_name END
     WHERE m.id = (v_film->>'id')::uuid
       AND (
         m.type = 'film'
         OR EXISTS (
           SELECT 1 FROM k24_warehouse_categories c
            WHERE c.id = m.category_id AND c.show_in_order AND c.order_field = 'print'
         )
       );
  END LOOP;

  INSERT INTO k24_settings (key, value, updated_at)
  VALUES ('calculator', p_value, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
END;
$$;
REVOKE ALL ON FUNCTION public.calc_save_settings(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calc_save_settings(jsonb, jsonb) TO authenticated;

-- ===========================================================================
-- 3. История: в снимок материалов — и позиции с «Названием в расчёте»
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.k24_calc_settings_history_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.key <> 'calculator' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.value IS NOT DISTINCT FROM OLD.value THEN
    RETURN NEW;
  END IF;

  INSERT INTO k24_calc_settings_history (changed_by, value, films)
  VALUES (
    auth.uid(),
    NEW.value,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', m.id,
               'name', m.name,
               'group', m.calc_price_group,
               'display_name', m.calc_display_name
             ) ORDER BY m.name)
        FROM k24_materials m
       WHERE m.calc_price_group IS NOT NULL
          OR m.calc_display_name IS NOT NULL
    ), '[]'::jsonb)
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.k24_calc_settings_history_write() FROM PUBLIC, anon;

COMMIT;

-- Проверка после применения (под менеджером, в откатываемой транзакции):
--   SELECT * FROM calc_material_prices();
--   -- ожидаем: все 15 плёнок (price_cm2_raw по складу), бумага Ситилайт —
--   -- price_cm2_raw NULL до 111b (нет ширины рулона / категория не отмечена),
--   -- строк is_nfc нет до 111b (nfc_material_id не задан).
-- Под печатником: ERROR 42501.
