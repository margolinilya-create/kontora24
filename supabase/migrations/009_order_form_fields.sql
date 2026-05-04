-- Migration: Add missing order form fields per documentation
-- New columns for: deal info, source, payment, film type update, delivery, design status, stickers_per_pack visibility

-- Deal info
ALTER TABLE k24_orders ADD COLUMN IF NOT EXISTS deal_name TEXT;

-- Source (Референт/Авито/Сайт/Сарафан/Повторный заказ/Другой)
ALTER TABLE k24_orders ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE k24_orders ADD COLUMN IF NOT EXISTS source_referrer TEXT;

-- Payment status
ALTER TABLE k24_orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'not_paid';

-- Design status (provided / needs_development)
ALTER TABLE k24_orders ADD COLUMN IF NOT EXISTS design_status TEXT DEFAULT 'provided';

-- Delivery
ALTER TABLE k24_orders ADD COLUMN IF NOT EXISTS delivery_type TEXT DEFAULT 'pickup';
ALTER TABLE k24_orders ADD COLUMN IF NOT EXISTS delivery_city TEXT;
ALTER TABLE k24_orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE k24_orders ADD COLUMN IF NOT EXISTS delivery_notes TEXT;

-- Update film_type default from 'white' to 'G'
ALTER TABLE k24_orders ALTER COLUMN film_type SET DEFAULT 'G';

-- RLS: these columns inherit existing row policies on k24_orders
