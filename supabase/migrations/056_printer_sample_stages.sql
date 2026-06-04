-- R15.0 (бриф 04.06): печатник работает на образцах.
-- L2 RBAC: добавляем 'stage:sample_layout' в дефолтные права printer,
-- чтобы он мог продвигать заказ со стадии «Вёрстка образца» на «Печать образца».
-- Право 'stage:sample_print' у printer уже есть в ROLE_STAGE_PERMISSIONS (constants.js).
INSERT INTO k24_role_permissions (role, permission, allowed)
VALUES
  ('printer', 'stage:sample_layout', true),
  ('printer', 'stage:sample_print', true),
  ('printer', 'stage:color_approval', false)  -- согласование с заказчиком — только manager/admin
ON CONFLICT (role, permission) DO UPDATE
SET allowed = EXCLUDED.allowed,
    updated_at = now();
