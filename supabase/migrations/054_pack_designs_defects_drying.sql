-- R14.4 (бриф 03.06): на этапе сушки фиксируется брак по каждому виду
-- стикеров отдельно. Поле не используется триггерами расхода материалов
-- и не реверсируется автоматически — это аналитический счётчик для шкалы
-- прогресса. Реальные production_logs.defects продолжают писаться через
-- ProductionLogForm на drying stage.
BEGIN;

ALTER TABLE k24_pack_designs
  ADD COLUMN IF NOT EXISTS defects_drying INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN k24_pack_designs.defects_drying IS
  'Брак на этапе сушки по виду стикера (R14.4). Вычитается из qty_poured в шкале прогресса.';

COMMIT;
