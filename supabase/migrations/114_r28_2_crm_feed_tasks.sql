-- R28.2 — CRM: заметки, задачи, лента событий.
--
-- Боевая ERP → только аддитивно, и НИЧЕГО не вешаем на k24_orders:
-- история заказов в ленте читается из существующей k24_order_status_history.
-- Триггеры — только на CRM-таблице k24_deals (создание сделки, смена этапа);
-- тело обёрнуто в EXCEPTION → сбой ленты никогда не блокирует запись сделки.
-- Откат: supabase/migrations/rollback/114_r28_2_crm_feed_tasks.down.sql

BEGIN;

-- ===========================================================================
-- 1. Заметки
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.k24_crm_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body       text NOT NULL CHECK (length(trim(body)) > 0),
  pinned     boolean NOT NULL DEFAULT false,
  mentions   uuid[] NOT NULL DEFAULT '{}',
  client_id  uuid REFERENCES public.k24_clients(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.k24_contacts(id) ON DELETE CASCADE,
  deal_id    uuid REFERENCES public.k24_deals(id) ON DELETE CASCADE,
  author_id  uuid DEFAULT auth.uid() REFERENCES public.k24_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (client_id IS NOT NULL OR contact_id IS NOT NULL OR deal_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_crm_notes_client   ON public.k24_crm_notes (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_notes_contact  ON public.k24_crm_notes (contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_notes_deal     ON public.k24_crm_notes (deal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_notes_author   ON public.k24_crm_notes (author_id);
CREATE INDEX IF NOT EXISTS idx_crm_notes_mentions ON public.k24_crm_notes USING gin (mentions);

DROP TRIGGER IF EXISTS trg_crm_notes_updated_at ON public.k24_crm_notes;
CREATE TRIGGER trg_crm_notes_updated_at BEFORE UPDATE ON public.k24_crm_notes
  FOR EACH ROW EXECUTE FUNCTION public.k24_crm_touch_updated_at();

-- ===========================================================================
-- 2. Задачи
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.k24_crm_tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL CHECK (length(trim(title)) > 0),
  kind        text NOT NULL DEFAULT 'todo' CHECK (kind IN ('call', 'email', 'meeting', 'todo')),
  due_at      timestamptz,
  done_at     timestamptz,
  assignee_id uuid REFERENCES public.k24_profiles(id) ON DELETE SET NULL,
  client_id   uuid REFERENCES public.k24_clients(id) ON DELETE CASCADE,
  contact_id  uuid REFERENCES public.k24_contacts(id) ON DELETE CASCADE,
  deal_id     uuid REFERENCES public.k24_deals(id) ON DELETE CASCADE,
  notes       text,
  created_by  uuid DEFAULT auth.uid() REFERENCES public.k24_profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_assignee_open ON public.k24_crm_tasks (assignee_id, due_at) WHERE done_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_tasks_deal_open     ON public.k24_crm_tasks (deal_id) WHERE done_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_tasks_client        ON public.k24_crm_tasks (client_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_contact       ON public.k24_crm_tasks (contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_deal          ON public.k24_crm_tasks (deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_created_by    ON public.k24_crm_tasks (created_by);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_assignee      ON public.k24_crm_tasks (assignee_id);

DROP TRIGGER IF EXISTS trg_crm_tasks_updated_at ON public.k24_crm_tasks;
CREATE TRIGGER trg_crm_tasks_updated_at BEFORE UPDATE ON public.k24_crm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.k24_crm_touch_updated_at();

-- ===========================================================================
-- 3. Лента системных событий (пишут только триггеры; позже — каналы связи)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.k24_activities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id    uuid REFERENCES public.k24_profiles(id) ON DELETE SET NULL,
  client_id   uuid REFERENCES public.k24_clients(id) ON DELETE CASCADE,
  contact_id  uuid REFERENCES public.k24_contacts(id) ON DELETE CASCADE,
  deal_id     uuid REFERENCES public.k24_deals(id) ON DELETE CASCADE,
  order_id    uuid REFERENCES public.k24_orders(id) ON DELETE CASCADE,
  summary     text,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_activities_client  ON public.k24_activities (client_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_deal    ON public.k24_activities (deal_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_contact ON public.k24_activities (contact_id);
CREATE INDEX IF NOT EXISTS idx_activities_order   ON public.k24_activities (order_id);
CREATE INDEX IF NOT EXISTS idx_activities_actor   ON public.k24_activities (actor_id);

CREATE OR REPLACE FUNCTION public.k24_deals_log_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from text;
  v_to   text;
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      SELECT name INTO v_to FROM k24_crm_stages WHERE id = NEW.stage_id;
      INSERT INTO k24_activities (kind, actor_id, client_id, contact_id, deal_id, summary, meta)
      VALUES ('deal_created', auth.uid(), NEW.client_id, NEW.contact_id, NEW.id,
              'Создана сделка «' || NEW.title || '»', jsonb_build_object('stage', v_to, 'amount', NEW.amount));
    ELSIF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
      SELECT name INTO v_from FROM k24_crm_stages WHERE id = OLD.stage_id;
      SELECT name INTO v_to   FROM k24_crm_stages WHERE id = NEW.stage_id;
      INSERT INTO k24_activities (kind, actor_id, client_id, contact_id, deal_id, summary, meta)
      VALUES ('deal_stage', auth.uid(), NEW.client_id, NEW.contact_id, NEW.id,
              coalesce(v_from, '—') || ' → ' || coalesce(v_to, '—'),
              jsonb_build_object('from', v_from, 'to', v_to, 'lost_reason_id', NEW.lost_reason_id, 'lost_comment', NEW.lost_comment));
    END IF;
  EXCEPTION WHEN others THEN
    -- Лента — вторична: никогда не блокируем работу со сделкой.
    RAISE WARNING 'k24_deals_log_activity: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.k24_deals_log_activity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_deals_log_activity ON public.k24_deals;
CREATE TRIGGER trg_deals_log_activity
  AFTER INSERT OR UPDATE OF stage_id ON public.k24_deals
  FOR EACH ROW EXECUTE FUNCTION public.k24_deals_log_activity();

-- ===========================================================================
-- 4. RLS
-- ===========================================================================
ALTER TABLE public.k24_crm_notes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.k24_crm_tasks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.k24_activities ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.k24_crm_notes, public.k24_crm_tasks, public.k24_activities FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.k24_crm_notes, public.k24_crm_tasks TO authenticated;
GRANT SELECT ON public.k24_activities TO authenticated;  -- пишут только триггеры

-- Заметки: читают все с view:crm; пишет автор; правит/удаляет автор или crm:manage.
CREATE POLICY crm_notes_select ON public.k24_crm_notes FOR SELECT TO authenticated
  USING (public.k24_has_permission('view:crm'));
CREATE POLICY crm_notes_insert ON public.k24_crm_notes FOR INSERT TO authenticated
  WITH CHECK (public.k24_has_permission('crm:edit') AND author_id = (SELECT auth.uid()));
CREATE POLICY crm_notes_update ON public.k24_crm_notes FOR UPDATE TO authenticated
  USING (public.k24_has_permission('view:crm') AND (author_id = (SELECT auth.uid()) OR public.k24_has_permission('crm:manage')))
  WITH CHECK (public.k24_has_permission('view:crm'));
CREATE POLICY crm_notes_delete ON public.k24_crm_notes FOR DELETE TO authenticated
  USING (public.k24_has_permission('view:crm') AND (author_id = (SELECT auth.uid()) OR public.k24_has_permission('crm:manage')));

-- Задачи: свои (исполнитель/автор/без исполнителя) или все при crm:see_all.
CREATE POLICY crm_tasks_select ON public.k24_crm_tasks FOR SELECT TO authenticated
  USING (
    public.k24_has_permission('view:crm')
    AND (public.k24_has_permission('crm:see_all') OR assignee_id IS NULL
         OR assignee_id = (SELECT auth.uid()) OR created_by = (SELECT auth.uid()))
  );
CREATE POLICY crm_tasks_insert ON public.k24_crm_tasks FOR INSERT TO authenticated
  WITH CHECK (public.k24_has_permission('crm:edit'));
CREATE POLICY crm_tasks_update ON public.k24_crm_tasks FOR UPDATE TO authenticated
  USING (
    public.k24_has_permission('view:crm')
    AND (public.k24_has_permission('crm:see_all') OR assignee_id IS NULL
         OR assignee_id = (SELECT auth.uid()) OR created_by = (SELECT auth.uid()))
  )
  WITH CHECK (public.k24_has_permission('view:crm'));
CREATE POLICY crm_tasks_delete ON public.k24_crm_tasks FOR DELETE TO authenticated
  USING (public.k24_has_permission('view:crm') AND (created_by = (SELECT auth.uid()) OR public.k24_has_permission('crm:manage')));

CREATE POLICY activities_select ON public.k24_activities FOR SELECT TO authenticated
  USING (public.k24_has_permission('view:crm'));

-- ===========================================================================
-- 5. Гигиена грантов: default privileges Supabase выдают authenticated полный
--    набор (INSERT в ленту, TRUNCATE и т.п.). RLS это и так закрывает, но
--    оставляем только нужное — на всех CRM-таблицах R28.
-- ===========================================================================
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.k24_activities FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.k24_contacts, public.k24_contact_identities, public.k24_deals,
  public.k24_crm_pipelines, public.k24_crm_stages, public.k24_crm_lost_reasons, public.k24_crm_notes, public.k24_crm_tasks
  FROM authenticated;

-- ===========================================================================
-- 6. Бэкфилл ленты для уже созданных сделок (событие «создана»)
-- ===========================================================================
INSERT INTO public.k24_activities (kind, occurred_at, actor_id, client_id, contact_id, deal_id, summary)
SELECT 'deal_created', d.created_at, d.created_by, d.client_id, d.contact_id, d.id, 'Создана сделка «' || d.title || '»'
  FROM public.k24_deals d
 WHERE NOT EXISTS (SELECT 1 FROM public.k24_activities a WHERE a.deal_id = d.id AND a.kind = 'deal_created');

COMMIT;
