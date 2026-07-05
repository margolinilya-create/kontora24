-- Migration 077: backfill material_code у позиций плёнки/ламинации, где тип
-- однозначно читается из названия (аудит 05.07, батч «себестоимость плёнки»).
--
-- Зачем: до R16.1 позиции без material_code не обновляли film_type при выборе
-- в форме и оценивались в 0 ₽ в legacy-фолбэке costForOrder. Теперь плёнка в
-- форме заказа обязательна (фронт), а код нужен для корректного film_type на
-- тех-карте/виджетах и как фолбэк для старых заказов без film_material_id.
--
-- Матчим по ТОЧНОМУ имени — коды присваиваем только там, где цвет/финиш явно
-- в названии. Позиции без стандартного кода (чёрная мономерная, светоотражающая,
-- сахарная, монтажная 1.6) НЕ трогаем — их код/тип решает менеджер.
--
-- unit_cost НЕ меняем: реальные закупочные цены — за менеджером. Позиции с
-- пустой/нулевой/отрицательной ценой вынесены в отчёт (см. сопроводительный
-- список), включая критичную Duckson G с отрицательным unit_cost.

UPDATE k24_materials SET material_code = 'G'
  WHERE type = 'film' AND material_code IS NULL
    AND name = 'Orajet 3640 белая (Глянцевая) (шир-1.26 м)';

UPDATE k24_materials SET material_code = 'M'
  WHERE type = 'film' AND material_code IS NULL
    AND name IN ('Orajet 3640 белая (Матовая) (шир-1.26 м)',
                 'Orajet 3640 белая (Матовая) (шир-1.6 м)');

UPDATE k24_materials SET material_code = 'Transparent_M'
  WHERE type = 'film' AND material_code IS NULL
    AND name = 'Orajet 3640 прозрачная (Матовая) (шир-1.26 м)';

UPDATE k24_materials SET material_code = 'glossy'
  WHERE type = 'lam_film' AND material_code IS NULL
    AND name = 'Dickson прозрачная (Глянцевая) (шир-1.26 м)';

UPDATE k24_materials SET material_code = 'matte'
  WHERE type = 'lam_film' AND material_code IS NULL
    AND name = 'Orajet 3640 прозрачная (Матовая) 1.52 м';
