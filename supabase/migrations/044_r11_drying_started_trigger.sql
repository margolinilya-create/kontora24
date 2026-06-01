-- Migration 044: R11.1 — триггер авто-set drying_started_at
-- При входе заказа/подзадачи на статус 'drying' автоматически фиксируется
-- момент старта (NOW()), от которого считается 36-часовой таймер.
--
-- Авто-advance по таймеру (pg_cron) добавится в R11.2. Сейчас менеджер
-- вручную переводит заказ дальше через StatusSwitcher / StatusOverride, но
-- drying_started_at уже доступен для UI таймера в R11.2.

CREATE OR REPLACE FUNCTION fn_set_drying_started_at()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  -- Вход на drying — фиксируем старт, если не выставлено вручную
  IF NEW.status = 'drying' AND (OLD.status IS DISTINCT FROM 'drying') AND NEW.drying_started_at IS NULL THEN
    NEW.drying_started_at := NOW();
  END IF;

  -- Выход с drying на любой другой статус — обнуляем (если потом снова войдём,
  -- таймер начнётся заново).
  IF NEW.status IS DISTINCT FROM 'drying' AND OLD.status = 'drying' THEN
    NEW.drying_started_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.fn_set_drying_started_at() SET search_path = public, pg_temp;

-- Заказы
DROP TRIGGER IF EXISTS trg_set_drying_started_at_orders ON k24_orders;
CREATE TRIGGER trg_set_drying_started_at_orders
BEFORE UPDATE OF status ON k24_orders
FOR EACH ROW
EXECUTE FUNCTION fn_set_drying_started_at();

-- Подзадачи (для STICKER trek в stickerpack3D и extra_stickers с 3D — R11.2/R11.3)
DROP TRIGGER IF EXISTS trg_set_drying_started_at_subtasks ON k24_order_subtasks;
CREATE TRIGGER trg_set_drying_started_at_subtasks
BEFORE UPDATE OF status ON k24_order_subtasks
FOR EACH ROW
EXECUTE FUNCTION fn_set_drying_started_at();
