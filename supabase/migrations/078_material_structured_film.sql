-- Migration 078: структурные поля плёнки/ламинации в k24_materials
-- (запрос менеджера 05.07 — «пересобрать страницу материалов»).
--
-- Название позиции плёнки/ламинации должно собираться из полей:
--   manufacturer (производитель), product_line (название/серия плёнки),
--   roll_width_m (ширина рулона, м), finish (M/G — мат/глянец), color (цвет,
--   в т.ч. прозрачный). Отображаемое имя (name) собирается из них в UI при
--   сохранении (единый формат, без опечаток).
--
-- Здесь: добавляем колонки + предзаполняем 18 существующих позиций парсингом
-- текущих названий (менеджер потом проверяет/правит через форму). name НЕ
-- регенерируем — оставляем текущее до первого сохранения через новую форму,
-- чтобы неточность парсинга не испортила читаемые имена. Заодно нормализуем
-- unit → 'м' (была смесь 'm'/'m2', плёнка меряется в погонных метрах).

ALTER TABLE k24_materials
  ADD COLUMN IF NOT EXISTS manufacturer TEXT,
  ADD COLUMN IF NOT EXISTS product_line TEXT,
  ADD COLUMN IF NOT EXISTS roll_width_m NUMERIC,
  ADD COLUMN IF NOT EXISTS finish TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT;

ALTER TABLE k24_materials DROP CONSTRAINT IF EXISTS k24_materials_finish_chk;
ALTER TABLE k24_materials
  ADD CONSTRAINT k24_materials_finish_chk CHECK (finish IS NULL OR finish IN ('M','G'));

-- Плёнка/ламинация — погонные метры.
UPDATE k24_materials SET unit = 'м' WHERE type IN ('film','lam_film') AND unit IN ('m','m2');

-- Предзаполнение структурных полей (best-effort парсинг имён).
UPDATE k24_materials AS m SET
  manufacturer = v.manufacturer,
  product_line = v.product_line,
  roll_width_m = v.roll_width_m,
  finish       = v.finish,
  color        = v.color
FROM (VALUES
  -- film
  ('839a1925-6dd3-4e74-90d1-b5392f78baf7'::uuid, 'Dickson',  '3640', 1.26, 'M',  'Прозрачная'),
  ('aa6ae328-95b6-44a9-b4f0-267e65320774'::uuid, 'Duckson',  '3640', 1.26, 'G',  'Белая'),
  ('e69fe0dd-ab5d-4b02-9588-35df71433610'::uuid, 'Oracal',   '352',  1.0,  NULL, 'Золото'),
  ('967f3c49-119b-4980-a307-a74916bb034f'::uuid, 'Oracal',   '352',  1.0,  NULL, 'Серебро'),
  ('020b0db6-594f-46f3-99c8-28f1e8ee1a15'::uuid, 'Oraguard', NULL,   1.55, 'G',  'Прозрачная'),
  ('e0d4e2f7-6388-4879-97d0-e8d803657d7c'::uuid, 'Orajet',   '3640', 1.26, 'G',  'Белая'),
  ('f733ea31-290b-467f-a9de-d29939a6b4fa'::uuid, 'Orajet',   '3640', 1.26, 'M',  'Белая'),
  ('1b0c2ed5-9d42-4c36-8c9b-4dfd788f5b39'::uuid, 'Orajet',   '3640', 1.6,  'M',  'Белая'),
  ('fefa7a22-a7b6-4f7a-a2d2-dbebeda7dd1d'::uuid, 'Orajet',   '3640', 1.26, 'M',  'Прозрачная'),
  ('c65ec075-9f3e-4f8d-a69e-05d872d90eca'::uuid, NULL,       'Голографическая', 1.22, NULL, NULL),
  ('8ad453f6-8036-44dd-99c6-fb046c63bd30'::uuid, NULL,       'Мономерная',      NULL, 'G',  'Чёрная'),
  ('c738d373-a95a-4872-a78c-b2f28b3acedf'::uuid, NULL,       'Монтажная',       1.22, NULL, NULL),
  ('f8705b4c-e643-4780-b2a1-16983aac9fe7'::uuid, NULL,       'Светоотражающая', 0.5,  NULL, NULL),
  -- lam_film
  ('37823bf0-310a-46be-8034-50c2cd5ba886'::uuid, 'Dickson',  NULL,   1.26, 'G',  'Прозрачная'),
  ('4a3a4da1-65bb-45e0-b6cb-d9dc17322d13'::uuid, 'Duckson',  NULL,   1.26, 'M',  'Прозрачная'),
  ('371d3926-0f80-4301-a1cd-ff3be0b72c85'::uuid, 'Orajet',   '3640', 1.52, 'M',  'Прозрачная'),
  ('30e3d630-6375-427c-bc91-112c67d43259'::uuid, NULL,       'Монтажная', 1.26, NULL, NULL),
  ('5531a356-7573-40e1-8bed-0918ef13f83b'::uuid, NULL,       'Сахарная',  NULL, NULL, NULL)
) AS v(id, manufacturer, product_line, roll_width_m, finish, color)
WHERE m.id = v.id;
