-- R14.2 (бриф 03.06): разделяем attachments на категории через колонку `kind`.
-- Это позволяет на этапе sample_print загружать фото образца, которое
-- отображается отдельно во вкладке «Обзор» (а не вперемешку с макетами клиента).
--
-- Значения:
--   'attachment'   — общий файл (макет, исходник, контракт и т.п.) — дефолт
--   'preview'      — лёгкое превью изображения макета (используется в тех-карте)
--   'sample_print' — фото распечатанного образца (R14.2 — менеджер на этапе
--                    sample_print заливает фото вместо учёта расхода)
BEGIN;

ALTER TABLE k24_order_attachments
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'attachment';

-- Backfill: легкие image-превью (≤2 МБ) — это уже tech-preview с drop-zone.
-- Path содержит 'tech-preview-' для R10+ (см. uploadAttachment в order-attachments.js).
UPDATE k24_order_attachments
   SET kind = 'preview'
 WHERE file_path LIKE '%/tech-preview-%';

ALTER TABLE k24_order_attachments
  DROP CONSTRAINT IF EXISTS chk_attachment_kind;
ALTER TABLE k24_order_attachments
  ADD CONSTRAINT chk_attachment_kind
  CHECK (kind IN ('attachment', 'preview', 'sample_print'));

CREATE INDEX IF NOT EXISTS k24_order_attachments_order_kind_idx
  ON k24_order_attachments(order_id, kind);

COMMIT;
