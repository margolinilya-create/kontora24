# Kontora24 — MES/WMS для стикерного производства

Контора — типография, специализирующаяся на стикерах. Делаем всё что клеится: стикеры, этикетки, стикерпаки, широкоформатные наклейки, трафареты. Виниловые, со смолой (3D), выпуклые, объёмные — на голографической, металлизированной плёнках. Разработаем макет по брифу от заказчика и произведём тираж продукции. Специализируемся на 3D стикерах. Гарантируем результат, который понравится!

Kontora24 — максимально упрощённая система учёта заказов и отчётность по ним на каждом этапе производства.
CRM — Bitrix24 (интеграция через webhooks, пока не подключена к реальному Bitrix24).

**Production:** https://kontora24.vercel.app · **Старт продакшна:** 2026-05-11 (R-апдейт + очистка БД + L2 RBAC)

## Стек

| Слой | Технология |
|------|-----------|
| Сборка | Vite 8 |
| UI | React 19 + JSX |
| Роутинг | React Router v7 |
| Стейт | Zustand 5 |
| DnD | @dnd-kit/core |
| Формы | React Hook Form + Zod |
| Стили | Tailwind CSS 4 (light + dark) |
| Графики | Recharts 3 |
| PDF | jsPDF + html2canvas |
| QR | qrcode.react |
| Errors | Sentry (@sentry/react) |
| БД + Auth | Supabase (PostgreSQL + RLS + Realtime + Storage) |
| Деплой | Vercel (auto) |
| CI/CD | GitHub Actions |

**Supabase project:** `pulzirakjqehsulmjhdj` (eu-west-1) — dedicated с 2026-05-11 (PinheadOS отделён в `glhwbktsokphgksdvcxj`). Таблицы с префиксом `k24_` (исторически — был период shared, префикс сохраняем).

## Роли

| Роль | Доступ |
|------|--------|
| admin | Технический аккаунт владельца. Всё включая настройки и пользователей. В ежедневной работе НЕ используется |
| manager | Руководитель производства. Заказы, Клиенты, Аналитика, Производство, **ОТК и выдача**. Видит финансы |
| designer | Dashboard + Дизайн + Препресс |
| printer | Dashboard + Препресс + Печать + Ламинация + Резка (+ помощь на постпечати) |
| post_printer | Dashboard + Заливка + Выборка + Сборка 3D + Упаковка |

## Команды

```bash
npm run dev            # Dev server (Vite)
npm run build          # Production build
npm run preview        # Preview production build
npm test               # Run tests (Vitest, 507 тестов)
npm run lint           # ESLint
npm run check          # lint + test + build
npm run test:e2e       # Playwright e2e tests
npm run test:e2e:mobile # Playwright mobile tests
npx vercel deploy --yes --prod --scope margolinilya-creates-projects  # Deploy
```

## Производственный цикл (3 маршрута)

**Обычный стикер/стикерпак:**
`new → design → prepress → print → [lamination] → cutting → packaging → otk → done`

**3D стикер:**
`new → design → prepress → print → cutting → pouring → packaging → otk → done`

**3D стикерпак (два параллельных трека: фоны + стикеры):**
`new → design → prepress → print* → [lamination**] → cutting* → selection_pouring* → assembly_3d → packaging → otk → done`

`*` — двухтрековые стадии: на карточке два прогресс-бара (Фоны / Стикеры), заказ продвигается когда ОБА трека завершены.
`**` — ламинация пропускается при need_lam=false. Для 3D стикерпаков ламинация только на фонах.

**Статусы (19):** new, design, sample_layout, sample_print, color_approval, batch_layout, prepress, print, lamination, cutting, selection_pouring, pouring, drying, selection, assembly_3d, packaging, otk, done, cancelled

С R11.0 (31.05) добавлены 6 новых этапов под бриф «кардинальная перестройка маршрутов»: sample workflow (sample_layout/sample_print/color_approval/batch_layout) перед основным циклом, сушка 36ч (drying) для 3D-типов, выборка штучных стикеров (selection) для sticker3D. В R11.0 они только в БД и константах — `ORDER_ROUTES` пока не меняется, UI новых этапов появится в R11.1.

**Skip-stages:** `getOrderRoute(order)` фильтрует маршрут по флагам:
- `design_status === 'provided'` → пропускается стадия `design` (макет от клиента, сразу в `prepress`)
- `need_lam === false` → пропускается `lamination`
- `bopp_bag === false && order_type NOT IN ('stickerpack3D','sticker3D')` → пропускается `packaging` (R-апдейт 11.05 + фидбэк 28.05). Упаковка обязательна для всех 3D-заказов (`sticker3D` + `stickerpack3D`), для остальных типов — только при наличии БОПП-пакета
- 3D-стадии (`pouring`, `selection_pouring`, `assembly_3d`) уже разруливаются через `ORDER_ROUTES` per-type

`isStageAllowed(order, stage)` валидирует переход. `updateOrderStatus(...)` бросает ошибку при попытке перейти на стадию вне маршрута; `{ isRollback: true }` или `{ force: true }` — admin escape (используется в `StatusOverride` и кнопке возврата в `OrderStepper`). DnD-канбан блокирует колонки запрещённых этапов через `useDroppable({ disabled: !isStageAllowed(...) })`. Если статус уже вне маршрута (грязные данные), `OrderStepper` показывает предупреждение и кнопку «Вернуть на корректный этап».

**Типы заказов (в коде):** sticker_cut, sticker_kiss, stickerpack, sticker3D, stickerpack3D, rect, big

**Ламинация:** matte (матовая), glossy (глянцевая), transfer (монтажная плёнка 1.26 м — добавлено в R8.2 серии 25.05), null (без ламинации). Хелпер [needsLamination(lamType)](src/shared/constants.js) — единая проверка нужности стадии lamination. UI-лейбл «Ламинация» → «Ламинация / перенос на монтаж».

**Плёнка (film_type):** G (глянцевая), M (матовая), Transparent_G (прозрачная глянцевая), Transparent_M (прозрачная матовая), Holo (голографическая), Gold (золотая), Chrome (хром) — default 'G'.

## Структура заказа (входящие данные)

Данные приходят из Bitrix24 через webhook (read-only в Kontora24) или вводятся вручную при создании заказа.
Форма создания заказа (`CreateOrderPage`) разделена на 3 секции: Сделка / Заказ / Отгрузка.

**Обязательные поля при ручном создании** (R-апдейт 11.05): `order_type`, `qty`, `width_mm`, `height_mm`, `price_final`, `client_name`, `deadline`. Без них Zod-валидация блокирует submit. Webhook из Bitrix создаёт заказы даже с пустыми полями — менеджер дозаполнит через AdminOrderEditor (комментарий в `api/bitrix/incoming.js`).

**Drop-zone превью** в правом блоке формы создания заказа: менеджер может drag-and-drop'нуть JPG/PNG/WEBP до 2 МБ. Файл сохраняется в `k24_order_attachments` после `createOrder()` (нужен `order.id`). Та же картинка автоматически попадает в тех-карту (через `findPreviewAttachment` из `order-attachments.js`).

### По сделке

| Поле | Код | Тип | Детали |
|------|-----|-----|--------|
| Название сделки | `deal_name` | текст | НЕ название компании (иначе половина заказов «Пинхед») |
| Номер сделки | `bitrix_deal_id` | текст | ID сделки в Bitrix24, + внутренний `number` (автоинкремент) |
| Стоимость (бюджет) | `price_final` | число | Видна только admin + manager |
| Дедлайн | `deadline` | дата | «Не позднее чем» |
| Дата приёма заказа | `created_at` | дата | Автоматически = сегодня |
| Партнёрский | `is_partner` | bool | Партнёрский (-25%) / Клиентский |
| Источник | `source` | выбор | `referrer` / `avito` / `website` / `word_of_mouth` / `repeat` / `other` |
| Имя референта | `source_referrer` | текст | Показывается только при source=referrer |
| Оплата | `payment_status` | выбор | `not_paid` / `sbp_tochka` / `ip_chikrizov_vtb` / `pinhead_fabrika` / `aventa` / `pinhead_studio` / `cash` / `barter` |

