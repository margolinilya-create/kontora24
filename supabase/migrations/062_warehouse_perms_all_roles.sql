-- Migration 062: R18.5 — закрепить права склада за всеми ролями
--
-- Бриф 30.06: «Необходимо создать возможность любому сотруднику вносить
-- расходы и приходы на складе. Сейчас, когда сотрудник пытается внести
-- расход, он сталкивается с ограничением прав, нужно это исправить».
--
-- На проде эти права уже проставлены (вероятно вручную через /settings),
-- но в сид-миграциях не закреплены: 020 давал view:warehouse только
-- admin/manager, 059 сидировал material:add_transaction всем. Чтобы при
-- сбросе/пересоздании БД доступ не откатился к admin/manager, фиксируем:
--   • view:warehouse          → все 5 ролей (открыть страницу склада)
--   • material:add_transaction → все 5 ролей (кнопка «Приход/расход» + RPC)
--
-- update_stock (059) проверяет именно material:add_transaction через
-- k24_role_permissions, поэтому этих двух прав достаточно для полного flow.

INSERT INTO k24_role_permissions (role, permission, allowed)
VALUES
  ('admin',        'view:warehouse',          true),
  ('manager',      'view:warehouse',          true),
  ('designer',     'view:warehouse',          true),
  ('printer',      'view:warehouse',          true),
  ('post_printer', 'view:warehouse',          true),

  ('admin',        'material:add_transaction', true),
  ('manager',      'material:add_transaction', true),
  ('designer',     'material:add_transaction', true),
  ('printer',      'material:add_transaction', true),
  ('post_printer', 'material:add_transaction', true)

ON CONFLICT (role, permission) DO UPDATE SET allowed = EXCLUDED.allowed;
