-- Migration 068: право stage:new (QA 04.07, баг №3 Major).
--
-- canAdvanceFrom() при загруженных динамических правах проверяет
-- k24_role_permissions по ключу stage:<текущий статус>. Права stage:new не
-- существовало ни у одной роли, поэтому НИКТО (включая admin) не мог штатно
-- вывести заказ из «Новый»: StatusSwitcher прятал кнопку, канбан отклонял
-- перенос. Команда обходила это force-переводами через AdminOrderEditor,
-- ломая маршрутную дисциплину (в истории есть прыжки new→pouring).
--
-- Приём заказа в работу — зона manager/admin. Рабочим ролям выключено
-- (включается через /settings → Права ролей). Паттерн — миграция 056.

INSERT INTO k24_role_permissions (role, permission, allowed)
VALUES
  ('admin',        'stage:new', true),
  ('manager',      'stage:new', true),
  ('designer',     'stage:new', false),
  ('printer',      'stage:new', false),
  ('post_printer', 'stage:new', false)
ON CONFLICT (role, permission) DO UPDATE
SET allowed = EXCLUDED.allowed,
    updated_at = now();
