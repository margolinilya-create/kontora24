-- Performance indexes for common query patterns
-- These indexes speed up filtering, sorting, and joins used across the app

-- Orders: most queried table, needs indexes on common filter columns
CREATE INDEX IF NOT EXISTS idx_k24_orders_status ON k24_orders(status);
CREATE INDEX IF NOT EXISTS idx_k24_orders_assigned_to ON k24_orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_k24_orders_client_id ON k24_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_k24_orders_created_at ON k24_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_k24_orders_deadline ON k24_orders(deadline) WHERE deadline IS NOT NULL;

-- Order comments: always queried by order_id
CREATE INDEX IF NOT EXISTS idx_k24_order_comments_order_id ON k24_order_comments(order_id);

-- Order attachments: always queried by order_id
CREATE INDEX IF NOT EXISTS idx_k24_order_attachments_order_id ON k24_order_attachments(order_id);

-- Status history: queried for timeline and reports
CREATE INDEX IF NOT EXISTS idx_k24_order_status_history_order_id ON k24_order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_k24_order_status_history_created_at ON k24_order_status_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_k24_order_status_history_changed_by ON k24_order_status_history(changed_by);

-- Material transactions: queried for consumption reports
CREATE INDEX IF NOT EXISTS idx_k24_material_transactions_material_id ON k24_material_transactions(material_id);
CREATE INDEX IF NOT EXISTS idx_k24_material_transactions_order_id ON k24_material_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_k24_material_transactions_created_at ON k24_material_transactions(created_at DESC);

-- Time entries: queried by order and user
CREATE INDEX IF NOT EXISTS idx_k24_time_entries_order_id ON k24_time_entries(order_id);
CREATE INDEX IF NOT EXISTS idx_k24_time_entries_user_id ON k24_time_entries(user_id);
