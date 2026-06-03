-- Migration 048: R12.0 — фундамент модуля «Планирование производства»
--
-- Сопровождает план R12 (бриф 2026-06-03, Google Doc 1bcAZt6G…). Создаёт
-- ровно один новый объект — таблицу ручных закреплений расписания. Сами
-- заказы / production_logs / subtasks страница НЕ модифицирует, читает
-- только то, что и так доступно admin+manager.
--
-- Также сидируется новое право `view:planning` для admin+manager и
-- дефолтные ключи в k24_settings (нормативы / штат / праздники 2026).
-- Эти ключи используются хуком useSettings('planning:...') в R12.1+.

-- ============================================================
-- 1. k24_plan_overrides — ручное закрепление этапа на конкретный день
-- ============================================================
-- §4.4 ТЗ дословно, имена адаптированы под код:
--   plan_overrides  → k24_plan_overrides
--   employees(id)   → k24_profiles(id)
-- Поле order_id — UUID FK на k24_orders (а не text, как в исходном ТЗ).

CREATE TABLE IF NOT EXISTS k24_plan_overrides (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES k24_orders(id) ON DELETE CASCADE,
  stage        TEXT NOT NULL,                 -- ключ этапа из ORDER_STATUSES
  pinned_date  DATE NOT NULL,                 -- день закрепления
  created_by   UUID REFERENCES k24_profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, stage)                    -- одно закрепление на этап
);

CREATE INDEX IF NOT EXISTS idx_plan_overrides_order ON k24_plan_overrides(order_id);
CREATE INDEX IF NOT EXISTS idx_plan_overrides_date  ON k24_plan_overrides(pinned_date);

COMMENT ON TABLE k24_plan_overrides IS
  'Ручные корректировки расписания производства (бета). Общие для всех пользователей.';

-- updated_at автообновление
CREATE OR REPLACE FUNCTION fn_plan_overrides_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_plan_overrides_updated_at ON k24_plan_overrides;
CREATE TRIGGER trg_plan_overrides_updated_at
BEFORE UPDATE ON k24_plan_overrides
FOR EACH ROW EXECUTE FUNCTION fn_plan_overrides_updated_at();

-- RLS: SELECT всем authenticated (страница доступна только admin+manager,
-- но фильтрация на уровне UI/AuthGuard, чтобы не блокировать realtime для
-- профилей у которых право включат позже). INSERT/UPDATE/DELETE — только
-- admin+manager. Паттерн как у k24_pack_designs (миграция 010).
ALTER TABLE k24_plan_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_overrides_select ON k24_plan_overrides;
CREATE POLICY plan_overrides_select ON k24_plan_overrides
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS plan_overrides_write ON k24_plan_overrides;
CREATE POLICY plan_overrides_write ON k24_plan_overrides
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM k24_profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM k24_profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')));

-- ============================================================
-- 2. Право view:planning — дефолт admin+manager
-- ============================================================
-- Аналогично 047_r11_rbac_seed.sql: остальные роли получают allowed=false,
-- админ может включить им через /settings → Права ролей.

INSERT INTO k24_role_permissions (role, permission, allowed)
VALUES
  ('admin',        'view:planning', true),
  ('manager',      'view:planning', true),
  ('designer',     'view:planning', false),
  ('printer',      'view:planning', false),
  ('post_printer', 'view:planning', false)
ON CONFLICT (role, permission) DO UPDATE SET allowed = EXCLUDED.allowed;

-- ============================================================
-- 3. Дефолтные настройки планировщика в k24_settings
-- ============================================================
-- Нормативы (§6.2 / §8.2 ТЗ + R11 этапы), ёмкости бакетов (§6.3 + ответ
-- пользователя про единый post_print бакет), госпраздники РФ 2026.
-- Структура value — jsonb (тот же формат, что у всех ключей k24_settings).
-- Используем ON CONFLICT DO NOTHING — если админ уже что-то менял, не
-- затираем. Если ключа нет — кладём дефолт.

INSERT INTO k24_settings (key, value)
VALUES (
  'planning:norms',
  jsonb_build_object(
    'design_days',          3,        -- 3 рабочих дня на дизайн
    'design_multiply_kinds', false,    -- ×kinds (открытый вопрос §13 №2 ТЗ)
    'verstka_minutes',      10,       -- sample_layout
    'sample_print_minutes', 10,
    'batch_layout_minutes_per_kind', 30,
    'prepress_minutes_per_kind',     30,
    'print_meters_per_30min',      1.5,
    'lamination_meters_per_20min', 1.5,
    'cutting_meters_per_15min',    1.5,
    'weeding_backgrounds_per_8h',  600,
    'resin_stickers_per_8h',       2184,
    'selection_stickers_per_8h',   2184,   -- R11 selection — консервативно как resin
    'assembly_packs_per_8h',       350,
    'packaging_packs_per_8h',      800,
    'otk_minutes',                 15,
    'drying_hours',                36
  )
) ON CONFLICT (key) DO NOTHING;

INSERT INTO k24_settings (key, value)
VALUES (
  'planning:capacity',
  jsonb_build_object(
    'designers',  1,   -- design bucket
    'prepress',   1,   -- prepress bucket
    'printers',   1,   -- oprl_print bucket (печатник делит печать+ламинацию+sample_print)
    'cutters',    2,   -- oprl_cut bucket (плоттеры)
    'post_print', 3,   -- единый бакет post_print (по ответу пользователя):
                       -- заливка+выборка+сборка+упаковка делят 3 человека
    'hours_per_day', 8
  )
) ON CONFLICT (key) DO NOTHING;

INSERT INTO k24_settings (key, value)
VALUES (
  'planning:holidays_2026',
  jsonb_build_array(
    -- Январские каникулы
    '2026-01-01', '2026-01-02', '2026-01-05', '2026-01-06',
    '2026-01-07', '2026-01-08',
    -- 23 февраля (понедельник)
    '2026-02-23',
    -- 8 марта (воскресенье — перенос на пн 9 марта)
    '2026-03-09',
    -- 1 мая (пятница)
    '2026-05-01',
    -- 9 мая (суббота — перенос на пн 11 мая)
    '2026-05-11',
    -- 12 июня (пятница)
    '2026-06-12',
    -- 4 ноября (среда)
    '2026-11-04',
    -- 31 декабря (четверг)
    '2026-12-31'
  )
) ON CONFLICT (key) DO NOTHING;
