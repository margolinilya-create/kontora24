-- 051_prepress_prepared_qty — R13.2 серии 02.06
--
-- Бриф менеджера 02.06 (правки на /orders/{id}):
--   Стадия `prepress` получает новое поле «Подготовлено к печати» (шт).
--   Раньше prepress был в NO_INPUT_STAGES и логов на него не писалось.
--
-- prepared_qty — int, опционально (NULL для существующих логов и для будущих
-- логов на других этапах, где это поле не используется).

ALTER TABLE k24_production_logs
  ADD COLUMN IF NOT EXISTS prepared_qty INT NULL;
