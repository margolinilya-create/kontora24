-- 015_perf_indexes.sql — оптимизация скорости (R10 аудита 8.05).
-- Composite-индексы для частых запросов фронта + удаление дублей.

-- Удаляем дубли (idx_k24_*, оставляем idx_*)
DROP INDEX IF EXISTS public.idx_k24_orders_status;
DROP INDEX IF EXISTS public.idx_k24_orders_deadline;
DROP INDEX IF EXISTS public.idx_k24_orders_created_at;
DROP INDEX IF EXISTS public.idx_k24_orders_assigned_to;
DROP INDEX IF EXISTS public.idx_k24_orders_client_id;
DROP INDEX IF EXISTS public.idx_k24_material_transactions_created_at;
DROP INDEX IF EXISTS public.idx_k24_material_transactions_material_id;
DROP INDEX IF EXISTS public.idx_k24_material_transactions_order_id;
DROP INDEX IF EXISTS public.idx_k24_order_status_history_changed_by;
DROP INDEX IF EXISTS public.idx_k24_order_status_history_created_at;
DROP INDEX IF EXISTS public.idx_k24_order_status_history_order_id;

-- Composite индексы для частых WHERE/ORDER BY
CREATE INDEX IF NOT EXISTS idx_orders_status_deadline ON public.k24_orders (status, deadline) WHERE status NOT IN ('done','cancelled');
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON public.k24_orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prod_logs_order_active ON public.k24_production_logs (order_id, stage) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_prod_logs_worker_created ON public.k24_production_logs (worker_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_clients_name_lower ON public.k24_clients (lower(name));
CREATE INDEX IF NOT EXISTS idx_mat_tx_created ON public.k24_material_transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mat_tx_material_created ON public.k24_material_transactions (material_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_status_history_to_created ON public.k24_order_status_history (to_status, created_at DESC);

-- ANALYZE для актуализации статистики планировщика
ANALYZE public.k24_orders;
ANALYZE public.k24_production_logs;
ANALYZE public.k24_clients;
ANALYZE public.k24_material_transactions;
ANALYZE public.k24_order_status_history;
