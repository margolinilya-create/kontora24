-- 013_order_audit.sql — журнал изменений полей k24_orders для вкладки «История»
-- Аудит 8.05 (R7): «Добавить информацию по изменению информации в заказе».
-- Каждое изменение значимого поля даёт строку в k24_order_audit.

CREATE TABLE IF NOT EXISTS public.k24_order_audit (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES public.k24_orders(id) ON DELETE CASCADE,
  field_name  TEXT NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  changed_by  UUID REFERENCES public.k24_profiles(id),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_k24_order_audit_order_id ON public.k24_order_audit(order_id, changed_at DESC);

-- RLS — те же правила что и k24_order_status_history: чтение всем,
-- запись через триггер от имени authenticated.
ALTER TABLE public.k24_order_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "k24_order_audit_select" ON public.k24_order_audit;
CREATE POLICY "k24_order_audit_select" ON public.k24_order_audit
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "k24_order_audit_insert" ON public.k24_order_audit;
CREATE POLICY "k24_order_audit_insert" ON public.k24_order_audit
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Поля, изменения которых нужно отслеживать
-- (status — уже логируется в k24_order_status_history, не дублируем)
CREATE OR REPLACE FUNCTION public.log_order_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user UUID := auth.uid();
  v_field TEXT;
  v_old TEXT;
  v_new TEXT;
  v_fields TEXT[] := ARRAY[
    'number', 'client_id', 'order_type', 'qty', 'width_mm', 'height_mm',
    'film_type', 'lam_type', 'need_lam', 'design_status', 'priority',
    'is_partner', 'is_urgent', 'bopp_bag', 'design_variants',
    'stickers_per_pack', 'mockup_path', 'deadline', 'deal_name',
    'bitrix_deal_id', 'price_final', 'cost_materials', 'cost_labor',
    'markup', 'discount_pct', 'source', 'payment_status',
    'delivery_type', 'delivery_city', 'delivery_address', 'delivery_notes',
    'notes', 'assigned_to'
  ];
BEGIN
  -- Игнорируем INSERT и UPDATE служебных полей (updated_at, status)
  IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;

  FOREACH v_field IN ARRAY v_fields LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', v_field, v_field)
      INTO v_old, v_new USING OLD, NEW;
    IF v_old IS DISTINCT FROM v_new THEN
      INSERT INTO public.k24_order_audit (order_id, field_name, old_value, new_value, changed_by)
      VALUES (NEW.id, v_field, v_old, v_new, v_user);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_k24_orders_audit ON public.k24_orders;
CREATE TRIGGER trg_k24_orders_audit
  AFTER UPDATE ON public.k24_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.log_order_changes();
