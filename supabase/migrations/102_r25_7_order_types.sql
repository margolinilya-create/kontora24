-- ============================================================
-- R25.7A (ТЗ 17.11, Фаза 7.1–7.4, 7.8) — реестр типов заказов + каталог своих этапов
-- ============================================================
-- Аддитивная и идемпотентная миграция (можно прогнать повторно):
--   1. k24_order_types — реестр типов продукции: маршрут v2 типа хранится как
--      «голова» (галочки Образец / Препресс) + производственная часть
--      (production, БЕЗ упаковки — она в неизменном хвосте). Сид — 8 встроенных
--      типов (7 сегодняшних + «Прочее»), production = ORDER_ROUTES_V2 из
--      src/shared/constants.js без головы/хвоста/упаковки. Замки встроенных —
--      ТЗ 7.3. ON CONFLICT DO NOTHING: повторный прогон не перетирает правки
--      администратора.
--   2. k24_stage_defs — каталог своих этапов (custom_<N>). В части A только
--      таблица; UI каталога и RPC записи — часть D (миграция 104).
--   3. RLS: SELECT — все authenticated; запись только через SECURITY DEFINER
--      RPC с правом order_type:manage (k24_user_can из 096).
--   4. RPC save_order_type(p jsonb) с серверной валидацией маршрута,
--      order_type_usage() — число заказов по типам.
--   5. Право order_type:manage — admin (остальные false).
--
-- Порядок: 102 → 103 → деплой фронта R25.7A. Фронт без 102 работает
-- (реестр пуст → маршруты из констант), но 103 требует 102.
--
-- Rollback (данные заказов не затрагиваются):
--   DROP FUNCTION IF EXISTS public.save_order_type(jsonb);
--   DROP FUNCTION IF EXISTS public.order_type_usage();
--   DROP TABLE IF EXISTS public.k24_stage_defs;   -- только если 103/104 не применены
--   DROP TABLE IF EXISTS public.k24_order_types;  -- только если 103 не применена (FK)
--   DELETE FROM k24_role_permissions WHERE permission = 'order_type:manage';

BEGIN;

-- ── 1. Каталог своих этапов ─────────────────────────────────
-- Создаётся первым: save_order_type проверяет ключи производственной части
-- по встроенным этапам ∪ k24_stage_defs.
CREATE SEQUENCE IF NOT EXISTS public.k24_stage_defs_key_seq;

CREATE TABLE IF NOT EXISTS public.k24_stage_defs (
  key          TEXT PRIMARY KEY
               DEFAULT ('custom_' || nextval('public.k24_stage_defs_key_seq'))
               CHECK (key ~ '^custom_[0-9]+$'),
  name         TEXT NOT NULL UNIQUE CHECK (btrim(name) <> ''),
  department   TEXT NOT NULL CHECK (department IN ('sales', 'prepress', 'print', '3d', 'osk')),
  norm_per_8h  NUMERIC CHECK (norm_per_8h IS NULL OR norm_per_8h > 0),
  show_in_menu BOOLEAN NOT NULL DEFAULT true,
  otk_defect   BOOLEAN NOT NULL DEFAULT true,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  archived_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID REFERENCES public.k24_profiles(id) ON DELETE SET NULL
);
ALTER SEQUENCE public.k24_stage_defs_key_seq OWNED BY public.k24_stage_defs.key;

COMMENT ON TABLE public.k24_stage_defs IS
  'R25.7: свои этапы производства (ключ custom_<N> не меняется при переименовании). Запись — RPC (часть D, миграция 104).';

-- ── 2. Реестр типов заказов ─────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.k24_order_types_key_seq;

