-- ============================================================
-- R25.3 (ТЗ, Фаза 3.2) — откат подзадачи-допечатки на пройденный этап
-- ============================================================
-- rollback_reprint_subtask(p_subtask_id, p_target_status, p_expected_status, p_comment)
--   • право subtask:rollback через k24_role_permissions (динамический L2 RBAC;
--     по умолчанию admin + manager — как откат заказа);
--   • optimistic-lock по текущему статусу (p_expected_status);
--   • целевой этап должен быть в снимке маршрута подзадачи (subtask.route)
--     СТРОГО раньше текущего;
--   • отказ, если родительский заказ готов (done) или отменён (cancelled);
--   • завершённую допечатку откат открывает заново (completed_at := NULL) —
--     гейт fn_block_done_with_open_reprints снова держит заказ на ТК;
--   • drying_started_at обнуляется; при входе на «Сушку» таймер ставит
--     существующий триггер fn_set_drying_started_at (044);
--   • логи учёта НЕ трогаем (как при откате заказа);
--   • аудит в k24_order_audit: field_name='reprint_rollback',
--     old_value = прежний этап, new_value = JSON {subtask_id,title,from,to,comment}.
--
-- advance_reprint_subtask / force_advance_reprint_subtask НЕ трогаем.
-- Миграция аддитивная и идемпотентная (CREATE OR REPLACE + ON CONFLICT DO NOTHING).
-- Проверка права инлайн (не через k24_user_can из 096 — 095 применяется раньше).
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.rollback_reprint_subtask(UUID, TEXT, TEXT, TEXT);
--   DELETE FROM k24_role_permissions WHERE permission = 'subtask:rollback';

CREATE OR REPLACE FUNCTION public.rollback_reprint_subtask(
  p_subtask_id      UUID,
  p_target_status   TEXT,
  p_expected_status TEXT,
  p_comment         TEXT DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid          UUID := auth.uid();
  v_allowed      BOOLEAN;
  v_now          TIMESTAMPTZ := NOW();
  v_track        TEXT;
  v_status       TEXT;
  v_route        JSONB;
  v_is_legacy    BOOLEAN;
  v_title        TEXT;
  v_order_id     UUID;
  v_order_status TEXT;
  v_cur_idx      INT;
  v_tgt_idx      INT;
  v_comment      TEXT := NULLIF(btrim(COALESCE(p_comment, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Сессия не активна. Войдите заново.');
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM k24_profiles p
      JOIN k24_role_permissions rp ON rp.role = p.role
     WHERE p.id = v_uid
       AND rp.permission = 'subtask:rollback'
       AND rp.allowed
  ) INTO v_allowed;
  IF NOT v_allowed THEN
    RETURN json_build_object('ok', false, 'error', 'Нет права возвращать подзадачи на предыдущий этап.');
  END IF;

  IF p_target_status IS NULL OR p_target_status = '' OR p_target_status = 'done' THEN
    RETURN json_build_object('ok', false, 'error', 'Не выбран этап для возврата.');
  END IF;

  SELECT track, status, route, is_legacy, title, order_id
    INTO v_track, v_status, v_route, v_is_legacy, v_title, v_order_id
    FROM k24_order_subtasks WHERE id = p_subtask_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'Допечатка не найдена.');
  END IF;
  IF v_track <> 'reprint' OR v_is_legacy THEN
    RETURN json_build_object('ok', false, 'error', 'Подзадача не является активной допечаткой.');
  END IF;

  -- Optimistic-lock: этап уже сдвинулся (другой сотрудник / вкладка).
  IF v_status IS DISTINCT FROM p_expected_status THEN
    RETURN json_build_object('ok', false, 'error', 'Этап уже изменился — обновите страницу.');
  END IF;

  SELECT status INTO v_order_status FROM k24_orders WHERE id = v_order_id;
  IF v_order_status IN ('done', 'cancelled') THEN
    RETURN json_build_object('ok', false, 'error',
      CASE WHEN v_order_status = 'done'
        THEN 'Заказ уже готов — допечатку вернуть нельзя.'
        ELSE 'Заказ отменён — допечатку вернуть нельзя.'
      END);
  END IF;

  IF v_route IS NULL OR jsonb_typeof(v_route) <> 'array' THEN
    RETURN json_build_object('ok', false, 'error', 'У допечатки нет маршрута.');
  END IF;

  SELECT ord INTO v_cur_idx
    FROM jsonb_array_elements_text(v_route) WITH ORDINALITY AS t(elem, ord)
   WHERE elem = v_status
   LIMIT 1;
  SELECT ord INTO v_tgt_idx
    FROM jsonb_array_elements_text(v_route) WITH ORDINALITY AS t(elem, ord)
   WHERE elem = p_target_status
   LIMIT 1;

  IF v_cur_idx IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Текущий этап не найден в маршруте допечатки.');
  END IF;
  IF v_tgt_idx IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Этап не входит в маршрут допечатки.');
  END IF;
  IF v_tgt_idx >= v_cur_idx THEN
    RETURN json_build_object('ok', false, 'error', 'Вернуть можно только на пройденный этап.');
  END IF;

  -- drying_started_at := NULL до смены статуса: при target='drying' триггер 044
  -- (BEFORE UPDATE OF status) видит NULL и запускает таймер заново.
  UPDATE k24_order_subtasks
     SET status            = p_target_status,
         completed_at      = NULL,
         drying_started_at = NULL,
         updated_at        = v_now
   WHERE id = p_subtask_id;

  INSERT INTO k24_order_audit (order_id, field_name, old_value, new_value, changed_by)
  VALUES (
    v_order_id,
    'reprint_rollback',
    v_status,
    json_build_object(
      'subtask_id', p_subtask_id,
      'title',      v_title,
      'from',       v_status,
      'to',         p_target_status,
      'comment',    v_comment
    )::text,
    v_uid
  );

  RETURN json_build_object('ok', true, 'new_status', p_target_status, 'reopened', (v_status = 'done'));
END;
$function$;

REVOKE ALL ON FUNCTION public.rollback_reprint_subtask(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rollback_reprint_subtask(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- Право subtask:rollback (Приложение В): admin + manager. DO NOTHING — не
-- перетираем, если право уже настроили через UI.
INSERT INTO public.k24_role_permissions (role, permission, allowed) VALUES
  ('admin',        'subtask:rollback', true),
  ('manager',      'subtask:rollback', true),
  ('designer',     'subtask:rollback', false),
  ('printer',      'subtask:rollback', false),
  ('post_printer', 'subtask:rollback', false)
ON CONFLICT (role, permission) DO NOTHING;

-- Проверка после применения:
-- SELECT role, allowed FROM k24_role_permissions WHERE permission = 'subtask:rollback';
-- SELECT has_function_privilege('anon', 'public.rollback_reprint_subtask(uuid,text,text,text)', 'EXECUTE'); -- false
