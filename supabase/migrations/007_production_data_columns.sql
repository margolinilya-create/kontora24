-- Add production data columns to k24_orders
-- These fields are edited from the order detail page by workers
ALTER TABLE k24_orders ADD COLUMN IF NOT EXISTS printed_meters NUMERIC;
ALTER TABLE k24_orders ADD COLUMN IF NOT EXISTS resin_used NUMERIC;
ALTER TABLE k24_orders ADD COLUMN IF NOT EXISTS rejected_qty INTEGER;
ALTER TABLE k24_orders ADD COLUMN IF NOT EXISTS printed_qty INTEGER;