### По заказу

| Поле | Код | Тип | Варианты / детали |
|------|-----|-----|----------|
| Тип продукции | `order_type` | выбор | `sticker_cut` / `sticker_kiss` / `stickerpack` / `sticker3D` / `stickerpack3D` / `rect` / `big` |
| Произвольный номер | `custom_number` | текст | Опциональный отображаемый номер. NULL → используется число `number` без префикса (R-апдейт 12.05 — префикс ORD- убран в UI; сохраняется только в slug имён файлов через `orderFileSlug`) |
| Материал (плёнка) | `film_type` | выбор | `G` / `M` / `Transparent_G` / `Transparent_M` / `Holo` / `Gold` / `Chrome`. Для `stickerpack3D` — это плёнка ФОНОВ |
| Плёнка стикеров | `film_type_stickers` | выбор | Только для `stickerpack3D` (отдельно от плёнки фонов). NULL для остальных типов |
| Ламинация / перенос | `lam_type` | выбор | `matte` (матовая) / `glossy` (глянцевая) / `transfer` (монтажная плёнка 1.26 м) / пусто (без) |
| Размер | `width_mm` / `height_mm` | мм | + быстрые пресеты: A7 (74x105), A6 (105x148), A5 (148x210) |
| Тираж | `qty` | число | Количество единиц, минимум 1 |
| Стикеров в паке | `stickers_per_pack` | число | Показывается только для stickerpack / stickerpack3D |
| Видов дизайна | `design_variants` | число | Минимум 1, по умолчанию 1 |
| Дизайн макета | `design_status` | выбор | `provided` (предоставлен заказчиком) / `needs_development` (требуется разработка) |
| Ссылка на макет | `mockup_path` | текст | Путь к файлу на внутреннем сервере |
| Заказчик | `client_name` → `client_id` | текст | Автопоиск/создание клиента в `k24_clients` |
| Приоритет | `priority` | выбор | `urgent` (срочный) / `normal` (обычный). В БД остаются `low`/`high` для совместимости со старыми заказами; новые формы используют только два варианта (R7 2026-05). |
| Комментарий | `notes` | текст | Особенности заказа, доп. услуги |

### Отгрузка

| Поле | Код | Тип | Варианты |
|------|-----|-----|----------|
| Получение | `delivery_type` | выбор | `pickup` (самовывоз) / `delivery` (доставка) |
| Город отгрузки | `delivery_city` | текст | Показывается при delivery_type=delivery |
| Адрес отгрузки | `delivery_address` | текст | Показывается при delivery_type=delivery |
| Комментарий к доставке | `delivery_notes` | текст | Показывается при delivery_type=delivery |

### Детали каждого этапа

| Этап | Статус | Кто | Что делает | Данные при завершении |
|------|--------|-----|-----------|----------------------|
| Дизайн | design | designer | Рисует макет, добавляет ссылку на внутренний диск (макет готовый к препрессу) | Ссылка на макет (хранится в заказе) |
| Препресс | prepress | designer, printer | Цветокоррекция, раскладка на лист, экспорт для плоттера | — |
| Печать | print | printer | Загружает файл в плоттер, печатает на плёнке | Стикеры (шт), фоны (шт) — для 3D-стикерпака через две группы полей без radio-выбора. Расход плёнки в м (тип плёнки берётся из заказа: `film_type` или `film_type_stickers`) |
| Ламинация | lamination | printer | Ламинирует напечатанные листы | Заламинировано (шт) + брак (шт) + ламинация (м). Валидация: не больше чем поступило с предыдущего этапа |
| Резка | cutting | printer | Плоттерная резка (die cut / kiss cut) | Нарезано (с учётом track для 3D-стикерпака) + брак. Валидация: не больше чем поступило |
| Заливка | pouring | post_printer | Заливает эпоксидной смолой, ручной контроль сушки | Залито, хороших, брак, граммы смолы |
| Выборка/Заливка | selection_pouring | post_printer | Выборка фонов + заливка стикеров (параллельно) | Выбрано фонов (track=backgrounds), хороших стикеров (track=stickers), смола — отдельным логом. **Без поля брак** (по ТЗ 11.05) |
| Сборка 3D | assembly_3d | post_printer | Наклеивает залитые стикеры на фоны | Кол-во собранных паков |
| Упаковка | packaging | post_printer | Упаковывает в пакеты/коробки | Упаковано + брак. **Можно ввести больше тиража** (по ТЗ 11.05). Этап пропускается если `!bopp_bag && order_type !== 'stickerpack3D'` |
| ОТК | otk | manager | Проверка качества, выдача клиенту | — |

### Материалы

| Тип | Единица | Когда расходуется |
|-----|---------|-------------------|
| Плёнка | м² | Печать |
| Краска | мл | Печать |
| Ламинация | м² | Ламинация |
| Смола | г | Заливка (только 3D) |
| Упаковочные пакеты | шт | Упаковка |
| Коробки | шт | Упаковка |

## Архитектура — Feature-based

