-- Migration 011: персональные сохранённые фильтры заказов
CREATE TABLE IF NOT EXISTS k24_user_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_filters_user ON k24_user_filters(user_id);

ALTER TABLE k24_user_filters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k24_user_filters_select_own ON k24_user_filters;
CREATE POLICY k24_user_filters_select_own ON k24_user_filters
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS k24_user_filters_insert_own ON k24_user_filters;
CREATE POLICY k24_user_filters_insert_own ON k24_user_filters
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS k24_user_filters_update_own ON k24_user_filters;
CREATE POLICY k24_user_filters_update_own ON k24_user_filters
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS k24_user_filters_delete_own ON k24_user_filters;
CREATE POLICY k24_user_filters_delete_own ON k24_user_filters
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
