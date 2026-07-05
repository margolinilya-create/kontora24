-- Migration 074: форма стикера (ставка заливки) — менять только с order:edit
-- (ревью 05.07, major).
--
-- Дыра: R19 вывел селект shape_type в PackDesignsForm (виден работнику на
-- этапах заливки), а RLS 026 разрешает post_printer/printer UPDATE всех колонок
-- k24_pack_designs. Оплата считается по ТЕКУЩЕЙ форме на момент отчёта →
-- постпечатник мог проставить всем видам «сложная и большая» (2.0 ₽ вместо
-- 1.0 ₽) и задним числом поднять себе начисления во всех отчётах.
--
-- Правило — динамическое право order:edit из k24_role_permissions (паттерн 059
-- update_stock / 071 view), НЕ жёсткий список ролей: совпадает с гейтом в UI
-- (useCanDo('order:edit') в PackDesignsForm). auth.uid() IS NULL — серверные
-- контексты (service_role, триггеры сидов) пропускаем.
--
-- Известное ограничение (осознанно НЕ решаем сейчас): легитимная смена формы
-- менеджером ретроактивно меняет уже начисленные суммы — фиксация ставки в
-- логе на момент работы потребует schema-изменений, отдельная задача.

CREATE OR REPLACE FUNCTION public.k24_protect_pack_design_shape()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.shape_type IS DISTINCT FROM OLD.shape_type THEN
    IF auth.uid() IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM k24_profiles p
      JOIN k24_role_permissions rp ON rp.role = p.role
      WHERE p.id = auth.uid() AND rp.permission = 'order:edit' AND rp.allowed
    ) THEN
      RAISE EXCEPTION 'Access denied: изменение формы стикера требует права order:edit';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_pack_design_shape ON public.k24_pack_designs;
CREATE TRIGGER protect_pack_design_shape
  BEFORE UPDATE ON public.k24_pack_designs
  FOR EACH ROW
  EXECUTE FUNCTION public.k24_protect_pack_design_shape();

-- Та же дыра на order-level форме одиночного sticker3D: k24_orders.sticker_shape
-- редактируется воркером через открытую UPDATE-политику. Добавляем колонку в
-- существующий тригер защиты полей заказа (phase 2; он role-based — admin и
-- manager проходят, воркеры нет; полный текст сохранён, добавлена одна строка).
CREATE OR REPLACE FUNCTION public.k24_protect_order_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM k24_profiles WHERE id = auth.uid();

  -- Admin and manager can change anything
  IF v_role IN ('admin', 'manager') THEN
    RETURN NEW;
  END IF;

  -- Workers can only change: status, assigned_to, checklist, updated_at
  -- Block changes to financial and deal fields
  IF NEW.price_final IS DISTINCT FROM OLD.price_final
    OR NEW.cost_total IS DISTINCT FROM OLD.cost_total
    OR NEW.cost_materials IS DISTINCT FROM OLD.cost_materials
    OR NEW.cost_labor IS DISTINCT FROM OLD.cost_labor
    OR NEW.markup IS DISTINCT FROM OLD.markup
    OR NEW.discount_pct IS DISTINCT FROM OLD.discount_pct
    OR NEW.price_per_unit IS DISTINCT FROM OLD.price_per_unit
    OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
    OR NEW.deal_name IS DISTINCT FROM OLD.deal_name
    OR NEW.bitrix_deal_id IS DISTINCT FROM OLD.bitrix_deal_id
    OR NEW.qty IS DISTINCT FROM OLD.qty
    OR NEW.order_type IS DISTINCT FROM OLD.order_type
    OR NEW.client_id IS DISTINCT FROM OLD.client_id
    OR NEW.deadline IS DISTINCT FROM OLD.deadline
    OR NEW.priority IS DISTINCT FROM OLD.priority
    -- 074: форма стикера определяет ставку заливки — воркерам нельзя.
    OR NEW.sticker_shape IS DISTINCT FROM OLD.sticker_shape
  THEN
    RAISE EXCEPTION 'Access denied: workers cannot modify protected order fields';
  END IF;

  RETURN NEW;
END;
$$;