```
src/
  main.jsx                # Entry point (React, Sentry, service worker)
  app/
    App.jsx               # Root component
    routes.jsx            # Route definitions
  assets/
    kontora-logo.png
    kontora-logo-white.png
    fonts/BebasNeue-Regular.ttf
  styles/
    globals.css           # Tailwind + light/dark theme
  features/
    auth/
      store.js            # Auth state (Zustand)
      components/         # LoginForm, AuthGuard
      hooks/useAuth.js
    orders/
      pages/              # OrdersPage (3 вида: список карточками / DnD-канбан / календарь),
                          #   OrderDetailPage (header + Stepper + Tabs), CreateOrderPage (1 экран)
      components/         # OrdersKanban (DnD по отделам), OrderStepper (тонкая лента),
                          #   OrderProgressTab, OrderReportsTab, OrderHistoryTab, FinanceTab,
                          #   OrderTimeline (legacy, переписан на Stepper), DepartmentTimeline,
                          #   OrderAttachments, OrderComments, OrderStageInput, OrderPdfExport,
                          #   AdminOrderEditor (7 секций инлайн: Сделка / Заказчик /
                          #     Продукт / Отгрузка / Производство / Финансы / Примечания),
                          #   StatusSwitcher (только → next), StatusOverride (← откат на пройденные),
                          #   StatusBadge, DateRangeFilter, DepartmentFilter, SavedFilters (БД),
                          #   EditableField, InfoField
      hooks/useOrders.js  # updateOrderStatus(orderId, from, to, { isRollback?, force? })
      lib/order-attachments.js  # uploadAttachment, deleteAttachment, validatePreviewFile
                                # — DRY-хелперы между OrderAttachments и TechCardPreviewSlot
    production/
      pages/              # QueuePage (unified) + 10 очередей по этапам
                          # (ProductionBoardPage удалён в R6 — DnD переехал в OrdersKanban)
      components/         # DraggableCard (без таймера/claim), QueueCard, BatchView,
                          #   OperationChecklist, CompleteTaskModal, MaterialConsumption,
                          #   ProductionCalendar (полный месяц + bottom-sheet),
                          #   PackDesignsForm (виды стикеров), PipelineSummary
      hooks/              # useProductionLogs (deleted_at, updateLog/softDeleteLog),
                          #   useShiftTracker (clockOut с optimistic+revert),
                          #   useProductionBoard ({ includeArchived }),
                          #   usePackDesigns
        logs/             # ProductionLogForm, ProductionLogHistory, StageProgressBar
      hooks/              # useProductionLogs, useShiftTracker, useTimer
      lib/production-logs.js  # STAGE_FIELDS, dual-track progress
    techcard/
      components/         # TechCard (A4, принимает editable + drop-zone в плашке превью),
                          #   TechCardPreviewSlot (drop-zone на странице заказа),
                          #   TechCardActions (PNG/PDF/Print),
                          #   ProductionSticker + DeliverySticker (120x75мм, Modulord для номера),
                          #   StickerActions, PrintPreviewModal
      utils.js
    warehouse/
      pages/WarehousePage.jsx   # tabs: Виджеты / Список / Инвентаризация / История / Расход
      components/         # MaterialCard, MaterialForm, StockModal, ConsumptionChart,
                          #   MaterialsTable, TransactionsHistory,
                          #   InventoryTab (массовый ввод фактических остатков с группировкой
                          #     по UI-категориям, save → bulk-транзакции)
      hooks/useMaterials.js  # + bulkInventory(items) — массовая инвентаризация
    clients/
      pages/              # ClientsPage, ClientDetailPage (LTV, order history)
      components/         # ClientForm (создание из ClientsPage),
                          #   ClientCombobox (поиск + создание на лету —
                          #     используется в AdminOrderEditor + CreateOrderPage)
      hooks/useClients.js
    analytics/
      pages/              # DashboardPage (worker cabinets + manager metrics),
                          #   AnalyticsPage (period filter, charts, comparison), MiniCharts
    reports/
      pages/ReportsPage.jsx     # бонусы, качество, себестоимость
      hooks/useReports.js
    settings/
      pages/SettingsPage.jsx    # tabs: profile, users, permissions (L2 RBAC), Bitrix24, logs, import
      components/         # ProfileCard, UserManagement (CRUD юзеров + удаление с ConfirmDialog),
                          #   CreateUser, EditUserModal, BitrixSettings, IntegrationLog,
                          #   SheetsImport, RolePermissionsTable (чекбоксы «Право × Роль»)
      hooks/useSettings.js  # + deleteUser(userId) → /api/users/delete
      lib/csv-parser.js
    cabinet/
      pages/CabinetPage.jsx    # личный кабинет работника
      hooks/useCabinetStats.js
    help/
      pages/HelpPage.jsx       # 5 tabs: Обзор/Этапы/Роли/Отчёты/Вопросы
  shared/
    constants.js          # ORDER_STATUSES, ORDER_ROUTES, ORDER_TYPES, ROLES,
                          #   getNextStatus(), getOrderRoute(), isDualTrack(),
                          #   NOTIFY_ROLES, NAV_ITEMS, PRIORITIES, LAMINATION_TYPES,
                          #   FILM_TYPES, ORDER_SOURCES, PAYMENT_STATUSES,
                          #   DELIVERY_TYPES, DESIGN_STATUSES, SIZE_PRESETS,
                          #   MATERIAL_TYPES, OPERATION_CHECKLISTS, ROLE_STAGE_PERMISSIONS
    components/           # Layout, Sidebar, Button, Input, Modal, Spinner, Tabs,
                          #   SearchInput, ConfirmDialog, ErrorBoundary (recovery + eventId),
                          #   ErrorState (reusable error UI), Toaster,
                          #   Skeleton, Pagination, NotFoundPage, OfflineIndicator,
                          #   InstallPrompt, OnboardingTip, RoleSwitcher, RoleEmulationBanner
    hooks/                # useDebounce, usePagination, useDeadlineAlerts, useStageNotifications
    lib/                  # supabase.js, utils.js (formatOrderNumber/Short, orderFileSlug),
                          #   export.js, html-export.js (ignoreElements .print-hide),
                          #   sentry.js (returns eventId), sound.js, department-mapping.js,
                          #   error-translator.js (Supabase err → russian UI text),
                          #   safeAsync.js (try/catch + Sentry + toast wrapper),
                          #   safeRpc.js (non-critical RPC wrapper, log-only)
    stores/               # toast-store, theme-store, sidebar-store, role-switcher-store
  test/
    setup.js              # Vitest configuration
    helpers.js            # Test helper functions
api/
  bitrix/
    incoming.js           # Webhook: Bitrix → создание заказа (создаёт с любыми
                          #   данными, обязательные поля можно дозаполнить вручную)
    status-update.js      # Webhook: смена статуса → update Bitrix deal
    server-calculator.js  # Server-side calculation logic
  users/
    create.js             # API: admin создаёт пользователя (service_role key)
    update.js             # API: admin обновляет пользователя
    delete.js             # API: admin удаляет пользователя (запрет самоудаления,
                          #   сброс assigned_to у связанных заказов, каскад на k24_profiles)
supabase/
  migrations/             # SQL миграции (001-040 + integration_log + security hardening).
                          # 019 — custom_number, film_type_stickers, lamination_qty
                          # 020 — k24_role_permissions (L2 RBAC через UI)
                          # 023-025 — material_code, идемпотент списания, lamination_qty в RPC
                          # 026-031 — pack_designs RLS, audit, capacity коробок, БОПП на упаковке
                          # 032-035 — k24_order_subtasks (3D-pack), rollback, capacity, advance_subtask authz
                          # ── Серия 25.05 ──
                          # 036 — unit_cost WAC + total_cost на транзакциях + категория «Ножи»
                          # 037 — сид «Монтажная плёнка 1.26 м» (lam_type='transfer')
                          # 038 — k24_order_items + триггер автосоздания + backfill
                          # 039 — advance_subtask открыт для designer
                          # 040 — k24_order_subtasks.item_idx + track='variant' + backfill multi-variant
  seed.sql                # Начальные материалы + настройки
```

## Supabase — DEDICATED (с 2026-05-11)

С 2026-05-11 проект `pulzirakjqehsulmjhdj` принадлежит **только Kontora24**. PinheadOS переехал в отдельный проект `glhwbktsokphgksdvcxj` (`pinhead-os-v2`), legacy-таблицы `pinhead_users`, `catalog_config`, `app_config` дропнуты. Префикс `k24_` исторический — оставлен чтобы не переименовывать 17 таблиц и не править весь код; можно одной миграцией снять, если понадобится.

Таблицы (20): `k24_profiles`, `k24_orders`, `k24_clients`, `k24_materials` (с `unit_cost` WAC — R8), `k24_material_transactions` (с `total_cost`/`unit_cost` — R8), `k24_settings`, `k24_order_status_history`, `k24_order_comments`, `k24_order_attachments`, `k24_time_entries` (legacy, не пишется), `k24_production_logs` (с `deleted_at`), `k24_shift_entries`, `k24_integration_log`, `k24_order_audit`, `k24_order_templates`, `k24_pack_designs`, `k24_user_filters`, `k24_role_permissions` (L2 RBAC), `k24_order_subtasks` (с `item_idx`+track='variant' — R8.4c), `k24_order_items` (multi-variant, R8.3).

**Auth:** `auth.users` теперь Kontora24-only (9 человек). Триггер `handle_new_user` создаёт `k24_profiles` для всех новых пользователей.

Storage bucket: `order-files`

RPC: `update_stock` · `auto_deduct_materials` (⚠️ отключена в frontend с 12.05 — функция в БД остаётся, но `updateOrderStatus` её больше не вызывает) · `reserve_materials` · `release_materials` · `consume_reservations` · `is_admin` · `check_stage_completion` (с поддержкой track + pack_designs для stickerpack3D)

### Ключевые поля k24_orders

**Основные:** `number` (INT, автоинкремент), `custom_number` (TEXT, опц. — произвольный отображаемый номер), `order_type` (TEXT), `status` (TEXT, default 'new'), `qty` (INT), `width_mm`/`height_mm` (NUMERIC), `need_lam` (BOOL), `lam_type` (TEXT: 'matte'/'glossy'/'transfer'/NULL — `transfer` = монтажная плёнка, R8.2), `film_type` (TEXT, default 'G': G/M/Transparent_G/Transparent_M/Holo/Gold/Chrome — единственная плёнка ИЛИ плёнка фонов для `stickerpack3D`), `film_type_stickers` (TEXT, опц. — плёнка стикеров, только для `stickerpack3D`), `design_variants` (INT), `stickers_per_pack` (INT), `design_status` (TEXT, default 'provided': provided/needs_development), `mockup_path` (TEXT)

**Multi-variant (R8.3):** один заказ может содержать N изделий разных размеров/тиражей. Детали хранятся в `k24_order_items(order_id, idx, width_mm, height_mm, qty)`. Триггер `fn_create_default_order_item` гарантирует автосоздание idx=1 из основных полей при INSERT k24_orders. Для multi-variant (items.length > 1) фронт через `replaceOrderItems` пишет все строки + создаёт `k24_order_subtasks(track='variant', item_idx=N)` для независимого продвижения каждого вида.

