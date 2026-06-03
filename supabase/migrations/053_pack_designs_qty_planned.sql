-- R14.3 (бриф 03.06): на этапе препресса для 3D-стикерпака/multi-variant
-- sticker3D менеджер вводит ПЛАН по каждому виду стикеров. Эти значения
-- становятся стартовым целевым количеством для подзадач (печать, резка,
-- заливка). Раньше использовали qty_target (от тиража × stickers_per_pack);
-- теперь plan может отличаться (например, +10% запас, или сокращение
-- одного из видов).
--
-- Дефолт 0 — означает «план не введён, использовать qty_target/qty»
-- (форвард-совместимость со старыми заказами).
BEGIN;

ALTER TABLE k24_pack_designs
  ADD COLUMN IF NOT EXISTS qty_planned INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN k24_pack_designs.qty_planned IS
  'План к печати, вводится на этапе prepress (R14.3). Если 0 — используется qty_target.';

-- Backfill: если qty_poured>0 значит препресс уже прошёл — для совместимости
-- используем qty_target как plan.
UPDATE k24_pack_designs
   SET qty_planned = qty_target
 WHERE qty_planned = 0
   AND qty_target > 0;

COMMIT;
