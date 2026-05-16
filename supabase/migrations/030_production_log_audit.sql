-- Migration 030: audit trail для k24_production_logs
--
-- Фидбэк менеджера 17.05: «нужно сохранить возможность откатить изменения,
-- в случае поломки системы». Сейчас редактирование лога переписывает значение
-- без истории; soft-delete через deleted_at оставляет одну версию.
--
-- Решение: триггер на INSERT/UPDATE/DELETE k24_production_logs пишет JSONB
-- снимок (old_data + new_data) + actor + операцию в k24_production_log_audit.
-- UI просмотра аудита подключается отдельно (R6.2).
--
-- БЕЗОПАСНОСТЬ: только CREATE TABLE IF NOT EXISTS + CREATE TRIGGER + RLS.
-- Не трогает существующие данные, не блокирует пишущие операции (AFTER trigger).

-- ============================================================
-- 1. ТАБЛИЦА АУДИТА
-- ============================================================
CREATE TABLE IF NOT EXISTS k24_production_log_audit (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id       UUID NOT NULL,
  order_id     UUID,
  operation    TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE', 'SOFT_DELETE')),
  old_data     JSONB,
  new_data     JSONB,
  actor_id     UUID REFERENCES k24_profiles(id),
  actor_role   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pl_audit_log_id    ON k24_production_log_audit(log_id);
CREATE INDEX IF NOT EXISTS idx_pl_audit_order_id  ON k24_production_log_audit(order_id);
CREATE INDEX IF NOT EXISTS idx_pl_audit_created   ON k24_production_log_audit(created_at DESC);

COMMENT ON TABLE k24_production_log_audit IS
  'Audit trail для k24_production_logs. Пишется триггером fn_audit_production_log на каждое INSERT/UPDATE/DELETE. SOFT_DELETE = UPDATE, выставляющий deleted_at.';

-- ============================================================
-- 2. ФУНКЦИЯ ТРИГГЕРА
-- ============================================================
CREATE OR REPLACE FUNCTION fn_audit_production_log() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
  v_op   TEXT;
  v_uid  UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NOT NULL THEN
    SELECT role INTO v_role FROM k24_profiles WHERE id = v_uid;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_op := 'INSERT';
  ELSIF TG_OP = 'DELETE' THEN
    v_op := 'DELETE';
  ELSIF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    v_op := 'SOFT_DELETE';
  ELSE
    v_op := 'UPDATE';
  END IF;

  INSERT INTO k24_production_log_audit (log_id, order_id, operation, old_data, new_data, actor_id, actor_role)
  VALUES (
    COALESCE(NEW.id, OLD.id),
    COALESCE(NEW.order_id, OLD.order_id),
    v_op,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END,
    v_uid,
    v_role
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ============================================================
-- 3. ТРИГГЕР
-- ============================================================
DROP TRIGGER IF EXISTS trg_audit_production_log ON k24_production_logs;
CREATE TRIGGER trg_audit_production_log
AFTER INSERT OR UPDATE OR DELETE ON k24_production_logs
FOR EACH ROW EXECUTE FUNCTION fn_audit_production_log();

-- ============================================================
-- 4. RLS — читать может только admin/manager. INSERT идёт через DEFINER-trigger
-- ============================================================
ALTER TABLE k24_production_log_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k24_pl_audit_select_priv ON k24_production_log_audit;
CREATE POLICY k24_pl_audit_select_priv ON k24_production_log_audit
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM k24_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

REVOKE INSERT, UPDATE, DELETE ON k24_production_log_audit FROM authenticated, anon;
