-- ============================================================
-- R22.0 (ТЗ 20.07.2026, Фаза 6.4) — «нет прав» на Расход склада
-- ============================================================
-- Корень (аудит прода 22.07): RLS INSERT-политика k24_material_transactions
-- в проде требовала role IN ('admin','manager') — дрифт от репо
-- (20260503_security_hardening.sql задавала created_by = auth.uid()).
-- Воркер проходил клиентский гейт useCanDo('material:add_transaction')
-- и RPC update_stock (RBAC с 059), но падал на INSERT строки транзакции.
--
-- Новая политика — синхронна с логикой update_stock (059):
--   created_by = auth.uid() + право material:add_transaction роли
--   через k24_role_permissions (L2 RBAC, управляется из UI без миграций).
--
-- Rollback:
--   DROP POLICY material_transactions_insert;
--   CREATE POLICY ... WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "material_transactions_insert" ON k24_material_transactions;

CREATE POLICY "material_transactions_insert" ON k24_material_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
        FROM k24_profiles p
        JOIN k24_role_permissions rp
          ON rp.role = p.role
         AND rp.permission = 'material:add_transaction'
         AND rp.allowed
       WHERE p.id = auth.uid()
    )
  );

-- Идемпотентный re-seed права (повторяет 047/059/062; НЕ перетирает
-- явное allowed=false, выставленное админом через UI).
INSERT INTO k24_role_permissions (role, permission, allowed)
SELECT r.role, 'material:add_transaction', true
  FROM (VALUES ('admin'), ('manager'), ('designer'), ('printer'), ('post_printer')) AS r(role)
ON CONFLICT (role, permission) DO NOTHING;