CREATE TABLE IF NOT EXISTS public.k24_order_types (
  key                TEXT PRIMARY KEY CHECK (key ~ '^[a-z][A-Za-z0-9_]*$'),
  name               TEXT NOT NULL UNIQUE CHECK (btrim(name) <> ''),
  short_name         VARCHAR(16),
  is_builtin         BOOLEAN NOT NULL DEFAULT false,
  is_set             BOOLEAN NOT NULL DEFAULT false,
  head               JSONB NOT NULL DEFAULT '{"sample": true, "prepress": true}'::jsonb,
  production         JSONB NOT NULL CHECK (jsonb_typeof(production) = 'array'),
  locked_blocks      JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(locked_blocks) = 'array'),
  default_production JSONB CHECK (default_production IS NULL OR jsonb_typeof(default_production) = 'array'),
  -- Сдельные ставки только у своих типов: {"<stage>": {"rate": 1.5, "base": "item"|"sticker"}}.
  -- У встроенных NULL — оплата по calculateWorkerPayout (ТЗ 7.3).
  rates              JSONB CHECK (rates IS NULL OR jsonb_typeof(rates) = 'object'),
  sort_order         INTEGER NOT NULL DEFAULT 0,
  archived_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by         UUID REFERENCES public.k24_profiles(id) ON DELETE SET NULL,
  CONSTRAINT k24_order_types_builtin_no_rates CHECK (NOT is_builtin OR rates IS NULL),
  CONSTRAINT k24_order_types_builtin_not_archived CHECK (NOT is_builtin OR archived_at IS NULL)
);
ALTER SEQUENCE public.k24_order_types_key_seq OWNED BY public.k24_order_types.key;

COMMENT ON TABLE public.k24_order_types IS
  'R25.7: реестр типов заказов. Маршрут v2 = голова (head) + production + хвост packaging/otk/awaiting_pickup/delivery/done. Снимок в заказе — k24_orders.route_snapshot (103).';

-- Сид: production = ORDER_ROUTES_V2 (constants.js) без головы, упаковки и хвоста.
-- Тест src/shared/route-registry.test.js сверяет этот блок с константами.
INSERT INTO public.k24_order_types
  (key, name, short_name, is_builtin, is_set, production, default_production, locked_blocks, sort_order)
VALUES
  ('sticker_cut',   'Стикер вырубной (die cut)',     'Вырубной',      true, false,
     '["print","lamination","cutting"]',
     '["print","lamination","cutting"]',
     '[["print"]]', 10),
  ('sticker_kiss',  'Стикер на подложке (kiss cut)', 'На подложке',   true, false,
     '["print","lamination","cutting"]',
     '["print","lamination","cutting"]',
     '[["print"]]', 20),
  ('stickerpack',   'Стикерпак',                     'Стикерпак',     true, true,
     '["print","lamination","cutting"]',
     '["print","lamination","cutting"]',
     '[["print"]]', 30),
  ('sticker3D',     '3D стикер',                     '3D стикер',     true, false,
     '["print","cutting","pouring","drying","selection"]',
     '["print","cutting","pouring","drying","selection"]',
     '[["print"],["pouring","drying"]]', 40),
  ('stickerpack3D', '3D стикерпак',                  '3D стикерпак',  true, true,
     '["print","lamination","cutting","selection","pouring","drying","assembly_3d"]',
     '["print","lamination","cutting","selection","pouring","drying","assembly_3d"]',
     '[["print"],["selection","pouring","drying","assembly_3d"]]', 50),
  ('rect',          'Прямоугольный',                 'Прямоугольный', true, false,
     '["print","lamination","cutting"]',
     '["print","lamination","cutting"]',
     '[["print"]]', 60),
  ('big',           'Большой формат',                'Большой формат', true, false,
     '["print","lamination","cutting"]',
     '["print","lamination","cutting"]',
     '[["print"]]', 70),
  ('other',         'Прочее',                        'Прочее',        true, false,
     '["print","lamination","cutting","selection","pouring","drying","assembly_3d"]',
     '["print","lamination","cutting","selection","pouring","drying","assembly_3d"]',
     '[["print"]]', 80)
ON CONFLICT (key) DO NOTHING;

-- ── 3. RLS: чтение всем authenticated, запись только через RPC ──
ALTER TABLE public.k24_order_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.k24_stage_defs  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k24_order_types_select ON public.k24_order_types;
CREATE POLICY k24_order_types_select ON public.k24_order_types
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS k24_stage_defs_select ON public.k24_stage_defs;
CREATE POLICY k24_stage_defs_select ON public.k24_stage_defs
  FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.k24_order_types FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.k24_stage_defs  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.k24_order_types TO authenticated;
GRANT SELECT ON public.k24_stage_defs  TO authenticated;
REVOKE ALL ON SEQUENCE public.k24_order_types_key_seq FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.k24_stage_defs_key_seq  FROM PUBLIC, anon, authenticated;

