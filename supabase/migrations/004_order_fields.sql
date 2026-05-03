-- New order fields for enhanced calculator (from kontorasales model)
ALTER TABLE k24_orders ADD COLUMN IF NOT EXISTS film_type TEXT DEFAULT 'white';
ALTER TABLE k24_orders ADD COLUMN IF NOT EXISTS stickers_per_pack INT;
ALTER TABLE k24_orders ADD COLUMN IF NOT EXISTS is_3d BOOLEAN DEFAULT false;
ALTER TABLE k24_orders ADD COLUMN IF NOT EXISTS mockup_path TEXT;
ALTER TABLE k24_orders ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN DEFAULT false;
ALTER TABLE k24_orders ADD COLUMN IF NOT EXISTS is_partner BOOLEAN DEFAULT false;
ALTER TABLE k24_orders ADD COLUMN IF NOT EXISTS needs_montage_film BOOLEAN DEFAULT false;
ALTER TABLE k24_orders ADD COLUMN IF NOT EXISTS needs_individual_cut BOOLEAN DEFAULT false;
