-- Migration 069: дроп двусмысленной перегрузки check_stage_completion (QA 04.07, баг №5 Major).
--
-- С миграции 008 в БД сосуществовали ДВЕ перегрузки:
--   check_stage_completion(uuid, text)                    — оригинал из 003
--   check_stage_completion(uuid, text, text DEFAULT NULL) — актуальная (058)
-- Вызов RPC с двумя именованными аргументами {p_order_id, p_stage} подходил
-- обеим → PostgREST отвечал PGRST203 «Could not choose the best candidate
-- function». Из-за этого addProductionLogAndCheckAdvance для обычных (не
-- dual-track) заказов молча получал isComplete=false: авто-предложение
-- «этап завершён → перейти дальше» никогда не показывалось, а Sentry
-- засорялся ошибкой на каждом вводе данных этапа.
--
-- Проверено (04.07): ни одна DB-функция/триггер 2-арг версию не вызывает;
-- 3-арг с DEFAULT NULL полностью покрывает все вызовы фронта.

DROP FUNCTION IF EXISTS public.check_stage_completion(uuid, text);
