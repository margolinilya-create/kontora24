# Phase 3 Inventory

Источник: grep по src/ (без test). Дата: 2026-05-06.

## Group A — `toast.error('Ошибка: ' + err.message)` (pure replacement)

Целевой паттерн из спеки. Замена: `toast.error(translateError(err).message)`.

| # | File | Line | Контекст |
|---|---|---|---|
| 1 | src/features/clients/components/ClientForm.jsx | 24 | Создание клиента |
| 2 | src/features/settings/components/ProfileCard.jsx | 23 | Сохранение имени профиля |
| 3 | src/features/settings/components/ProfileCard.jsx | 41 | Смена пароля |
| 4 | src/features/settings/components/BitrixSettings.jsx | 67 | Сохранение настроек Bitrix |
| 5 | src/features/production/components/MaterialConsumption.jsx | 62 | Запись расхода материала |
| 6 | src/features/production/components/CompleteTaskModal.jsx | 77 | Завершение этапа производства |
| 7 | src/features/production/components/logs/ProductionLogForm.jsx | 34 | Запись лога производства |
| 8 | src/features/production/hooks/useProductionBoard.js | 127 | Drag-end обработка статуса |
| 9 | src/features/orders/components/OrderEditForm.jsx | 38 | Редактирование заказа |
| 10 | src/features/orders/components/OrderAttachments.jsx | 64 | `'Ошибка загрузки: ' + err.message` (upload) |
| 11 | src/features/orders/components/OrderAttachments.jsx | 78 | Удаление вложения |
| 12 | src/features/orders/components/AdminOrderEditor.jsx | 130 | `'Ошибка: ' + (err.message \|\| 'Не удалось сохранить')` |
| 13 | src/features/orders/components/StatusSwitcher.jsx | 29 | Смена статуса заказа |
| 14 | src/features/orders/components/ClaimButton.jsx | 37 | Взять задачу в работу |
| 15 | src/features/orders/components/OrderComments.jsx | 55 | Комментарий к заказу |
| 16 | src/features/orders/components/OrderPdfExport.jsx | 122 | `'Ошибка PDF: ' + err.message` (export) |
| 17 | src/features/warehouse/components/StockModal.jsx | 33 | Изменение остатка материала |
| 18 | src/features/orders/pages/CreateOrderPage.jsx | 262 | `'Ошибка: ' + (err.message \|\| 'Не удалось создать заказ')` |
| 19 | src/features/warehouse/components/MaterialForm.jsx | 31 | Создание материала |
| 20 | src/features/analytics/pages/DashboardPage.jsx | 195 | Действие на дашборде |
| 21 | src/features/analytics/pages/AnalyticsPage.jsx | 87 | `'Ошибка: ' + e.message` (inline catch) |
| 22 | src/features/techcard/components/TechCardActions.jsx | 17 | `'Ошибка экспорта: ' + err.message` (PNG) |
| 23 | src/features/techcard/components/TechCardActions.jsx | 29 | `'Ошибка PDF: ' + err.message` |

**23 occurrences в 20 уникальных файлах.**

## Group B — `toast.error(err.message)` без 'Ошибка:' префикса (тоже сырые сообщения)

Тот же класс проблемы — пользователь видит raw Supabase text. Замена та же: `toast.error(translateError(err).message)`.

| # | File | Line | Контекст |
|---|---|---|---|
| 24 | src/features/settings/components/EditUserModal.jsx | 43 | Обновление пользователя |
| 25 | src/features/settings/components/CreateUser.jsx | 35 | Создание пользователя |
| 26 | src/features/techcard/components/StickerActions.jsx | 49 | Печать стикера |
| 27 | src/features/cabinet/pages/CabinetPage.jsx | 40 | clockIn (`catch (e) { toast.error(e.message) }`) |
| 28 | src/features/cabinet/pages/CabinetPage.jsx | 44 | clockOut |

**5 occurrences в 4 уникальных файлах.**

## Group C — Контекстный префикс + raw err.message (нужна частичная замена)

| # | File | Line | Текущий вид |
|---|---|---|---|
| 29 | src/features/production/hooks/useProductionBoard.js | 117 | `` `Заказ #${order.number} остановлен на "${ORDER_STATUSES[currentStatus]?.label \|\| currentStatus}": ${stepErr.message}` `` |

