# Error Handling Unification

Большой системный refactor обработки ошибок в Kontora24. Закрыта категория silent failures (~70 silent supabase awaits → все либо обёрнуты, либо явно defer'нуты с обоснованием).

## Что изменилось для пользователя

**До:**
- Работники видели технические ошибки Supabase: «duplicate key value violates unique constraint», «JWT expired», «Failed to fetch»
- При сетевой ошибке страница висела в Skeleton навсегда
- Кнопка «Попробовать снова» в ErrorBoundary зацикливалась если ошибка в данных
- Тихие сбои в производственных RPC (auto_deduct_materials и т.д.) — материалы расходились со складом, никто не узнавал
- Кликнул чекбокс операции — UI обновился, при reload оно исчезало (silent optimistic update)
- Создание клиента с одинаковым именем дважды → silent select fail → дубликат

**Стало:**
- Все ошибки — на человеческом русском с подсказкой что делать («Сессия устарела. Обновите страницу.»)
- При сетевой ошибке страницы показывают `<ErrorState/>` с кнопкой «Повторить»
- ErrorBoundary 2.0 с реальным recovery (не зацикливается), различает chunk load errors (другой UX «Приложение обновилось»), показывает eventId для саппорта
- Все non-critical RPC обёрнуты в `safeRpc` — упасть могут, но обязательно логируются в Sentry
- Optimistic updates с rollback — при сбое UI откатывается, юзер видит toast
- Создание клиента throw'ает на rare errors, не создаёт дубликат

## Что изменилось для разработчика

**Новые утилиты в `shared/lib/`:**
- `translateError(err)` — Supabase/network errors → Russian human text (11 patterns, 29 tests)
- `safeAsync(fn, opts)` — try/catch + Sentry + toast wrapper (для action handlers, 12 tests, документирован для future use)
- `safeRpc(name, params, ctx)` — для non-critical RPCs (логируется, не throw, 7 tests)

**Новые компоненты в `shared/components/`:**
- `<ErrorState error onRetry/>` — для error из хуков, mobile-friendly

**Расширения:**
- `captureError` теперь возвращает eventId (Sentry или synthetic в DEV; null если Sentry не инициализирован) — backward compatible, 33 caller'а игнорировали return value
- ErrorBoundary class теперь named-exported как `ErrorBoundaryInner` для тестов
- Хуки `useClients`, `useSettings`, `useCabinetStats`, `useProductionLogs`, `useShiftTracker`, `useReports` (4 sub-hooks), `useTimer`, `useProfiles`, `useMaterialTransactions` — все теперь экспортят `error` симметрично с `useMaterials`

## Архитектурные решения

- **Один тег `source: 'модуль.метод'`** во всех `captureError` calls (вместо flat tags). Чтобы единообразно фильтровать в Sentry.
- **`?? '—'` вместо `|| 0`** в UI карточек со статистикой. Различение между «загружено и реально 0» и «не удалось загрузить».
- **DB delete первым, storage вторым** в `OrderAttachments.handleDelete`. Перевернуто потому что orphan-файл в bucket безвреден, orphan-DB-запись на удалённый файл ломает ссылки.
- **Optimistic updates только с rollback**, никаких optimistic без snapshot.
- **PGRST116 special-case** в `useSettings`/`ClientDetailPage`/`useTimer`/`CreateOrderPage` — «no rows» это валидное состояние домена, не ошибка системы.
- **`safeRpc` vs `safeAsync` vs прямой `try/catch`** — три разные стратегии для разных классов: non-critical RPC (log-only), custom action handler (всё-в-одном), inline (наиболее частый случай).

## Тесты

- **Было:** 165 (по устаревшему CLAUDE.md)
- **Стало:** **354** (+189 кумулятивно с parent ветки)
- **Новые наши:** error-translator (29), safeAsync (12), safeRpc (7), ErrorBoundary (8) = **56 тестов**
- **Регрессий:** 0 (на каждом из 19 наших коммитов pre-commit hook прогонял весь suite)

## Backlog (вне scope этой ветки)

См. `progress/2026-05-06-phase4-final-audit.md` для полного списка. Главное:
- Раскол Supabase на 2 проекта (Kontora24 / PinheadOS — отдельный эпик)
- Lint debt cleanup (49/7 pre-existing errors в untouched файлах)
- Atomic `create_order_with_reserve` RPC (устранение partial state)
- ErrorBoundary E2E тесты на recovery flow (Playwright)
- Offline queue для production logs (IndexedDB)

## Известные ограничения

- При partial state в `createOrder` (заказ создан, `reserve_materials` упал) юзер видит toast «не удалось», но заказ остаётся в БД. Atomic RPC — отдельная задача (TODO в коде).
- `LoginForm` error handling вне scope (отдельный auth flow).
- `IntegrationLog.jsx` silent select оставлен (admin-only, low impact).

## Hotfix внутри ветки (важно для review)

Обнаружили что `.gitignore` имел нескопированное правило `logs` (строка 2), которое случайно матчило `src/features/production/components/logs/`. Два файла (`ProductionLogForm.jsx`, `ProductionLogHistory.jsx`) существовали локально на диске у разработчика, импортировались тремя компонентами, но **не были в git ни на одной ветке**. Локально build проходил (Vite читает с диска); cold clone / fresh CI / git-pull-based deploy упали бы с unresolved import.

**Hotfix `95c3b49`:** `.gitignore`: `logs` → `/logs` + добавил 2 призрачных файла в трекинг.

## Структура коммитов

См. `git log --oneline main..HEAD`. 19 наших коммитов в логической последовательности от foundation (translateError + ErrorState + safeAsync) до closure (ErrorBoundary 2.0 + audit).
