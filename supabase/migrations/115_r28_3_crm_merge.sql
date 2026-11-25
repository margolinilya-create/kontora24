-- R28.3 — CRM: слияние дублей клиентов и контактов.
--
-- Только новые функции (SECURITY DEFINER, гейт crm:manage). Слияние клиента
-- перепривязывает k24_orders.client_id: на заказах срабатывают существующие
-- триггеры — protect_order_columns (admin/manager пропускает) и журнал
-- изменений log_order_changes (запишет смену клиента — это желаемый след).
-- Поглощённая запись не удаляется: merged_into + archived_at (обратимо вручную).
-- Откат: supabase/migrations/rollback/115_r28_3_crm_merge.down.sql

BEGIN;

CREATE OR REPLACE FUNCTION public.crm_merge_clients(p_keep uuid, p_drop uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_keep k24_clients%ROWTYPE;
  v_drop k24_clients%ROWTYPE;
  v_orders int; v_contacts int; v_deals int;
BEGIN
  IF NOT k24_has_permission('crm:manage') THEN
    RAISE EXCEPTION 'Нет права на объединение записей CRM' USING ERRCODE = '42501';
  END IF;
  IF p_keep IS NULL OR p_drop IS NULL OR p_keep = p_drop THEN
    RAISE EXCEPTION 'Нужно выбрать двух разных клиентов';
  END IF;

  SELECT * INTO v_keep FROM k24_clients WHERE id = p_keep FOR UPDATE;
  SELECT * INTO v_drop FROM k24_clients WHERE id = p_drop FOR UPDATE;
  IF v_keep.id IS NULL OR v_drop.id IS NULL THEN RAISE EXCEPTION 'Клиент не найден'; END IF;
  IF v_keep.merged_into IS NOT NULL OR v_drop.merged_into IS NOT NULL THEN
    RAISE EXCEPTION 'Один из клиентов уже объединён с другим';
  END IF;

  UPDATE k24_orders   SET client_id = p_keep WHERE client_id = p_drop;
  GET DIAGNOSTICS v_orders = ROW_COUNT;
  UPDATE k24_contacts SET client_id = p_keep WHERE client_id = p_drop;
  GET DIAGNOSTICS v_contacts = ROW_COUNT;
  UPDATE k24_deals    SET client_id = p_keep WHERE client_id = p_drop;
  GET DIAGNOSTICS v_deals = ROW_COUNT;
  UPDATE k24_crm_notes  SET client_id = p_keep WHERE client_id = p_drop;
  UPDATE k24_crm_tasks  SET client_id = p_keep WHERE client_id = p_drop;
  UPDATE k24_activities SET client_id = p_keep WHERE client_id = p_drop;

  -- Пустые поля основного заполняются из поглощённого; теги объединяются.
  UPDATE k24_clients SET
    inn      = COALESCE(inn, v_drop.inn),
    website  = COALESCE(website, v_drop.website),
    phone    = COALESCE(phone, v_drop.phone),
    email    = COALESCE(email, v_drop.email),
    comment  = CASE WHEN v_drop.comment IS NULL THEN comment
                    WHEN comment IS NULL THEN v_drop.comment
                    ELSE comment || E'\n' || v_drop.comment END,
    source   = COALESCE(source, v_drop.source),
    owner_id = COALESCE(owner_id, v_drop.owner_id),
    tags     = (SELECT array_agg(DISTINCT t) FROM unnest(COALESCE(tags, '{}') || COALESCE(v_drop.tags, '{}')) t),
    updated_at = now()
  WHERE id = p_keep;

  UPDATE k24_clients SET merged_into = p_keep, archived_at = COALESCE(archived_at, now()), updated_at = now()
   WHERE id = p_drop;

  INSERT INTO k24_activities (kind, actor_id, client_id, summary, meta)
  VALUES ('merge', auth.uid(), p_keep, 'Объединён с клиентом «' || v_drop.name || '»',
          jsonb_build_object('dropped_id', p_drop, 'orders', v_orders, 'contacts', v_contacts, 'deals', v_deals));

  RETURN jsonb_build_object('orders', v_orders, 'contacts', v_contacts, 'deals', v_deals);
END;
$$;
REVOKE ALL ON FUNCTION public.crm_merge_clients(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_merge_clients(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.crm_merge_contacts(p_keep uuid, p_drop uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_keep k24_contacts%ROWTYPE;
  v_drop k24_contacts%ROWTYPE;
  v_ident int; v_deals int;
BEGIN
  IF NOT k24_has_permission('crm:manage') THEN
    RAISE EXCEPTION 'Нет права на объединение записей CRM' USING ERRCODE = '42501';
  END IF;
  IF p_keep IS NULL OR p_drop IS NULL OR p_keep = p_drop THEN
    RAISE EXCEPTION 'Нужно выбрать два разных контакта';
  END IF;

  SELECT * INTO v_keep FROM k24_contacts WHERE id = p_keep FOR UPDATE;
  SELECT * INTO v_drop FROM k24_contacts WHERE id = p_drop FOR UPDATE;
  IF v_keep.id IS NULL OR v_drop.id IS NULL THEN RAISE EXCEPTION 'Контакт не найден'; END IF;
  IF v_keep.merged_into IS NOT NULL OR v_drop.merged_into IS NOT NULL THEN
    RAISE EXCEPTION 'Один из контактов уже объединён с другим';
  END IF;

  -- Каналы связи: совпадающие (kind + value_norm) у поглощённого удаляем, остальные переносим.
  DELETE FROM k24_contact_identities d
   WHERE d.contact_id = p_drop
     AND EXISTS (SELECT 1 FROM k24_contact_identities k
                  WHERE k.contact_id = p_keep AND k.kind = d.kind AND k.value_norm = d.value_norm);
  UPDATE k24_contact_identities SET contact_id = p_keep, is_primary = false WHERE contact_id = p_drop;
  GET DIAGNOSTICS v_ident = ROW_COUNT;

  UPDATE k24_deals      SET contact_id = p_keep WHERE contact_id = p_drop;
  GET DIAGNOSTICS v_deals = ROW_COUNT;
  UPDATE k24_crm_notes  SET contact_id = p_keep WHERE contact_id = p_drop;
  UPDATE k24_crm_tasks  SET contact_id = p_keep WHERE contact_id = p_drop;
  UPDATE k24_activities SET contact_id = p_keep WHERE contact_id = p_drop;

  UPDATE k24_contacts SET
    last_name = COALESCE(last_name, v_drop.last_name),
    position  = COALESCE(position, v_drop.position),
    client_id = COALESCE(client_id, v_drop.client_id),
    owner_id  = COALESCE(owner_id, v_drop.owner_id),
    notes     = CASE WHEN v_drop.notes IS NULL THEN notes
                     WHEN notes IS NULL THEN v_drop.notes
                     ELSE notes || E'\n' || v_drop.notes END
  WHERE id = p_keep;

  UPDATE k24_contacts SET merged_into = p_keep, archived_at = COALESCE(archived_at, now()) WHERE id = p_drop;

  RETURN jsonb_build_object('identities', v_ident, 'deals', v_deals);
END;
$$;
REVOKE ALL ON FUNCTION public.crm_merge_contacts(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_merge_contacts(uuid, uuid) TO authenticated;

COMMIT;
