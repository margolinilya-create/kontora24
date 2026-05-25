-- 040_multivariant_subtasks — R8.4c (серия 25.05)
--
-- Расширяем k24_order_subtasks под multi-variant заказы (R8.3 серии 25.05):
-- каждый вид изделия в multi-variant заказе получает свою подзадачу
-- (track='variant', item_idx=N), независимую от подзадач 3D-стикерпака.
--
-- - track='backgrounds'/'stickers' — для stickerpack3D, item_idx=NULL.
-- - track='variant' — для multi-variant заказов любого типа, item_idx>=1.
-- - Маршрут variant — общий маршрут заказа (как order.status). Передаём
--   произвольные значения статуса (соответствует ORDER_STATUSES).
--
-- Бэкфилл: для всех существующих заказов с >1 items создаём variant subtasks.

BEGIN;

-- 1. Расширить CHECK для track
ALTER TABLE k24_order_subtasks DROP CONSTRAINT IF EXISTS k24_order_subtasks_track_check;
ALTER TABLE k24_order_subtasks ADD CONSTRAINT k24_order_subtasks_track_check
  CHECK (track IN ('backgrounds', 'stickers', 'variant'));

-- 2. item_idx — для variants. NULL для backgrounds/stickers.
ALTER TABLE k24_order_subtasks ADD COLUMN IF NOT EXISTS item_idx INT;

-- 3. Перестроить unique constraints
--    Старый UNIQUE (order_id, track) больше не работает для variants
--    (несколько 'variant' на одном заказе).
ALTER TABLE k24_order_subtasks DROP CONSTRAINT IF EXISTS k24_order_subtasks_order_id_track_key;

-- Partial unique: для bg/stickers — один на трек.
CREATE UNIQUE INDEX IF NOT EXISTS uq_subtasks_track_3d
  ON k24_order_subtasks (order_id, track)
  WHERE track IN ('backgrounds','stickers');

-- Для variants — уникальность по item_idx.
CREATE UNIQUE INDEX IF NOT EXISTS uq_subtasks_variant_item
  ON k24_order_subtasks (order_id, item_idx)
  WHERE track = 'variant';

-- 4. Backfill: для существующих заказов с >1 items создаём variant subtasks
--    Со статусом = текущий order.status (стартуем с того же места).
INSERT INTO k24_order_subtasks (order_id, track, item_idx, status)
SELECT it.order_id, 'variant', it.idx, o.status
FROM k24_order_items it
JOIN k24_orders o ON o.id = it.order_id
WHERE EXISTS (
  SELECT 1 FROM k24_order_items it2
  WHERE it2.order_id = it.order_id
  GROUP BY it2.order_id
  HAVING COUNT(*) > 1
)
AND NOT EXISTS (
  SELECT 1 FROM k24_order_subtasks st
  WHERE st.order_id = it.order_id AND st.track = 'variant' AND st.item_idx = it.idx
);

-- 5. RPC advance_subtask уже работает с любым track — авторизация
--    (миграция 039) включает admin/manager/designer/printer/post_printer.
--    Логика both_ready остаётся релевантной только для bg/stickers пары;
--    для variants условие all_variants_ready вычисляется на клиенте.

COMMIT;