**Сделка:** `deal_name` (TEXT), `bitrix_deal_id` (TEXT), `bitrix_url` (TEXT), `is_partner` (BOOL), `source` (TEXT: referrer/avito/website/word_of_mouth/repeat/other), `source_referrer` (TEXT), `payment_status` (TEXT, default 'not_paid': not_paid/sbp_tochka/ip_chikrizov_vtb/pinhead_fabrika/aventa/pinhead_studio/cash/barter)

**Отгрузка:** `delivery_type` (TEXT, default 'pickup': pickup/delivery), `delivery_city` (TEXT), `delivery_address` (TEXT), `delivery_notes` (TEXT)

**Связи:** `client_id` (UUID FK), `assigned_to` (UUID FK), `deadline` (DATE), `priority` (TEXT), `notes` (TEXT)

**Флаги:** `is_3d` (BOOL), `is_urgent` (BOOL), `needs_montage_film` (BOOL), `needs_individual_cut` (BOOL), `bopp_bag` (BOOL)

**Финансы:** `cost_materials`/`cost_labor`/`cost_total`/`markup`/`discount_pct`/`price_final`/`price_per_unit` (NUMERIC)

**Производство:** `printed_meters`/`resin_used` (NUMERIC), `printed_qty`/`rejected_qty` (INT), `checklist` (JSONB)

### Ключевые поля k24_production_logs

`order_id` (UUID FK), `stage` (TEXT), `worker_id` (UUID FK), `track` (TEXT: NULL/'backgrounds'/'stickers'), `stickers_printed`, `backgrounds_printed`, `film_meters`, `film_type` (TEXT, опц. — больше не вводится в форму, берётся из заказа), `lamination_meters`, `lamination_qty` (INT, default 0 — заламинировано в шт, добавлено в R-апдейте 11.05), `defects`, `qty_cut`, `qty_selected`, `stickers_poured`, `stickers_good`, `resin_grams`, `packs_assembled`, `packs_packaged`

### Ключевые поля k24_materials (с R8)

`id`, `type` (TEXT: film/lam_film/ink/resin/packaging_bag/box/utensils/household/blade — `blade` добавлен R8 для ножей плоттера), `name` (UNIQUE по lower(name)), `unit`, `stock_qty`, `min_qty`, `unit_cost` (NUMERIC — WAC, обновляется триггером `recalc_material_wac` при приходах), `material_code` (TEXT, опц. — маппинг film_type/lam_type/'resin' для триггерного списания).

### Ключевые поля k24_material_transactions (с R8)

`material_id`, `delta`, `reason`, `order_id` (опц.), `created_by`, `created_at`, `reservation_status`, `total_cost` (NUMERIC — что ввёл пользователь при приходе), `unit_cost` (NUMERIC — снимок total_cost/delta на момент прихода для аудита).

### Ключевые поля k24_order_subtasks (с R7+R8.4c)

`order_id`, `track` (CHECK 'backgrounds'/'stickers'/'variant'), `item_idx` (INT, NULL для bg/stickers, >=1 для variants), `status` (TEXT — стадия маршрута), `started_at`, `completed_at`. Уникальность: partial indexes `uq_subtasks_track_3d (order_id, track) WHERE track IN ('backgrounds','stickers')` и `uq_subtasks_variant_item (order_id, item_idx) WHERE track='variant'`.

### L2 RBAC — Редактор прав ролей (12.05)

Админ через `/settings → Права ролей` управляет 22 правами для 5 ролей без передеплоя. Сами роли остаются фиксированными (admin/manager/designer/printer/post_printer) — кастомных ролей нет (это L3).

**Архитектура:**
- `k24_role_permissions(role, permission, allowed, updated_by)` — динамические права
- `PERMISSIONS` + `PERMISSION_LABELS` в [src/shared/constants.js](src/shared/constants.js)
- `useRolePermissionsStore` (zustand) — загружается при логине, экспортирует `load()`, `setPermission()`, `canRoleDo()`
- `useCanDo(perm)` / `useCanDoAny([perms])` — React hooks для проверок в компонентах
- `AuthGuard` принимает либо `roles` (legacy) либо `permission` (L2)

**Группы прав:**
- **Stages** (`stage:design` … `stage:otk`) — кто продвигает какой этап
- **Views** (`view:dashboard`, `view:analytics`, `view:finance`, `view:warehouse`, `view:clients`, `view:reports`, `view:settings`) — кто видит раздел
- **Actions** (`order:create`, `order:edit`, `order:cancel`, `material:manage`, `user:manage`) — что может делать

**Что динамически:** Sidebar (видимость пунктов меню), `routes.jsx` AuthGuard, видимость финансовой плитки и редактирования в `OrderDetailPage`/`CreateOrderPage`/`FinanceTab`.

**Что осталось хардкод (L3):** `canWorkOnStage`, `canAdvanceFrom`, `isStageAllowed` (DnD-канбан + `getNextStatus`) — работают по статичному `ROLE_STAGE_PERMISSIONS`. Полный контроль над этапами через UI потребует переписать ~20 RLS-политик. Также RLS-политики БД продолжают хардкодить `role IN ('admin','manager')`.

**Колонка admin в UI редактора disabled** — нельзя выпилить себя.

### Авторасчёт стоимости труда (R-апдейт 11.05 + правка сборки 12.05)

`FinanceTab` / `CabinetPage` автоматически считает заработок через `calculateWorkerPayout(logs, opts)` из `shared/constants.js` — **только пост-печатные операции**:

- заливка стикеров: 1.0 ₽/шт (поле `stickers_good`, stages `pouring` + `selection_pouring`). С фидбэка 28.05 ручной ввод «Хорошо залитых» убран; форма сохраняет «Залито» (`stickers_poured`) + «Брак» (`defects`), а `stickers_good = stickers_poured − defects` пишется автоматически. Старые логи остаются совместимы.
- выборка фонов: 0.5 ₽/шт (`qty_selected`, stage `selection_pouring`)
- сборка 3D-пака: 0.5 ₽/стикер в паке — формула `packs_assembled × order.stickers_per_pack × 0.5` (раньше была фиксированная 0.5/пак; обновлено 12.05 по фидбэку менеджера)
- упаковка пака: 1.5 ₽/шт (`packs_packaged`)

**Сигнатура:** `calculateWorkerPayout(logs, opts = {})`. Для сборки 3D функции нужен `order.stickers_per_pack` — берётся из:
1. `opts.ordersById[l.order_id]` (если передан явно)
2. embed `l.order` (если логи выбраны через `select('*, order:k24_orders!order_id(stickers_per_pack)')`)
3. fallback `1` если нет ни того ни другого

На этапы печать / ламинация / резка / дизайн / препресс сдельная оплата НЕ рассчитывается (используется ручной `cost_labor` из `AdminOrderEditor`). Если в логах есть хотя бы одна пост-печатная запись — авторасчёт перекрывает ручное поле. **Не расширять `calculateWorkerPayout` новыми этапами без явного запроса.**

Себестоимость / шт = (материалы + труд) / qty — отображается в `FinanceTab` под основной плиткой.

## Контекст производства

Kontora24 — внутренний инструмент для 6 сотрудников стикерного производства.
НЕ ecommerce, НЕ SaaS. Работники в цеху на своих телефонах.

### Команда

| Человек | Роль | Что делает |
|---------|------|-----------|
| Владелец (Илья) | admin | Технический аккаунт. Администрирование портала, не для рутины |
| Руководитель производства | manager + designer | Приём заказов, дизайн, препресс, ОТК и выдача (одно лицо, две роли) |
| Печатник | printer | Печать, ламинация, резка |
| Постпечатник 1 | post_printer | Заливка, выборка, сборка 3D, упаковка |
| Постпечатник 2 | post_printer | Заливка, выборка, сборка 3D, упаковка |
| Постпечатник 3 | post_printer | Заливка, выборка, сборка 3D, упаковка |

Менеджеры ОП (Bitrix24) не считаются — они не пользуются Kontora24.

