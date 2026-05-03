-- Prevent stock from going negative
-- This ensures parallel material deductions cannot overdraw inventory

ALTER TABLE k24_materials ADD CONSTRAINT stock_qty_non_negative CHECK (stock_qty >= 0);
