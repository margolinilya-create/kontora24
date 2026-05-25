-- 038_order_items — R8.3 (серия 25.05)
--
-- Multi-variant заказы: один заказ может содержать N изделий разных
-- размеров и тиражей. Бриф 25.05: «строчки с показателями — ширина,
-- длина, тираж — для каждого вида изделия в заказе».
--
-- Архитектурное решение (зафиксировано пользователем):
-- новая таблица k24_order_items, не JSONB и не расширение pack_designs.
--
-- Backward compat:
-- - Триггер AFTER INSERT k24_orders создаёт один row idx=1 с основными
--   полями width_mm/height_mm/qty. Это даёт инвариант: у каждого заказа
--   гарантированно >=1 item.
-- - Backfill: для всех существующих заказов делаем то же.
-- - Frontend для multi-variant: после createOrder вставляет items idx>=2.
-- - При items_count=1: items[0] синхронизирован с order.w/h/qty.
-- - При items_count>1: order.qty = sum(items.qty) — frontend следит сам.

BEGIN;

CREATE TABLE IF NOT EXISTS k24_order_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES k24_orders(id) ON DELETE CASCADE,
  idx         INT NOT NULL DEFAULT 1,
  width_mm    NUMERIC NOT NULL,
  height_mm   NUMERIC NOT NULL,
  qty         INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, idx)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON k24_order_items(order_id);

COMMENT ON TABLE k24_order_items IS
  'Виды изделий в заказе (R8.3 серии 25.05). Один order_id может иметь N rows с разными w/h/qty. idx=1 синхронизирован с k24_orders.width_mm/height_mm/qty (через триггер и frontend).';

-- updated_at trigger
CREATE OR REPLACE FUNCTION fn_order_items_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_order_items_updated_at ON k24_order_items;
CREATE TRIGGER trg_order_items_updated_at
BEFORE UPDATE ON k24_order_items
FOR EACH ROW EXECUTE FUNCTION fn_order_items_updated_at();

-- Auto-create idx=1 для каждого нового заказа.
-- Если frontend хочет multi-variant — после createOrder делает INSERT items idx>=2.
CREATE OR REPLACE FUNCTION fn_create_default_order_item() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.width_mm IS NOT NULL AND NEW.height_mm IS NOT NULL AND NEW.qty IS NOT NULL THEN
    INSERT INTO k24_order_items (order_id, idx, width_mm, height_mm, qty)
    VALUES (NEW.id, 1, NEW.width_mm, NEW.height_mm, NEW.qty)
    ON CONFLICT (order_id, idx) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_default_order_item ON k24_orders;
CREATE TRIGGER trg_create_default_order_item
AFTER INSERT ON k24_orders
FOR EACH ROW EXECUTE FUNCTION fn_create_default_order_item();

-- Backfill: для всех существующих заказов создаём 1 item (если ещё нет).
INSERT INTO k24_order_items (order_id, idx, width_mm, height_mm, qty)
SELECT o.id, 1, o.width_mm, o.height_mm, o.qty
FROM k24_orders o
WHERE o.width_mm IS NOT NULL
  AND o.height_mm IS NOT NULL
  AND o.qty IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM k24_order_items it WHERE it.order_id = o.id AND it.idx = 1);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE k24_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_items_select" ON k24_order_items;
CREATE POLICY "order_items_select" ON k24_order_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM k24_profiles
    WHERE id = auth.uid()
      AND role IN ('admin','manager','designer','printer','post_printer')
  ));

DROP POLICY IF EXISTS "order_items_write" ON k24_order_items;
CREATE POLICY "order_items_write" ON k24_order_items
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM k24_profiles
    WHERE id = auth.uid()
      AND role IN ('admin','manager')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM k24_profiles
    WHERE id = auth.uid()
      AND role IN ('admin','manager')
  ));

COMMIT;