-- ── 4. Валидация производственной части ─────────────────────
-- Возвращает текст ошибки (по-русски, для toast) или NULL, если маршрут корректен.
-- Встроенные этапы цеха — те, что могут стоять в production: голова, хвост,
-- упаковка, субподряд и устаревшие (batch_layout, selection_pouring) — нет.
CREATE OR REPLACE FUNCTION public.k24_validate_type_production(
  p_production    JSONB,
  p_locked_blocks JSONB,
  p_is_builtin    BOOLEAN
) RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_builtin_stages CONSTANT TEXT[] := ARRAY[
    'print', 'lamination', 'cutting', 'selection', 'pouring', 'drying', 'assembly_3d'
  ];
  v_stages TEXT[];
  v_block  JSONB;
  v_bstages TEXT[];
  v_pos    INT;
  v_i      INT;
  v_bad    TEXT;
BEGIN
  IF p_production IS NULL OR jsonb_typeof(p_production) <> 'array' THEN
    RETURN 'Маршрут типа должен быть списком этапов.';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_production) e WHERE jsonb_typeof(e) <> 'string') THEN
    RETURN 'Маршрут типа содержит некорректный этап.';
  END IF;

  SELECT COALESCE(array_agg(e ORDER BY ord), ARRAY[]::TEXT[])
    INTO v_stages
    FROM jsonb_array_elements_text(p_production) WITH ORDINALITY AS t(e, ord);

  -- Ключи этапов существуют (встроенный этап цеха или свой этап из каталога).
  SELECT s INTO v_bad
    FROM unnest(v_stages) AS s
   WHERE NOT (s = ANY (v_builtin_stages))
     AND NOT EXISTS (SELECT 1 FROM k24_stage_defs d WHERE d.key = s)
   LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RETURN format('Этап «%s» нельзя поставить в производственную часть маршрута.', v_bad);
  END IF;

  -- Без повторов.
  IF (SELECT count(*) FROM unnest(v_stages)) <> (SELECT count(DISTINCT s) FROM unnest(v_stages) s) THEN
    RETURN 'Этап повторяется в маршруте.';
  END IF;

  -- «Сушка» только сразу после «Заливки» (таймер 36 ч и автопереход, ТЗ 7.2).
  v_pos := array_position(v_stages, 'drying');
  IF v_pos IS NOT NULL AND (v_pos = 1 OR v_stages[v_pos - 1] <> 'pouring') THEN
    RETURN '«Сушка» может стоять только сразу после «Заливки».';
  END IF;

  -- Встроенные: «Печать» — первый этап производства (списание плёнки, старт допечаток).
  IF p_is_builtin AND (cardinality(v_stages) = 0 OR v_stages[1] <> 'print') THEN
    RETURN 'У встроенного типа первым этапом производства должна быть «Печать».';
  END IF;

  -- Закреплённые блоки: присутствуют целиком, подряд и в заданном порядке.
  IF p_locked_blocks IS NOT NULL AND jsonb_typeof(p_locked_blocks) = 'array' THEN
    FOR v_block IN SELECT value FROM jsonb_array_elements(p_locked_blocks) LOOP
      SELECT array_agg(e ORDER BY ord) INTO v_bstages
        FROM jsonb_array_elements_text(v_block) WITH ORDINALITY AS t(e, ord);
      IF v_bstages IS NULL OR cardinality(v_bstages) = 0 THEN CONTINUE; END IF;
      v_pos := array_position(v_stages, v_bstages[1]);
      IF v_pos IS NULL THEN
        RETURN format('Закреплённый этап «%s» нельзя убрать из маршрута.', v_bstages[1]);
      END IF;
      FOR v_i IN 2 .. cardinality(v_bstages) LOOP
        IF v_pos + v_i - 1 > cardinality(v_stages) OR v_stages[v_pos + v_i - 1] <> v_bstages[v_i] THEN
          RETURN format('Закреплённые этапы (%s) должны идти подряд в исходном порядке.',
                        array_to_string(v_bstages, ' → '));
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.k24_validate_type_production(JSONB, JSONB, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.k24_validate_type_production(JSONB, JSONB, BOOLEAN) TO authenticated;

-- ── 5. RPC save_order_type ──────────────────────────────────
-- p: { key?, name, short_name?, is_set?, head?: {sample, prepress}, production,
--      rates?, sort_order?, archived?: bool }
--   • key отсутствует → создаётся свой тип с ключом type_<N>;
--   • встроенный тип: меняются name, short_name, head, production (с замками),
--     sort_order; is_set / rates / архив — нет;
--   • свой тип: всё перечисленное + is_set, rates, archived.
-- Возвращает { ok, type } или { ok:false, error }.
CREATE OR REPLACE FUNCTION public.save_order_type(p JSONB)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid        UUID := auth.uid();
  v_key        TEXT := NULLIF(btrim(COALESCE(p->>'key', '')), '');
  v_existing   k24_order_types%ROWTYPE;
  v_is_new     BOOLEAN;
  v_name       TEXT := NULLIF(btrim(COALESCE(p->>'name', '')), '');
  v_short      TEXT := NULLIF(btrim(COALESCE(p->>'short_name', '')), '');
  v_is_set     BOOLEAN;
  v_head       JSONB;
  v_production JSONB := p->'production';
  v_rates      JSONB;
  v_sort       INTEGER;
  v_archived   TIMESTAMPTZ;
  v_err        TEXT;
  v_stage      TEXT;
  v_rate       JSONB;
  v_row        k24_order_types%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Сессия не активна. Войдите заново.');
  END IF;
  IF NOT public.k24_user_can('order_type:manage') THEN
    RETURN json_build_object('ok', false, 'error', 'Нет права настраивать типы заказов.');
  END IF;
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RETURN json_build_object('ok', false, 'error', 'Некорректные данные типа.');
  END IF;

  IF v_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM k24_order_types WHERE key = v_key FOR UPDATE;
  END IF;
  v_is_new := v_existing.key IS NULL;

  IF v_is_new AND v_key IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Тип не найден — обновите страницу.');
  END IF;

  IF v_name IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Укажите название типа.');
  END IF;
  IF v_short IS NOT NULL AND char_length(v_short) > 16 THEN
    RETURN json_build_object('ok', false, 'error', 'Короткое название — не длиннее 16 символов.');
  END IF;
  IF EXISTS (SELECT 1 FROM k24_order_types
              WHERE lower(name) = lower(v_name) AND key IS DISTINCT FROM v_existing.key) THEN
    RETURN json_build_object('ok', false, 'error', 'Тип с таким названием уже есть.');
  END IF;

  -- Голова: две галочки (ТЗ 7.2).
  v_head := jsonb_build_object(
    'sample',   COALESCE((p->'head'->>'sample')::boolean,   (v_existing.head->>'sample')::boolean,   true),
    'prepress', COALESCE((p->'head'->>'prepress')::boolean, (v_existing.head->>'prepress')::boolean, true)
  );

  IF v_production IS NULL THEN v_production := v_existing.production; END IF;
  v_sort := COALESCE((p->>'sort_order')::int, v_existing.sort_order, 1000);

  IF NOT v_is_new AND v_existing.is_builtin THEN
    -- Встроенный: набор, ставки и архив не меняются.
    v_is_set   := v_existing.is_set;
    v_rates    := NULL;
    v_archived := NULL;
    IF COALESCE((p->>'archived')::boolean, false) THEN
      RETURN json_build_object('ok', false, 'error', 'Встроенный тип нельзя архивировать.');
    END IF;
    v_err := public.k24_validate_type_production(v_production, v_existing.locked_blocks, true);
  ELSE
    v_is_set := COALESCE((p->>'is_set')::boolean, v_existing.is_set, false);
    v_rates  := CASE WHEN p ? 'rates' THEN NULLIF(p->'rates', 'null'::jsonb) ELSE v_existing.rates END;
    v_archived := CASE
      WHEN p ? 'archived' THEN
        CASE WHEN (p->>'archived')::boolean THEN COALESCE(v_existing.archived_at, now()) ELSE NULL END
      ELSE v_existing.archived_at
    END;
    v_err := public.k24_validate_type_production(v_production, '[]'::jsonb, false);
  END IF;
  IF v_err IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'error', v_err);
  END IF;

  -- Ставки своего типа: этап маршрута (или упаковка), ставка ≥ 0,
  -- база item / sticker (sticker — только у типа-набора).
  IF v_rates IS NOT NULL THEN
    IF jsonb_typeof(v_rates) <> 'object' THEN
      RETURN json_build_object('ok', false, 'error', 'Некорректные ставки.');
    END IF;
    FOR v_stage, v_rate IN SELECT key, value FROM jsonb_each(v_rates) LOOP
      IF NOT (v_production ? v_stage) AND v_stage <> 'packaging' THEN
        RETURN json_build_object('ok', false, 'error', format('Ставка задана для этапа «%s», которого нет в маршруте.', v_stage));
      END IF;
      IF jsonb_typeof(v_rate) <> 'object'
         OR jsonb_typeof(v_rate->'rate') <> 'number'
         OR (v_rate->>'rate')::numeric < 0 THEN
        RETURN json_build_object('ok', false, 'error', 'Ставка должна быть неотрицательным числом.');
      END IF;
      IF COALESCE(v_rate->>'base', 'item') NOT IN ('item', 'sticker') THEN
        RETURN json_build_object('ok', false, 'error', 'База ставки: за изделие или за стикер.');
      END IF;
      IF v_rate->>'base' = 'sticker' AND NOT v_is_set THEN
        RETURN json_build_object('ok', false, 'error', 'Ставка «за стикер» доступна только у типа-набора.');
      END IF;
    END LOOP;
  END IF;

  IF v_is_new THEN
    INSERT INTO k24_order_types
      (key, name, short_name, is_builtin, is_set, head, production, locked_blocks,
       default_production, rates, sort_order, archived_at, updated_by)
    VALUES
      ('type_' || nextval('public.k24_order_types_key_seq'), v_name, v_short, false, v_is_set,
       v_head, v_production, '[]'::jsonb, NULL, v_rates, v_sort, v_archived, v_uid)
    RETURNING * INTO v_row;
  ELSE
    UPDATE k24_order_types
       SET name        = v_name,
           short_name  = v_short,
           is_set      = v_is_set,
           head        = v_head,
           production  = v_production,
           rates       = v_rates,
           sort_order  = v_sort,
           archived_at = v_archived,
           updated_at  = now(),
           updated_by  = v_uid
     WHERE key = v_existing.key
    RETURNING * INTO v_row;
  END IF;

  RETURN json_build_object('ok', true, 'type', to_jsonb(v_row));