### Типичный день

- 100-300 заказов в месяц, 5-15 новых в день
- 80% заказов — 3D стикеры (со смолой), 20% — обычные
- Брак при заливке частый (пузыри, неровности) — только учёт, без автовозврата
- Стикерпаки: от 1 до 20 видов, каждый заказ уникален
- Дизайн: ~50% клиент даёт макет, ~50% рисуем сами
- Битрикс интеграция ещё не подключена к реальному Bitrix24

### UX принципы

- **Mobile-first:** телефон — основное устройство в цеху, все интерфейсы для тач-экрана
- **Минимум действий:** работник берёт задачу → выполняет → отмечает готово, максимум 3 клика
- **Визуальные приоритеты:** красный = просрочено, оранжевый = срочно, без цвета = норма
- **Финансы скрыты от работников:** designer, printer, post_printer не видят цены и оплату
- **Цены видны:** только admin + manager
- **Данные из Bitrix — read-only:** редактирование полей сделки только в Bitrix24
- **Русский UI:** без англицизмов в интерфейсе
- **Звуковые уведомления** при новых заказах

### Чего НЕ делать

- Не усложнять интерфейс работника — он должен быть проще мессенджера
- Не показывать финансы работникам (только admin + manager)
- Не требовать ввод данных, которые система может рассчитать
- Не создавать отдельных страниц, когда можно модал
- Не использовать англоязычные термины в UI
- Не дублировать данные Bitrix — они приходят через webhook и не редактируются в Kontora24
- Не добавлять функции без реальной потребности от команды из 6 человек

## Правила

- **Архитектура:** feature-based, каждый модуль самодостаточен
- **Бизнес-логика:** чистые функции без React, в `lib/`
- **Import alias:** `@/` → `src/`
- **UI текст:** русский · **Код:** английский
- **Git:** feature-ветки → squash merge в main
- **Никогда не коммитить:** `.env.local`, ключи, пароли
- **Тесты:** Vitest для бизнес-логики, Playwright для e2e
- **Проверка перед деплоем:** `npm run check` (lint + test + build)
- **Деплой:** `npx vercel deploy --yes --prod --scope margolinilya-creates-projects`
- **PDF/Print экспорт:** размеры в px (не pt) — html2canvas даёт предсказуемый рендер. Элементы с классом `.print-hide` исключаются из снимка через `ignoreElements` в [html-export.js](src/shared/lib/html-export.js). `exportAsPDF/PNG` используют `imageTimeout: 15000` + явные `scrollWidth/scrollHeight` чтобы не обрезать текст и дождаться загрузки превью. PDF автоматически вписывает canvas в страницу с сохранением пропорций. Кнопка «Печать» в `TechCardActions` — `requestAnimationFrame × 2 → window.print()`, CSS `@media print` через `visibility: hidden` (не `display: none`, иначе layout сломан)
- **Номер заказа в UI:** везде использовать `formatOrderNumber(order)` / `formatOrderNumberShort(order)` из [shared/lib/utils.js](src/shared/lib/utils.js). С 12.05 префикс `ORD-` убран — функция возвращает просто число (или `custom_number`). `formatOrderNumberShort` теперь алиас. Для имён файлов экспорта — `orderFileSlug(order)` сохраняет формат `ORD-NNNN` (slug должен быть осмысленным)
- **Attachments:** заливка/удаление файлов через хелперы из [src/features/orders/lib/order-attachments.js](src/features/orders/lib/order-attachments.js) — DRY между `OrderAttachments`, `TechCardPreviewSlot`, drop-zone в `TechCard`, `CreateOrderPage`. Лёгкое превью (≤ 2 МБ image/jpeg|png|webp) валидируется через `validatePreviewFile`
- **Проверка прав:** новый код использует `useCanDo('permission:name')` вместо `hasRole(['admin','manager'])`. `hasRole` остаётся как fallback для legacy
- **Удаление пользователей:** через `api/users/delete.js` (DELETE) — серверная проверка `role === 'admin'`, запрет самоудаления, сброс `assigned_to` у связанных заказов перед удалением

## Production старт (2026-05-11)

После большого R-апдейта от 11.05 произведена очистка БД для боевого старта:
- Удалены: все демо-заказы (30), клиенты (10), production_logs (96), status_history (208), attachments, comments, audit, pack_designs, шаблоны
- `orders_number_seq` сброшен к 1 → первый прод-заказ номер `1` (в UI без префикса с 12.05)
- `k24_materials.stock_qty` обнулены у всех 58 позиций (номенклатура сохранена, остатки = 0)
- `k24_material_transactions` полностью очищены (включая seed-приходы)
- `k24_shift_entries` обнулены (история смен пустая)
- Сохранены: `k24_profiles` (9 юзеров), номенклатура `k24_materials`, `k24_settings`, `auth.users`

**Реальная инвентаризация** делается через `/warehouse → Инвентаризация` — массовый ввод фактических остатков с группировкой по UI-категориям. Save создаёт `material_transaction` с `reason='Инвентаризация'` и `delta = факт − текущий` для каждой изменённой позиции.

## Менеджерский фидбэк 2026-05-12 (15 правок)

Точечная UI-полировка после большого R-апдейта. Без миграций БД:

- **Номер заказа:** префикс `ORD-` убран везде в UI — `formatOrderNumber` возвращает чистое число. `orderFileSlug` сохраняет ORD-формат для имён файлов.
- **Партнёр:** −35% → −25% (label в `CreateOrderPage`, `AdminOrderEditor`, `FinanceTab`). Расчётной логики в frontend нет — скидка считается на бэкенде.
- **Отчёты:** вкладка «Премии» → «Сдельная оплата». Колонка «Печать» удалена (не сдельная). Фикс бага `packs_selected` → `qty_selected`. Печать теперь учитывает `order.stickers_per_pack` для сборки 3D.
- **PackDesignsForm — multi-mode:** новый prop `mode` (`pouring`/`print`/`cutting`). На печати показывает «Напечатано» без брака, на резке «Нарезано» + брак, на заливке — как было. Per-design ввод теперь доступен на 4 этапах (print, cutting, pouring, selection_pouring) для `stickerpack3D`. **Tech debt:** `pack_designs.qty_poured` переиспользуется между этапами — миграция с отдельными полями `qty_printed`/`qty_cut` отложена.
- **Ламинация:** label `lamination_meters` через `appendFilm` → «Ламинация (расход) · {плёнка заказа}». `computeIncoming` вычитает defects предыдущего этапа — нельзя продвинуть больше чем годных.
- **Тех-карта:** дата сдачи — шрифт Guidy + `word-break` (раньше Onder + nowrap). Кнопка «Печать» через `requestAnimationFrame × 2`, CSS `visibility` вместо `display: none`. PDF/PNG не обрезают текст (`scrollWidth/scrollHeight`) и подгружают превью (`imageTimeout: 15s`). PDF вписывает canvas с сохранением пропорций.
- **Кабинет:** убраны виджеты «Напечатано» и «Брак», добавлен «Собрано 3D-паков». Виджеты кликабельны → `Modal` со списком заказов и количеством по операции. График полностью переписан: 5 toggleable кривых (`<Legend onClick>`) + отдельный график «Заработано».
- **Сборка 3D — новая формула оплаты:** `packs_assembled × order.stickers_per_pack × 0.5 ₽` (раньше было 0.5/пак). `calculateWorkerPayout` сигнатура расширена: принимает `opts.ordersById` ИЛИ читает embed `l.order`. См. блок «Авторасчёт стоимости труда» выше.
- **Kanban:** `client.name` всегда виден на карточке (раньше только в expanded на mobile).
- **Склад:** авто-расход краски отключён (frontend не вызывает `auto_deduct_materials`). Лейбл «Смола / химия» → «Смола (с отвердителем)» — виджет суммирует обе позиции БД.
- **Отложено:** авто-списание БОПП-пакетов по размеру упакованного изделия — требует миграции `width_mm/height_mm` в `k24_materials` + парсинга 28 имён + триггера на packaging.

## Серия корректировок 25.05 (2026-05-25 / 2026-05-26)

