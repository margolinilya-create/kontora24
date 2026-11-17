-- ============================================================
-- R25.2 (ТЗ 17.11, Фаза 2) — ТК: брак по типам
-- ============================================================
-- Аддитивная и идемпотентная миграция (можно прогнать повторно).
--
-- Каждая строка формы ТК — запись k24_production_logs:
--   stage = 'otk', defects = количество, item_idx = вид (мульти-вид),
--   defect_stage = тип брака (print / lamination / cutting / pouring).
-- Отдельная таблица не нужна: у записей учёта уже есть история, мягкое
-- удаление (deleted_at), аудит (trg_audit_production_log пишет to_jsonb(NEW) —
-- новая колонка попадает в аудит автоматически) и realtime.
--
-- 1. k24_production_logs.defect_stage text (NULL у всех существующих записей).
-- 2. CHECK: defect_stage только у записей ТК и только из четырёх типов.
--    Расширение списка под настраиваемые этапы — Фаза 7 (DROP + ADD).
--
-- Чего миграция НЕ делает (проверено по репо, см. отчёт R25.2):
--   • deduct_materials_from_log (последнее тело — 096) списывает только по
--     дельтам film_meters / lamination_meters / resin_grams / packs_packaged /
--     boxes_used. Записи ТК их не несут (форма пишет defect_stage, defects,
--     item_idx, track) → со склада ничего не списывается. Функцию не трогаем.
--   • check_stage_completion (v6, 093) не меняем: этап otk не входит в
--     STAGES_REQUIRING_COMPLETION клиента, выход с ТК им не гейтится, а запись
--     брака ТК пишется прямым insert без проверки завершения.
--   • GRANT не нужен: у k24_production_logs табличные (не колоночные)
--     привилегии authenticated — новая колонка доступна по существующим
--     RLS-политикам (INSERT: worker_id = auth.uid()).
--
-- Rollback (данные брака ТК теряются только при DROP COLUMN — не делать без
-- выгрузки):
--   ALTER TABLE public.k24_production_logs
--     DROP CONSTRAINT IF EXISTS k24_production_logs_defect_stage_check;
--   -- колонку оставить; записи stage='otk' приложение до R25.2 игнорирует
--   -- (кроме сумм defects в отчётах без фильтра по этапу).

BEGIN;

-- ── 1. Колонка ──────────────────────────────────────────────
ALTER TABLE public.k24_production_logs
  ADD COLUMN IF NOT EXISTS defect_stage TEXT;

COMMENT ON COLUMN public.k24_production_logs.defect_stage IS
  'R25.2: тип брака, найденного на ТК (stage=otk): print / lamination / cutting / pouring. NULL у остальных записей.';

-- ── 2. CHECK ────────────────────────────────────────────────
-- Добавляем только если ещё нет (повторный прогон). VALIDATE на уже валидном
-- ограничении — no-op. У всех существующих строк defect_stage IS NULL →
-- проверка проходит (таблица небольшая, блокировка — доли секунды).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'k24_production_logs_defect_stage_check'
      AND conrelid = 'public.k24_production_logs'::regclass
  ) THEN
    ALTER TABLE public.k24_production_logs
      ADD CONSTRAINT k24_production_logs_defect_stage_check
      CHECK (
        defect_stage IS NULL
        OR (stage = 'otk' AND defect_stage IN ('print', 'lamination', 'cutting', 'pouring'))
      ) NOT VALID;
  END IF;
END $$;

ALTER TABLE public.k24_production_logs
  VALIDATE CONSTRAINT k24_production_logs_defect_stage_check;

COMMIT;

-- ============================================================
-- Проверки после применения (READ-ONLY):
--
-- -- колонка и CHECK на месте, CHECK валиден
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--  WHERE table_name = 'k24_production_logs' AND column_name = 'defect_stage';
-- SELECT conname, convalidated, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conname = 'k24_production_logs_defect_stage_check';
--
-- -- колоночных привилегий у таблицы нет (иначе нужен GRANT SELECT/INSERT/UPDATE (defect_stage))
-- SELECT grantee, privilege_type, column_name FROM information_schema.column_privileges
--  WHERE table_name = 'k24_production_logs' AND grantee = 'authenticated' LIMIT 5;  -- ожидаем 0 строк
--
-- -- до R25.2 записей ТК не было (эталон R25.0 не меняется)
-- SELECT count(*) FROM k24_production_logs WHERE stage = 'otk';  -- ожидаем 0
--
-- -- триггер списания не трогает запись ТК (выполнять в транзакции с ROLLBACK):
-- -- BEGIN;
-- --   INSERT INTO k24_production_logs (order_id, stage, worker_id, defects, defect_stage)
-- --   VALUES ('<order_id>', 'otk', '<user_id>', 3, 'print');
-- --   SELECT count(*) FROM k24_material_transactions WHERE created_at > now() - interval '1 minute';  -- 0
-- -- ROLLBACK;
-- ============================================================
