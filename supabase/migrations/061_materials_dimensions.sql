-- R17.6: размеры позиций склада для БОПП-matching по габаритам изделия.
-- Бриф 5.06 #Склад: «учитывается запланированный расход нескольких бопп-пакетов
-- одновременно по одному заказу, хотя нужно подобрать самый подходящий размер
-- по ширине и длине, независимо от ориентации».
--
-- Менеджер заполнит width_mm/height_mm для существующих ~28 ПБ позиций
-- через UI /warehouse → редактирование материала. Backfill в этой миграции
-- не делаем — размеры на пакетах разные и нужны ручные значения.

BEGIN;

ALTER TABLE k24_materials
  ADD COLUMN IF NOT EXISTS width_mm INTEGER,
  ADD COLUMN IF NOT EXISTS height_mm INTEGER;

COMMENT ON COLUMN k24_materials.width_mm IS 'Для БОПП-пакетов и коробок — внутр. ширина в мм';
COMMENT ON COLUMN k24_materials.height_mm IS 'Длина в мм';

COMMIT;