Большой бриф от менеджера декомпозирован на 7 релизов. Все в проде.

| Релиз | Что | Миграция | Ключевые файлы |
|-------|-----|----------|----------------|
| R8    | Склад: unit_cost (WAC), search/filter, ножи плоттера, открытые приходы всем ролям | 036 | [WarehousePage.jsx](src/features/warehouse/pages/WarehousePage.jsx), [StockModal.jsx](src/features/warehouse/components/StockModal.jsx), [WarehouseFilterBar.jsx](src/features/warehouse/components/WarehouseFilterBar.jsx) |
| R8.1  | Виджет «Расход материалов» в форме заказа: формулы плёнки (1230/970/1220), смолы (0.1444 г/см²), БОПП. Live-расчёт + green/red индикация | — | [material-forecast.js](src/features/orders/lib/material-forecast.js), [MaterialForecast.jsx](src/features/orders/components/MaterialForecast.jsx) |
| R8.2  | Плёнка в форме — только из остатков склада. «Ламинация/перенос на монтаж» + новая опция `transfer` (монтажная плёнка 1.26 м) | 037 | [FilmSelect.jsx](src/features/orders/components/FilmSelect.jsx), `LAMINATION_TYPES`+`needsLamination()` в [constants.js](src/shared/constants.js) |
| R8.3  | Multi-variant заказы: `k24_order_items(idx, w, h, qty)` + триггер автосоздания + UI «Кол-во видов изделий» 1–6 | 038 | [useOrderItems.js](src/features/orders/hooks/useOrderItems.js), [CreateOrderPage.jsx](src/features/orders/pages/CreateOrderPage.jsx), [OrderDetailPage.jsx](src/features/orders/pages/OrderDetailPage.jsx) |
| R8.4  | Подзадачи 3D-стикерпака как основной контрол (карточки + мини-степпер + кнопка «Завершить → next»). Designer тоже двигает подзадачи | 039 | [OrderProgressTab.jsx](src/features/orders/components/OrderProgressTab.jsx) (`SubtaskTrackBlock`, `MiniStepper`) |
| R8.4c | Multi-variant подзадачи: `k24_order_subtasks.item_idx` + track='variant'. Каждый вид — независимый таймлайн по `order.route` | 040 | [useOrderSubtasks.js](src/features/orders/hooks/useOrderSubtasks.js) (`variants[]`, `advanceVariant`), `VariantSubtaskBlock` в OrderProgressTab |
| R8.5  | 5 новых вкладок отчётов: Unit Economics / Сотрудники (виджеты+Modal) / 3D отдел / Расходы по заказам / P&L. xlsx-экспорт | — | [ReportsPage.jsx](src/features/reports/pages/ReportsPage.jsx), [materials-cost.js](src/features/reports/lib/materials-cost.js) |

**Себестоимость материалов с R8** считается через `k24_materials.unit_cost` (weighted-average по приходам, обновляется триггером `recalc_material_wac` при `delta>0 AND total_cost IS NOT NULL`). Жёсткие `MATERIAL_COSTS` остаются только в legacy-местах (FinanceTab/OrderProgressTab) и в `calculateActualMaterialsCost` — отчёты R8.5 используют `buildCostMap`+`costForOrder` из [materials-cost.js](src/features/reports/lib/materials-cost.js).

**Multi-variant — не сделано осознанно:**
- Привязка `production_logs.item_idx`: лог пишется на заказ, не по виду. Менеджер двигает variant-subtasks вручную через кнопки на основании визуального осмотра.
- Queue-страницы (Печать / Резка / ...) показывают multi-variant заказы как одну карточку.
- Автообъединение «все variants → packaging»: нет — основной `order.status` остаётся через StatusSwitcher.

Если возникнет реальная потребность — отдельная серия.

## R12 — Планирование производства (бета, с 2026-06-03)

Новый раздел `/production/plan` (бриф менеджера 03.06, Google Doc 1bcAZt6G…). Доступ admin+manager. Запущен как «БЕТА» — пункт «Планирование (бета)» в Sidebar, шильдик в шапке страницы, без feature-flag. Существующие очереди продолжают работать как раньше.

**Архитектура:** `src/features/production-planner/`
- `lib/planner.js` — чистая функция `schedule(orders, items, overrides, norms, capacity, holidays, today)`. Алгоритм §7 ТЗ: жадная раскладка по бакетам, сортировка rush→deadline, drying-пассив, override-pinning, late/risk/outOfHorizon
- `lib/buckets.js` — `STAGE_TO_BUCKET` маппит 19 ORDER_STATUSES в 6 бакетов
- `lib/norms.js` — `DEFAULT_NORMS`, `DEFAULT_CAPACITY`, `bucketHoursPerDay`
- `lib/working-days.js` — пн-пт + госпраздники, `addWorkingDays`, `previousWorkingDay`
- `lib/plan-overrides.js` — `pinStage`/`unpinAll` с optimistic-update + revert
- `lib/dnd-ids.js` — `chip::orderId::stage` / `cell::bucket::date` для @dnd-kit
- `store/plan-store.js` — Zustand: orders/logs/items/overrides/settings + UI-state
- `hooks/usePlannerData.js` — первичная загрузка + 5 realtime каналов
- `hooks/useScheduleResult.js` — мемоизированный вызов schedule()
- `components/{OrderList,PlannerCalendar,OrderDetailsPanel,PlanningSettings}.jsx`
- `pages/PlannerPage.jsx`
- `lib/README.md` — карта переменных ТЗ → реальный код

**Бакеты ёмкости** (по решению пользователя — единый post_print для 3-чел бригады):

| Бакет | Стадии | Дефолт штата | Ч/день |
|---|---|---|---|
| `design` | `design` | 1 дизайнер | 8 |
| `prepress` | `prepress`+`sample_layout`+`batch_layout` | 1 препресс | 8 |
| `oprl_print` | `print`+`sample_print`+`lamination` | 1 печатник | 8 |
| `oprl_cut` | `cutting` | 2 плоттера | 16 |
| `post_print` | `pouring`+`selection_pouring`+`selection`+`assembly_3d`+`packaging`+`otk` | 3 чел. бригада | 24 |
| `passive` | `drying` | — | пассив 36ч → 2 раб. дня |
| `milestone` | `new`/`color_approval`/`done`/`cancelled` | — | не планируется |

**Хранение настроек** в `k24_settings` (jsonb):
- `planning:norms` — 16 нормативов (день/мин/м/шт за 8ч)
- `planning:capacity` — 6 ресурсов + hours_per_day
- `planning:holidays_2026` — массив 'YYYY-MM-DD'
Меняется через `/settings → Производство (бета)`. Realtime пересчёт у всех.

**Закрепления** — таблица `k24_plan_overrides(order_id, stage, pinned_date)` (миграция 048). UNIQUE(order_id, stage). RLS: SELECT всем authenticated, INSERT/UPDATE/DELETE — admin+manager.

**DnD** через @dnd-kit (тот же паттерн что OrdersKanban). Два режима из §9 ТЗ: «Каскад» (default — закрепляет только сдвинутый, хвост пересчитывается) и «Только этап» (закрепляет сдвинутый + все остальные на их текущих днях). Перенос в чужой бакет блокируется info-toast'ом.

**Realtime** — 5 каналов с UUID-суффиксом по [feedback_supabase_realtime_channel_unique.md](.claude/projects/-Users-margolinilya-kontora24/memory/feedback_supabase_realtime_channel_unique.md): `planner-orders`/`planner-logs`/`planner-items`/`planner-overrides`/`planner-settings`. ProcessedRef для дедупликации.

**Что упрощено в MVP** (см. план [scalable-conjuring-rain.md](/Users/margolinilya/.claude/plans/scalable-conjuring-rain.md)):
- dual-track stickerpack3D считаем одним общим объёмом, без отдельных чипов «Фон»/«Стикер»
- `production_logs.item_idx` (multi-variant прогресс) не используется
- `extra_stickers` подзадачи не планируются
- Виртуализация списка отложена до >150 активных заказов
- Edge Function для серверного расчёта не делаем (≤100 заказов — единицы мс)

