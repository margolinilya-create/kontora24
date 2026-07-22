-- ============================================================
-- R22.1 (ТЗ 20.07.2026, Фаза 1) — подзадачи-допечатки: схема
-- ============================================================
-- Новая сущность «допечатка» (track='reprint') в k24_order_subtasks:
-- ручная допечатка части тиража по браку/недостаче, полный маршрут от печати,
-- собственная страница учёта и жёсткий гейт «заказ не завершён, пока все
-- допечатки не завершены».
--
-- Старая система параллельных подзадач (backgrounds/stickers/extra_stickers)
-- переводится в read-only: помечаем завершённые как is_legacy. Активные
-- bg/stickers НЕ трогаем — они нужны для заказов в полёте до R22.4.
--
-- Rollback:
--   ALTER TABLE k24_production_logs DROP COLUMN subtask_id, DROP COLUMN qty_dried;
--   ALTER TABLE k24_order_subtasks DROP COLUMN title, qty, reason, comment, route,
--     is_legacy, paused;
--   вернуть track CHECK к 4 значениям (после удаления reprint-строк).

-- --- k24_order_subtasks: track += 'reprint' + поля допечатки ---
ALTER TABLE k24_order_subtasks DROP CONSTRAINT IF EXISTS k24_order_subtasks_track_check;
ALTER TABLE k24_order_subtasks
  ADD CONSTRAINT k24_order_subtasks_track_check
  CHECK (track IN ('backgrounds', 'stickers', 'variant', 'extra_stickers', 'reprint'));

ALTER TABLE k24_order_subtasks
  ADD COLUMN IF NOT EXISTS title      TEXT,
  ADD COLUMN IF NOT EXISTS qty        INTEGER,
  ADD COLUMN IF NOT EXISTS reason     TEXT,
  ADD COLUMN IF NOT EXISTS comment    TEXT,
  ADD COLUMN IF NOT EXISTS route      JSONB,
  ADD COLUMN IF NOT EXISTS is_legacy  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paused     BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE k24_order_subtasks DROP CONSTRAINT IF EXISTS k24_order_subtasks_reason_check;
ALTER TABLE k24_order_subtasks
  ADD CONSTRAINT k24_order_subtasks_reason_check
  CHECK (reason IN ('defect', 'shortage') OR reason IS NULL);

-- Уникальность reprint по (order_id, item_idx) — как у variant/extra_stickers.
CREATE UNIQUE INDEX IF NOT EXISTS uq_subtasks_reprint_item
  ON k24_order_subtasks (order_id, item_idx)
  WHERE track = 'reprint';

-- --- k24_production_logs: привязка лога к подзадаче + «высушено» ---
ALTER TABLE k24_production_logs
  ADD COLUMN IF NOT EXISTS subtask_id UUID REFERENCES k24_order_subtasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS qty_dried  INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_production_logs_subtask
  ON k24_production_logs (subtask_id)
  WHERE subtask_id IS NOT NULL;

-- --- Пометить старую систему как legacy (read-only в истории) ---
-- Завершённые (ready) и всё, что висит на закрытых заказах.
UPDATE k24_order_subtasks
  SET is_legacy = true
  WHERE track IN ('backgrounds', 'stickers', 'extra_stickers')
    AND is_legacy = false
    AND (
      status = 'ready'
      OR order_id IN (SELECT id FROM k24_orders WHERE status IN ('done', 'cancelled'))
    );
