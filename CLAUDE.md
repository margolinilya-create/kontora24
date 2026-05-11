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
npm test               # Run tests (Vitest, 360 тестов)
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

**Статусы (13):** new, design, prepress, print, lamination, cutting, selection_pouring, pouring, assembly_3d, packaging, otk, done, cancelled

**Skip-stages:** `getOrderRoute(order)` фильтрует маршрут по флагам:
- `design_status === 'provided'` → пропускается стадия `design` (макет от клиента, сразу в `prepress`)
- `need_lam === false` → пропускается `lamination`
- `bopp_bag === false && order_type !== 'stickerpack3D'` → пропускается `packaging` (R-апдейт 11.05). Упаковка нужна только для БОПП-заказов и 3D-стикерпаков
- 3D-стадии (`pouring`, `selection_pouring`, `assembly_3d`) уже разруливаются через `ORDER_ROUTES` per-type

`isStageAllowed(order, stage)` валидирует переход. `updateOrderStatus(...)` бросает ошибку при попытке перейти на стадию вне маршрута; `{ isRollback: true }` или `{ force: true }` — admin escape (используется в `StatusOverride` и кнопке возврата в `OrderStepper`). DnD-канбан блокирует колонки запрещённых этапов через `useDroppable({ disabled: !isStageAllowed(...) })`. Если статус уже вне маршрута (грязные данные), `OrderStepper` показывает предупреждение и кнопку «Вернуть на корректный этап».

**Типы заказов (в коде):** sticker_cut, sticker_kiss, stickerpack, sticker3D, stickerpack3D, rect, big

**Ламинация:** matte (матовая), glossy (глянцевая), null (без ламинации) — задаётся при создании заказа.

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
| Партнёрский | `is_partner` | bool | Партнёрский (-35%) / Клиентский |
| Источник | `source` | выбор | `referrer` / `avito` / `website` / `word_of_mouth` / `repeat` / `other` |
| Имя референта | `source_referrer` | текст | Показывается только при source=referrer |
| Оплата | `payment_status` | выбор | `not_paid` / `sbp_tochka` / `ip_chikrizov_vtb` / `pinhead_fabrika` / `aventa` / `pinhead_studio` / `cash` / `barter` |

### По заказу

| Поле | Код | Тип | Варианты / детали |
|------|-----|-----|----------|
| Тип продукции | `order_type` | выбор | `sticker_cut` / `sticker_kiss` / `stickerpack` / `sticker3D` / `stickerpack3D` / `rect` / `big` |
| Произвольный номер | `custom_number` | текст | Опциональный отображаемый номер (суффикс/префикс). NULL → используется ORD-NNNN из `number` |
| Материал (плёнка) | `film_type` | выбор | `G` / `M` / `Transparent_G` / `Transparent_M` / `Holo` / `Gold` / `Chrome`. Для `stickerpack3D` — это плёнка ФОНОВ |
| Плёнка стикеров | `film_type_stickers` | выбор | Только для `stickerpack3D` (отдельно от плёнки фонов). NULL для остальных типов |
| Ламинация | `lam_type` | выбор | `matte` (матовая) / `glossy` (глянцевая) / пусто (без ламинации) |
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
  migrations/             # SQL миграции (001-020 + integration_log + security hardening).
                          # 019_custom_number_and_film_split — custom_number,
                          #   film_type_stickers, lamination_qty (R-апдейт 11.05).
                          # 020_role_permissions — таблица k24_role_permissions + сид
                          #   для L2 RBAC редактора прав через UI.
  seed.sql                # Начальные материалы + настройки