**Что НЕ трогаем:** `k24_orders` / `k24_production_logs` / `k24_order_subtasks` — только чтение через подписки. Алгоритм опирается на `getOrderRoute(order)` из `shared/constants.js` (источник истины маршрутов).

**Тесты:** 78 unit-тестов в `lib/*.test.js` (planner 50 + working-days 9 + buckets 9 + dnd-ids 4 + store 10) + e2e `e2e/planner.spec.js`.

## R13 — Менеджерский фидбэк 02.06 (5 PR + 3 миграции)

Бриф 02.06 (Google Doc 1Jy0iBdj…) — 17 точечных правок после прода. Декомпозирован на 5 PR в проде.

| Релиз | Что | Миграция | Ключевые файлы |
|-------|-----|----------|----------------|
| R13.0 | `batch_layout` удалён из ORDER_ROUTES (дубль prepress). Поиск /orders по `custom_number` + `client.name` (lookup в k24_clients). OrdersKanban + PipelineSummary колонки строятся динамически из ORDER_STATUSES.order — все R11-этапы видны во всех view modes. DEPT_GROUPS включает новые этапы | 049 | [constants.js](src/shared/constants.js), [OrdersKanban.jsx](src/features/orders/components/OrdersKanban.jsx), [useOrders.js](src/features/orders/hooks/useOrders.js) |
| R13.1 | Склад: `archived_at` в k24_materials + права `material:archive` / `material:delete` (admin+manager). MaterialEditModal с full edit, ActionMenu (⋯) с архивом/разархивом/удалением. Hard delete блокируется при наличии транзакций (`HAS_TRANSACTIONS` → toast «можно только архивировать»). Виджет «План трат» (зелёным) — `usePlannedConsumption` суммирует прогноз forecastMaterials по активным заказам без логов, lookup по `material_code` или `type`. Unit dropdown в MaterialForm | 050 | [WarehousePage.jsx](src/features/warehouse/pages/WarehousePage.jsx), [MaterialActionsMenu.jsx](src/features/warehouse/components/MaterialActionsMenu.jsx), [MaterialEditModal.jsx](src/features/warehouse/components/MaterialEditModal.jsx), [PlanFactBadge.jsx](src/features/warehouse/components/PlanFactBadge.jsx), [usePlannedConsumption.js](src/features/warehouse/hooks/usePlannedConsumption.js) |
| R13.2 | Формы этапов: убран defects из pouring и selection_pouring (stickers track). Drying: live-расчёт «Поступило / Пригодных после сушки = incoming − defects» в ProductionLogForm. Prepress: новое поле `prepared_qty` (миграция 051), убран из NO_INPUT_STAGES. PackDesignsForm: одна кнопка «Сохранить» вместо «+» per row — batch insert по всем непустым видам с частичным фидбэком ошибок | 051 | [production-logs.js](src/features/production/lib/production-logs.js), [ProductionLogForm.jsx](src/features/production/components/logs/ProductionLogForm.jsx), [PackDesignsForm.jsx](src/features/production/components/PackDesignsForm.jsx), [OrderProgressTab.jsx](src/features/orders/components/OrderProgressTab.jsx) |
| R13.3 | /reports: ReportError расширен (translateError + кнопки «Обновить» / «Скопировать код» / details для саппорта). error-translator добавил коды 57014 (timeout), 42P01 (relation), 42703 (column). Period получил «Сегодня» и «Свой» (два date-инпута). getSince/getUntil поддерживают `today` и `custom:from:to`. Все 8 .gte() в useReports получили .lte() по верхней границе | — | [ReportsPage.jsx](src/features/reports/pages/ReportsPage.jsx), [useReports.js](src/features/reports/hooks/useReports.js), [error-translator.js](src/shared/lib/error-translator.js) |
| R13.4 | Формула плёнки стикеров для stickerpack3D: `computeStickerFilmMeters({W,H,qty}) = (W×H×0.65×qty×1.3) / 1M / 1.23` метров. Виджет MaterialForecast показывает отдельную строку «Плёнка (стикеры)» с lookup по `film_type_stickers`. usePlannedConsumption тоже подхватывает | — | [material-forecast.js](src/features/orders/lib/material-forecast.js), [MaterialForecast.jsx](src/features/orders/components/MaterialForecast.jsx) |

