-- Seed initial materials
INSERT INTO materials (type, name, stock_qty, unit, min_qty, unit_cost) VALUES
  ('film', 'Плёнка для печати', 100, 'm2', 10, 180),
  ('ink', 'Краска (экосольвент)', 5000, 'ml', 500, 0.12),
  ('lam_film', 'Ламинация матовая', 50, 'm2', 5, 120),
  ('lam_film', 'Ламинация глянцевая', 50, 'm2', 5, 120),
  ('resin', 'Эпоксидная смола', 2000, 'g', 200, 1.2);

-- Seed calculator settings
INSERT INTO settings (key, value) VALUES
  ('calculator', '{
    "printWidth": 1230,
    "heightMargin": 30,
    "gap": 6,
    "cutSpeed": 200,
    "lamSpeed": 200,
    "resinPerCm2": 0.1444,
    "resinPourTime": 1200,
    "laborCostPerHour": 500,
    "filmPricePerM2": 180,
    "inkPricePerM2": 120,
    "resinPricePerG": 1.2,
    "lamPricePerM2": 120
  }'::jsonb);
