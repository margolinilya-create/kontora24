-- R13.0 (бриф 02.06): удаление batch_layout из активных маршрутов.
-- Менеджер: «препресс и вёрстка тиража — одинаковые этапы». Сам статус
-- остаётся в коде/БД для совместимости с историей старых заказов, но новые
-- маршруты ORDER_ROUTES его больше не содержат. Активные заказы и подзадачи
-- переводим на ближайший осмысленный — `prepress`.

-- Активные заказы на стадии batch_layout → prepress
UPDATE k24_orders
SET status = 'prepress',
    updated_at = NOW()
WHERE status = 'batch_layout';

-- Подзадачи тоже могли быть в этом статусе (R8.4c+: variant subtasks)
UPDATE k24_order_subtasks
SET status = 'prepress'
WHERE status = 'batch_layout';

-- В status_history оставляем как есть — это историческая запись о прошедшем
-- этапе, она должна сохраниться для аналитики.

-- Зачищаем k24_plan_overrides (R12) от закреплений на batch_layout — этап
-- больше не входит в маршрут, иначе план будет ссылаться на несуществующую
-- стадию.
DELETE FROM k24_plan_overrides
WHERE stage = 'batch_layout';