END;
$function$;

REVOKE ALL ON FUNCTION public.save_order_type(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_order_type(JSONB) TO authenticated;

-- ── 6. RPC order_type_usage ─────────────────────────────────
-- Число заказов по типу (всего / активных) — для списка типов в настройках
-- и запрета удаления используемого типа. SECURITY DEFINER: считает по всей
-- таблице без раскрытия строк заказов.
CREATE OR REPLACE FUNCTION public.order_type_usage()
RETURNS TABLE (order_type TEXT, orders_count BIGINT, active_count BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.k24_user_can('order_type:manage') THEN
    RAISE EXCEPTION 'Нет права настраивать типы заказов' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT o.order_type,
           count(*)::bigint,
           count(*) FILTER (WHERE o.status NOT IN ('done', 'cancelled'))::bigint
      FROM k24_orders o
     WHERE o.order_type IS NOT NULL
     GROUP BY o.order_type;
END;
$function$;

REVOKE ALL ON FUNCTION public.order_type_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.order_type_usage() TO authenticated;

-- ── 7. Право order_type:manage (admin). DO NOTHING — не перетираем UI-настройку.
INSERT INTO public.k24_role_permissions (role, permission, allowed)
SELECT r.role, 'order_type:manage', r.role = 'admin'
  FROM (VALUES ('admin'), ('manager'), ('designer'), ('printer'), ('post_printer')) AS r(role)
ON CONFLICT (role, permission) DO NOTHING;

COMMIT;

-- Проверка после применения:
-- SELECT key, is_builtin, is_set, production, locked_blocks FROM k24_order_types ORDER BY sort_order;  -- 8 строк
-- SELECT role, allowed FROM k24_role_permissions WHERE permission = 'order_type:manage';
-- SELECT has_table_privilege('authenticated', 'public.k24_order_types', 'INSERT');   -- false
-- SELECT has_function_privilege('anon', 'public.save_order_type(jsonb)', 'EXECUTE'); -- false
