-- ============================================================
-- R22.4 (ТЗ 20.07.2026, Фаза 4Б) — миграция заказов с упразднённых этапов
-- ============================================================
-- batch_layout → prepress; selection_pouring → умный маппинг по состоянию
-- sticker-подзадачи (сохраняет физический прогресс). На момент применения
-- активных заказов на этих этапах нет (проверено 22.07), но миграция
-- защищает от гонки деплой↔прод и корректирует любые будущие грязные данные.
--
-- Rollback: восстановить статусы из _backup_r22_4_orders.

-- Backup затронутых заказов.
DROP TABLE IF EXISTS _backup_r22_4_orders;
CREATE TABLE _backup_r22_4_orders AS
  SELECT id, number, status, order_type, drying_started_at
    FROM k24_orders WHERE status IN ('batch_layout', 'selection_pouring');

-- batch_layout → prepress.
INSERT INTO k24_order_status_history (order_id, from_status, to_status, changed_by)
  SELECT id, 'batch_layout', 'prepress', NULL
    FROM k24_orders WHERE status = 'batch_layout';
UPDATE k24_orders SET status = 'prepress', updated_at = NOW()
  WHERE status = 'batch_layout';

-- selection_pouring → маппинг по sticker-подзадаче.
-- Определяем целевой статус и, при переходе на сушку, переносим таймер.
WITH mapped AS (
  SELECT o.id,
    CASE
      WHEN st.status = 'pouring' THEN 'pouring'
      WHEN st.status = 'drying'  THEN 'drying'
      WHEN bg.status = 'ready' AND st.status = 'ready' THEN 'assembly_3d'
      ELSE 'selection'
    END AS target,
    st.drying_started_at AS st_drying
  FROM k24_orders o
  LEFT JOIN k24_order_subtasks st ON st.order_id = o.id AND st.track = 'stickers'
  LEFT JOIN k24_order_subtasks bg ON bg.order_id = o.id AND bg.track = 'backgrounds'
  WHERE o.status = 'selection_pouring'
)
UPDATE k24_orders o
  SET status = m.target,
      drying_started_at = CASE WHEN m.target = 'drying' THEN COALESCE(m.st_drying, NOW()) ELSE o.drying_started_at END,
      updated_at = NOW()
  FROM mapped m WHERE o.id = m.id;

INSERT INTO k24_order_status_history (order_id, from_status, to_status, changed_by)
  SELECT b.id, 'selection_pouring', o.status, NULL
    FROM _backup_r22_4_orders b
    JOIN k24_orders o ON o.id = b.id
    WHERE b.status = 'selection_pouring';
