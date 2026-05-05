# Research: Унификация обработки ошибок

## Проблема
Системные баги в обработке ошибок:
1. 24 места показывают сырые сообщения Supabase пользователю ('Ошибка: ' + err.message)
2. 5 страниц (Warehouse, Clients, ProductionBoard, BitrixSettings, Cabinet) игнорируют error из хуков — при сетевой ошибке висят в Skeleton навсегда
3. Молчаливые await без try/catch в useOrders.js (auto_deduct_materials, consume_reservations, release_materials) и CompleteTaskModal — при падении RPC юзер не узнаёт, материалы расходятся
4. console.error вместо captureError в sidebar-store.js:38 и useDeadlineAlerts.js:51
5. ErrorBoundary без recovery: кнопка "Попробовать снова" зацикливается если ошибка в данных

## Контекст пользователей
Постпечатник в цеху на телефоне видит:
- "Ошибка: duplicate key value violates unique constraint"
- "Ошибка: new row violates row-level security policy"
- "Ошибка: JWT expired"
- "Ошибка: Failed to fetch" (потеря wifi)
Эти сообщения непонятны и не подсказывают что делать.

## Найденные паттерны (best practice)
- Supabase возвращает PostgrestError с полями code, details, hint, message
- Коды PostgreSQL: 23505 (unique), 23503 (FK), PGRST301 (RLS), 42501 (permission)
- Auth ошибки: AuthApiError с status 401/403
- Network: TypeError "Failed to fetch" / AbortError

## Решение
3 примитива (без рефакторинга архитектуры):
1. shared/lib/error-translator.js — pure function, маппит коды → {title, message, action}
2. shared/lib/safeAsync.js — обёртка вокруг try/catch с автоSentry + toast
3. shared/components/ErrorState.jsx — UI компонент для вывода ошибки из хуков с retry

Затем рефакторим точки использования.

## Альтернативы (отвергнуты)
- Supabase interceptor — нет такой возможности в @supabase/supabase-js
- React Query — слишком крупная миграция, не наш scope
- Кастомный fetch wrapper — Supabase SDK не использует fetch напрямую везде

## Решение по выбору
Тонкие утилиты + точечный рефакторинг — минимальный риск, видимый результат, легко откатить.
