-- R17.1: разрешить редактирование/удаление комментариев к заказу.
-- Бриф 5.06 СТРАНИЦЫ производства / Страница заказа:
-- «Сейчас можно добавлять комментарии, но нельзя редактировать их. Давай
-- добавим возможность редактирования комментариев всем сотрудникам».
--
-- Решение: автор может update/delete свои комментарии; admin и manager —
-- любые. Поле updated_at для аудита, hard-delete (без soft-delete).

BEGIN;

-- updated_at для отслеживания редакторских правок.
ALTER TABLE k24_order_comments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Триггер: при UPDATE сетить updated_at = now().
CREATE OR REPLACE FUNCTION fn_set_order_comments_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.text IS DISTINCT FROM OLD.text THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_comments_updated_at ON k24_order_comments;
CREATE TRIGGER trg_order_comments_updated_at
  BEFORE UPDATE ON k24_order_comments
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_order_comments_updated_at();

-- RLS: разрешаем UPDATE автору или admin/manager.
DROP POLICY IF EXISTS "order_comments_update" ON k24_order_comments;
CREATE POLICY "order_comments_update" ON k24_order_comments
  FOR UPDATE TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM k24_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM k24_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- RLS: разрешаем DELETE автору или admin/manager.
DROP POLICY IF EXISTS "order_comments_delete" ON k24_order_comments;
CREATE POLICY "order_comments_delete" ON k24_order_comments
  FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM k24_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

COMMIT;
