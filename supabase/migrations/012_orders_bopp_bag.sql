-- Migration 012: bopp_bag (Упаковка в БОПП-пакет)
-- Колонка добавлена в код в R7 2026-05 (CreateOrderPage чекбокс), но миграция
-- забылась — Supabase REST возвращал "Could not find the 'bopp_bag' column".
ALTER TABLE k24_orders ADD COLUMN IF NOT EXISTS bopp_bag BOOLEAN DEFAULT false;
COMMENT ON COLUMN k24_orders.bopp_bag IS 'Упаковка в БОПП-пакет (R7 2026-05)';