```

## Supabase — DEDICATED (с 2026-05-11)

С 2026-05-11 проект `pulzirakjqehsulmjhdj` принадлежит **только Kontora24**. PinheadOS переехал в отдельный проект `glhwbktsokphgksdvcxj` (`pinhead-os-v2`), legacy-таблицы `pinhead_users`, `catalog_config`, `app_config` дропнуты. Префикс `k24_` исторический — оставлен чтобы не переименовывать 17 таблиц и не править весь код; можно одной миграцией снять, если понадобится.

Таблицы (18): `k24_profiles`, `k24_orders`, `k24_clients`, `k24_materials`, `k24_material_transactions`, `k24_settings`, `k24_order_status_history`, `k24_order_comments`, `k24_order_attachments`, `k24_time_entries` (legacy, не пишется), `k24_production_logs` (с `deleted_at`), `k24_shift_entries`, `k24_integration_log`, `k24_order_audit`, `k24_order_templates`, `k24_pack_designs`, `k24_user_filters`, `k24_role_permissions` (L2 RBAC).

**Auth:** `auth.users` теперь Kontora24-only (9 человек). Триггер `handle_new_user` создаёт `k24_profiles` для всех новых пользователей.

Storage bucket: `order-files`

RPC: `update_stock` · `auto_deduct_materials` · `reserve_materials` · `release_materials` · `consume_reservations` · `is_admin` · `check_stage_completion` (с поддержкой track + pack_designs для stickerpack3D)

### Ключевые поля k24_orders

**Основные:** `number` (INT, автоинкремент), `custom_number` (TEXT, опц. — произвольный отображаемый номер), `order_type` (TEXT), `status` (TEXT, default 'new'), `qty` (INT), `width_mm`/`height_mm` (NUMERIC), `need_lam` (BOOL), `lam_type` (TEXT: 'matte'/'glossy'/NULL), `film_type` (TEXT, default 'G': G/M/Transparent_G/Transparent_M/Holo/Gold/Chrome — единственная плёнка ИЛИ плёнка фонов для `stickerpack3D`), `film_type_stickers` (TEXT, опц. — плёнка стикеров, только для `stickerpack3D`), `design_variants` (INT), `stickers_per_pack` (INT), `design_status` (TEXT, default 'provided': provided/needs_development), `mockup_path` (TEXT)

**Сделка:** `deal_name` (TEXT), `bitrix_deal_id` (TEXT), `bitrix_url` (TEXT), `is_partner` (BOOL), `source` (TEXT: referrer/avito/website/word_of_mouth/repeat/other), `source_referrer` (TEXT), `payment_status` (TEXT, default 'not_paid': not_paid/sbp_tochka/ip_chikrizov_vtb/pinhead_fabrika/aventa/pinhead_studio/cash/barter)

**Отгрузка:** `delivery_type` (TEXT, default 'pickup': pickup/delivery), `delivery_city` (TEXT), `delivery_address` (TEXT), `delivery_notes` (TEXT)

**Связи:** `client_id` (UUID FK), `assigned_to` (UUID FK), `deadline` (DATE), `priority` (TEXT), `notes` (TEXT)

**Флаги:** `is_3d` (BOOL), `is_urgent` (BOOL), `needs_montage_film` (BOOL), `needs_individual_cut` (BOOL), `bopp_bag` (BOOL)

**Финансы:** `cost_materials`/`cost_labor`/`cost_total`/`markup`/`discount_pct`/`price_final`/`price_per_unit` (NUMERIC)

**Производство:** `printed_meters`/`resin_used` (NUMERIC), `printed_qty`/`rejected_qty` (INT), `checklist` (JSONB)

### Ключевые поля k24_production_logs

`order_id` (UUID FK), `stage` (TEXT), `worker_id` (UUID FK), `track` (TEXT: NULL/'backgrounds'/'stickers'), `stickers_printed`, `backgrounds_printed`, `film_meters`, `film_type` (TEXT, опц. — больше не вводится в форму, берётся из заказа), `lamination_meters`, `lamination_qty` (INT, default 0 — заламинировано в шт, добавлено в R-апдейте 11.05), `defects`, `qty_cut`, `qty_selected`, `stickers_poured`, `stickers_good`, `resin_grams`, `packs_assembled`, `packs_packaged`

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

### Авторасчёт стоимости труда (R-апдейт 11.05)

`FinanceTab` автоматически считает `cost_labor` через `calculateWorkerPayout(logs)` из `shared/constants.js` — **только пост-печатные операции**:

- заливка стикеров: 1.0 ₽/шт (поле `stickers_good`)
- выборка фонов: 0.5 ₽/шт (`qty_selected`)
- сборка 3D-пака: 0.5 ₽/шт (`packs_assembled`)
- упаковка пака: 1.5 ₽/шт (`packs_packaged`)

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
- **PDF/Print экспорт:** размеры в px (не pt) — html2canvas даёт предсказуемый рендер. Элементы с классом `.print-hide` исключаются из снимка через `ignoreElements` в [html-export.js](src/shared/lib/html-export.js) — используется для drop-индикаторов, hover-кнопок «Заменить»/«Удалить» в TechCard и TechCardPreviewSlot
- **Номер заказа в UI:** везде использовать `formatOrderNumber(order)` / `formatOrderNumberShort(order)` из [shared/lib/utils.js](src/shared/lib/utils.js) — учитывают `custom_number`. Для имён файлов экспорта — `orderFileSlug(order)`
- **Attachments:** заливка/удаление файлов через хелперы из [src/features/orders/lib/order-attachments.js](src/features/orders/lib/order-attachments.js) — DRY между `OrderAttachments`, `TechCardPreviewSlot`, drop-zone в `TechCard`, `CreateOrderPage`. Лёгкое превью (≤ 2 МБ image/jpeg|png|webp) валидируется через `validatePreviewFile`
- **Проверка прав:** новый код использует `useCanDo('permission:name')` вместо `hasRole(['admin','manager'])`. `hasRole` остаётся как fallback для legacy
- **Удаление пользователей:** через `api/users/delete.js` (DELETE) — серверная проверка `role === 'admin'`, запрет самоудаления, сброс `assigned_to` у связанных заказов перед удалением

## Production старт (2026-05-11)

После большого R-апдейта от 11.05 произведена очистка БД для боевого старта:
- Удалены: все демо-заказы (30), клиенты (10), production_logs (96), status_history (208), attachments, comments, audit, pack_designs, шаблоны
- `orders_number_seq` сброшен к 1 → первый прод-заказ ORD-0001
- `k24_materials.stock_qty` обнулены у всех 58 позиций (номенклатура сохранена, остатки = 0)
- `k24_material_transactions` полностью очищены (включая seed-приходы)
- `k24_shift_entries` обнулены (история смен пустая)
- Сохранены: `k24_profiles` (9 юзеров), номенклатура `k24_materials`, `k24_settings`, `auth.users`

**Реальная инвентаризация** делается через `/warehouse → Инвентаризация` — массовый ввод фактических остатков с группировкой по UI-категориям. Save создаёт `material_transaction` с `reason='Инвентаризация'` и `delta = факт − текущий` для каждой изменённой позиции.

## Обработка ошибок

- **toast.error в action handlers:** `toast.error(translateError(err).message)` — перевод Supabase ошибок на человеческий русский
- **error в data hooks:** хук возвращает `{ data, loading, error, refetch }`, страница рендерит `<ErrorState error={error} onRetry={refetch} />`
- **Non-critical RPC:** `safeRpc('rpc_name', params, { source: 'caller.method' })` — log-only в Sentry, не throw
- **Render crashes:** ловятся `<ErrorBoundary>` в routes.jsx — auto-reset на смену route, eventId в UI для support
- **Silent fails:** запрещены — каждый `await supabase.*` либо проверяет `error` поле, либо обёрнут в try/catch с `captureError`
- **`captureError(err, { tags: { source: 'модуль.метод' } })`** — единая конвенция тегов для фильтрации в Sentry