**Решения по open questions** (от пользователя 03.06):
- Edit/delete cascade (#11 брифа) = «материалы не возвращаются на склад» — но миграция 025 уже даёт корректный реверс через `deduct_materials_from_log` (NEW vs OLD дельта с учётом `deleted_at`). R13.2.1 отложен до конкретного репро от менеджера.
- selection_pouring defects = убрано на обеих стадиях (consistency со спекой 11.05).
- Удаление позиции склада = hard delete только если 0 связанных транзакций, иначе toast предлагает архивацию.

**Не сделано осознанно:**
- «Право учёта работы всем сотрудникам» (#9 брифа) — в коде `canWriteLogForStage(role) = !!role`, уже даёт права всем. Нужно репро от менеджера: какая роль, какой этап, что не видит/не может.
- Cascade reverse material_transactions через `log_id` — текущий триггер deduct_materials_from_log корректно реверсирует при soft-delete через дельту, без `log_id` колонки.

622 unit-теста + e2e. Прод-деплой через `npx vercel deploy --yes --prod --scope margolinilya-creates-projects` (DEBUG=* workaround).

## R14 — Менеджерский фидбэк 03.06 (9 PR + 4 миграции)

Бриф 03.06 после деплоя R13 — 25+ точечных правок включая критический баг падения /reports. Декомпозирован на 9 PR в проде (R14.0-R14.5 от менеджера + R14.6-R14.8 после внутреннего code-review 03-04.06).

| Релиз | Что | Миграция | Ключевые файлы |
|-------|-----|----------|----------------|
| R14.0 | Hotfix /reports: `lam_type` в `useReports.js` подтягивается через `order:k24_orders!order_id(lam_type)` join, заменили `l.lam_type` на `l.order?.lam_type`. Восстанавливает Unit Economics / Расходы / P&L | — | [useReports.js](src/features/reports/hooks/useReports.js#L97) |
| R14.1 | Склад tooltip план-факт через `createPortal(body)` с z-9999 — не обрезается. Номера заказов через `formatOrderNumber` (custom_number если задан). usePlannedConsumption тянет custom_number. Новый `LaminationSelect` — lookup k24_materials type='lam_film' по material_code, опции matte/glossy/transfer из остатков склада. Замена inline select в CreateOrderPage | — | [PlanFactBadge.jsx](src/features/warehouse/components/PlanFactBadge.jsx), [LaminationSelect.jsx](src/features/orders/components/LaminationSelect.jsx), [usePlannedConsumption.js](src/features/warehouse/hooks/usePlannedConsumption.js) |
| R14.2 | Миграция 052: `kind TEXT` в k24_order_attachments с CHECK ('attachment'/'preview'/'sample_print') + index. SamplePrintWidget на stage='sample_print' — drop-zone JPG/PNG ≤2МБ заменяет виджет учёта расхода. SamplePrintGallery на вкладке «Обзор». QueuePage.prepress тянет и status='sample_layout' через extraStatuses | 052 | [SamplePrintWidget.jsx](src/features/orders/components/SamplePrintWidget.jsx), [SamplePrintGallery.jsx](src/features/orders/components/SamplePrintGallery.jsx), [QueuePage.jsx](src/features/production/pages/QueuePage.jsx) |
| R14.3 | Миграция 053: `k24_pack_designs.qty_planned`. PackDesignsForm.mode='prepress' — план к печати per design. usePackDesigns.updateQtyPlanned. OrderProgressTab: prepress в PACK_STAGES_3D_PACK/STICKER3D, handlePackDesignSubmit на prepress обновляет qty_planned. SubtaskIndicator скрывает блок подзадач до prepress. useSubtaskQueue.pouring + QueuePage SUBTASK_ENABLED_STAGES += 'pouring' — sticker-трек stickerpack3D в pouring виден на /production/pouring | 053 | [PackDesignsForm.jsx](src/features/production/components/PackDesignsForm.jsx), [usePackDesigns.js](src/features/production/hooks/usePackDesigns.js), [OrderProgressTab.jsx](src/features/orders/components/OrderProgressTab.jsx), [useSubtaskQueue.js](src/features/production/hooks/useSubtaskQueue.js) |
| R14.4 | Миграция 054: `k24_pack_designs.defects_drying` (аналитический счётчик, реальный учёт через production_logs.defects на drying). PackDesignsForm.mode='drying' — поле «Брак после сушки» per variant. SUBTRACT_DEFECTS_STAGES += 'drying'. Кастомная aggregateLine для drying: total = (sum stickers_good/poured на pouring/sp) − (sum defects на drying), allowNegative=true. getProgressLines: линия `drying` для sticker3D. ProgressLinesWidget рендерит красный бар + текст «Брак превысил залитые на N шт — нужна допечатка» при total<0 | 054 | [OrderProgressTab.jsx](src/features/orders/components/OrderProgressTab.jsx), [PackDesignsForm.jsx](src/features/production/components/PackDesignsForm.jsx) |
| R14.5 | ColorApprovalControls: «Цвет утверждён» → `prepress` вместо `batch_layout` (R13.0 удалила batch_layout из маршрутов, но кнопка всё ещё его выставляла → причина ошибки «этап не входит в маршрут»). hasSubtaskLog снят ранний return для track='extra_stickers' — теперь и доп. стикеры требуют логов на каждом stage. ExtraStickerBlock canAdvance проверка + tooltip «Сначала внесите данные на этапе X» | — | [ColorApprovalControls.jsx](src/features/orders/components/ColorApprovalControls.jsx), [production-logs.js](src/features/production/lib/production-logs.js), [OrderProgressTab.jsx](src/features/orders/components/OrderProgressTab.jsx) |
| R14.6 | Hotfix-pack после внутреннего code-review: useReports теперь тянет `film_type` из заказа через join (после R8 поле в логах не пишется → себест. плёнки в /reports была 0 ₽). calculateWorkerPayout: добавлена ветка `stage='selection'` (R11 штучные стикеры sticker3D без × stickers_per_pack). useBonusReport / useEmployeeReport: множитель для qty_selected зависит от stage (selection_pouring=perPack, selection=1). SSRF в bitrix/status-update: `endsWith('bitrix24.ru')` пропускал evilbitrix24.ru → проверка через `=== \|\| endsWith('.bitrix24.ru')`. findPreviewAttachment: фильтр по kind='preview' (без него sample_print фото утекало в тех-карту). useOrders.js: добавлен uuid-суффикс канала (был единственный realtime-хук без uuid — нарушение memo) | — | [useReports.js](src/features/reports/hooks/useReports.js), [constants.js](src/shared/constants.js), [order-attachments.js](src/features/orders/lib/order-attachments.js), [useOrders.js](src/features/orders/hooks/useOrders.js), [bitrix/status-update.js](api/bitrix/status-update.js) |
| R14.7 | Производственная логика после code-review: **planner.js computeOrderVolumes** — убран `× design_variants` из piecesThis (раньше stickerpack3D с design_variants=10 показывал перегрузку 10× в планировщике; теперь pieces = qty × stickers_per_pack без множителя на дизайны; multiplier сохранён для design-стадии через `norms.design_multiply_kinds`). **hasSubtaskLog** — для track='extra_stickers' gate отключён до появления UI flow (после R14.5 гейт был вечно заблокирован, допечатка зависала). **useSubtaskQueue** — extras видны независимо от order_type (раньше резало sticker3D/sticker_cut допечатку). **CreateOrderPage preSubmit** — блок submit + toast при itemsCount > 1 и не заполненных доп. видах. **Миграция 055** — триггер deduct_materials_from_log при stickerpack3D + track='stickers' + film_type_stickers NULL пишет warning в k24_integration_log + legacy fallback на film_type (раньше тихо списывал со склада фонов, разрушая остатки) | 055 | [planner.js](src/features/production-planner/lib/planner.js), [production-logs.js](src/features/production/lib/production-logs.js), [useSubtaskQueue.js](src/features/production/hooks/useSubtaskQueue.js), [CreateOrderPage.jsx](src/features/orders/pages/CreateOrderPage.jsx) |
| R14.8 | RBAC tightening после code-review: **AdminOrderEditor** — финансовые поля (price_final/cost_*/markup/discount_pct/price_per_unit) рендерятся и пишутся в updateOrder только при `useCanDo('view:finance')`. Раньше любой с order:edit мог стереть финансы в null или переписать. Синхронизировано с CreateOrderPage. **ReportsPage** — 4 финансовые вкладки (Unit Economics / Сотрудники / Расходы по заказам / P&L) скрыты без view:finance, видна только «3D отдел». Раньше при выдаче view:reports без view:finance работнику утекали маржа, цена за штуку, P&L через xlsx-экспорт. Если view:finance отозвано на лету — активная вкладка переключается на доступную | — | [AdminOrderEditor.jsx](src/features/orders/components/AdminOrderEditor.jsx), [ReportsPage.jsx](src/features/reports/pages/ReportsPage.jsx) |

**Решения по open questions** (от пользователя 03.06):
- Формат R14: серия R14.0–R14.5 (как R13.0–R13.4) — выбран ради инкрементальной отгрузки и упрощённого ревью.
- Sample_print: только фото, без расхода материалов. Drop-zone заменяет виджет учёта полностью.
- Drying-брак: per variant, прогресс per трек, allowNegative=true.
- Prepress 3D-pack: plan per design (PackDesignsForm), подзадачи стартуют от prepress.

**Не сделано в R14, отложено до отдельной серии R14.9+** (после демо менеджеру):
- **Виджет учёта работы привязан к подзадаче, не к order.status (фидбэк #7)**: переработка CurrentStageWidget на N виджетов per active subtask. Сейчас CurrentStageWidget показывает форму для order.status. При расхождении подзадач менеджер должен идти в очереди /production/X для ввода данных за «отстающую» подзадачу.
- **OrderStepper визуальное раздвоение** (фидбэк #5): после prepress показывать две параллельные линии чипов (Фон/Стикер) до assembly_3d. Текущий степпер — одна линия, подзадачи отдельным блоком SubtaskTrackBlock.
- **Mobile UX переключатель подзадач** (Tabs/Dropdown): зависит от полной переработки виджетов учёта.
- **ExtraStickerLogForm для extras** (R14.7 отложено): inline-форма в ExtraStickerBlock для записи лога с track='extra_stickers' per design. Сейчас R14.7 временно снял gate — менеджер сам решает когда жать «Завершить». Когда форма появится, gate в hasSubtaskLog вернётся.
- **k24_orders RLS SELECT USING (true)** (code-review #5): известная дыра. Воркер через DevTools читает price_final/cost_total. Требует переписать SELECT через k24_get_orders_safe RPC. Отдельная сессия с e2e регрессией. Security phase 3.
- **k24_plan_overrides SELECT открыт всем authenticated** (code-review #6): минорная утечка плана производства через DevTools для воркеров без view:planning. Требует переписать RLS с учётом роли.

636 unit-тестов + e2e. Прод-деплой через `npx vercel deploy --yes --prod --scope margolinilya-creates-projects` (DEBUG=* workaround).

## Обработка ошибок

- **toast.error в action handlers:** `toast.error(translateError(err).message)` — перевод Supabase ошибок на человеческий русский
- **error в data hooks:** хук возвращает `{ data, loading, error, refetch }`, страница рендерит `<ErrorState error={error} onRetry={refetch} />`
- **Non-critical RPC:** `safeRpc('rpc_name', params, { source: 'caller.method' })` — log-only в Sentry, не throw
- **Render crashes:** ловятся `<ErrorBoundary>` в routes.jsx — auto-reset на смену route, eventId в UI для support
- **Silent fails:** запрещены — каждый `await supabase.*` либо проверяет `error` поле, либо обёрнут в try/catch с `captureError`
- **`captureError(err, { tags: { source: 'модуль.метод' } })`** — единая конвенция тегов для фильтрации в Sentry
