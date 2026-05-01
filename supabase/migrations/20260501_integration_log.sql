CREATE TABLE IF NOT EXISTS integration_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction TEXT NOT NULL, -- 'incoming' or 'outgoing'
  endpoint TEXT,
  payload JSONB,
  response JSONB,
  status TEXT NOT NULL, -- 'success', 'error', 'retry'
  error_message TEXT,
  order_id UUID REFERENCES orders(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_integration_log_created ON integration_log(created_at DESC);
CREATE INDEX idx_integration_log_status ON integration_log(status);