Замена: оставить префикс «Заказ #X остановлен на "Y":», но `stepErr.message` → `translateError(stepErr).message`. Префикс несёт ценный контекст (на каком статусе встал пайплайн), терять его нельзя.

**1 occurrence в файле уже учтённом в Group A.**

## Group D — Доменный fixed-текст (НЕ ТРОГАТЬ)

Это не raw err.message, а валидационные/инструктивные сообщения. translateError тут не нужен.

| File | Line | Текст | Почему не трогаем |
|---|---|---|---|
| ProfileCard.jsx | 31 | `'Минимум 6 символов'` | Валидация формы |
| SheetsImport.jsx | 14 | `'Вставьте CSV данные'` | Валидация |
| SheetsImport.jsx | 18 | `` `Ошибки: ${result.errors.length}` `` | Сводка по импорту, не ошибка системы |
| BitrixSettings.jsx | 44 | `'Введите URL вебхука'` | Валидация |
| BitrixSettings.jsx | 56 | `'Некорректный URL'` | Валидация |
| StickerActions.jsx | 25 | `'Ошибка экспорта PNG'` | Fixed-текст без err |
| StickerActions.jsx | 38 | `'Ошибка экспорта PDF'` | Fixed-текст без err |
| ProductionLogForm.jsx | 26 | `toast.error(error)` где `error` — string-результат локальной валидации | Form validation, не throw |
| EditableField.jsx | 15 | `'Ошибка сохранения'` | Fixed-текст без err |
| OrderAttachments.jsx | 36 | `'Файл слишком большой. Максимум 50 МБ.'` | Доменное правило |
| OrderDetailPage.jsx | 51 | `'Нет ссылки на файлы'` | Доменное состояние |
| shared/hooks/useDeadlineAlerts.js | 42 | `` `Просрочено: ${overdue.map(...).join(...)}` `` | Информационный alert |
| shared/lib/safeAsync.js | 25 | `toast.error(translateError(err).message)` | Это уже наш правильный паттерн |

## Out-of-scope (не toast.error)

| File | Line | Что | Решение |
|---|---|---|---|
| LoginForm.jsx | 37 | `setError(err.message \|\| 'Ошибка отправки')` — local state | Не toast; в ErrorState не идёт. Можно прогнать через translateError локально, но это extra-scope. **Отложить.** |
| LoginForm.jsx | 49 | `err.message?.includes('Invalid login') ? 'Неверный email или пароль' : err.message \|\| 'Ошибка входа'` | Уже есть кастомная обработка одного известного кейса. translateError тут поможет с остальными. **Отложить как nice-to-have.** |
| useMaterials.js | 28 | `setError(err.message \|\| 'Ошибка загрузки материалов')` | error в state хука — потребляется ErrorState через translateError. Сейчас передаётся string. **Поправить:** `setError(err)` чтобы translateError получил весь объект. Микро-фикс, можно сделать в Phase 3 заодно. |

## console.error (для Phase 4)

| # | File | Line | Контекст |
|---|---|---|---|
| 1 | src/shared/stores/sidebar-store.js | 38 | `console.error('Failed to fetch sidebar counts:', err)` |
| 2 | src/shared/hooks/useDeadlineAlerts.js | 51 | `console.error('Failed to check deadline alerts:', err)` |

Также в `src/shared/lib/sentry.js:22` есть `console.error('[captureError]', error, context)` — но это **внутри** реализации `captureError` для DEV-режима, intentional. Не трогаем.

## Итоговая статистика

| Категория | Кол-во | Файлов |
|---|---|---|
| Group A (pure 'Ошибка: ' + err.message) | 23 | 20 |
| Group B (bare err.message без префикса) | 5 | 4 |
| Group C (контекстный префикс + raw tail) | 1 | 0 новых (уже в A) |
| **Phase 3 targets total** | **29** | **24 уникальных** |
| Group D (fixed-text — не трогаем) | ~13 | — |
| console.error (Phase 4) | 2 | 2 |
| Out-of-scope (LoginForm, useMaterials setError) | 3 | 2 |

**Корректировка спеки:** в спеке указано «24 места». Фактически Phase 3 покрывает **29 точек в 24 файлах**. Расхождение — за счёт Group B (5 точек где разработчик написал `toast.error(err.message)` без префикса 'Ошибка: '). Поведение для пользователя то же — raw сообщение Supabase. Включаем в Phase 3 одной волной.
