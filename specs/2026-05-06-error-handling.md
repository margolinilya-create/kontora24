# Spec: Унификация обработки ошибок

## Goal
Работник в цеху никогда не видит технических сообщений Supabase. Все ошибки переведены на человеческий русский с подсказкой что делать.

## Acceptance Criteria

AC1. Создана функция translateError(err) → {title, message, action?}
- Маппит >= 8 типичных ошибок (RLS, unique, FK, auth expired, network, permission, not found, generic)
- Возвращает русский текст без техжаргона
- Для неизвестных ошибок возвращает дефолтный fallback
- Покрыта unit-тестами (минимум 10 тест-кейсов)

AC2. Создана утилита safeAsync(fn, options) → Promise
- Перехватывает ошибки, шлёт в Sentry через captureError
- Опционально показывает toast (через translateError)
- Опционально вызывает onError callback
- Возвращает {data, error} вместо throw
- Покрыта тестами

AC3. Создан компонент <ErrorState error onRetry />
- Mobile-friendly (min-h-44px кнопки)
- Показывает translateError(error)
- Кнопка "Повторить" вызывает onRetry
- Кнопка "На главную" ведёт на /

AC4. 5 страниц используют ErrorState вместо игнорирования error из хуков:
- WarehousePage, ClientsPage, ProductionBoardPage, BitrixSettings, CabinetPage

AC5. Все 24 места 'Ошибка: ' + err.message заменены на toast.error(translateError(err).message)

AC6. console.error в sidebar-store.js и useDeadlineAlerts.js заменены на captureError

AC7. Молчаливые await в useOrders.js (auto_deduct_materials, consume_reservations, release_materials) обёрнуты с captureError при падении (но без блокировки основного потока — non-critical RPC)

## Non-Goals
- НЕ ErrorBoundary 2.0 (отдельная задача)
- НЕ optimistic updates (отдельная задача)
- НЕ offline queue (отдельная задача)
- НЕ переход на React Query
- НЕ менять бизнес-логику Supabase запросов

## Constraints
- Все UI-тексты на русском без англицизмов
- Mobile-first: кнопки >= 44px
- Не ломать существующие тесты (165 шт)
- Соблюдать feature-based архитектуру: утилиты в shared/, компонент в shared/components/
- Следовать существующему стилю кода (нет TS, JSX, Tailwind 4)
