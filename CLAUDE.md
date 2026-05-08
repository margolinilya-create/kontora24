# Kontora24 — MES/WMS для стикерного производства

Контора — типография, специализирующаяся на стикерах. Делаем всё что клеится: стикеры, этикетки, стикерпаки, широкоформатные наклейки, трафареты. Виниловые, со смолой (3D), выпуклые, объёмные — на голографической, металлизированной плёнках. Разработаем макет по брифу от заказчика и произведём тираж продукции. Специализируемся на 3D стикерах. Гарантируем результат, который понравится!

Kontora24 — максимально упрощённая система учёта заказов и отчётность по ним на каждом этапе производства.
CRM — Bitrix24 (интеграция через webhooks, пока не подключена к реальному Bitrix24).

**Production:** https://kontora24.vercel.app

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

**Supabase project:** `pulzirakjqehsulmjhdj` (eu-west-1) — shared с PinheadOS, таблицы с префиксом `k24_`.

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

**Skip-stages (R1 2026-05-08):** `getOrderRoute(order)` фильтрует маршрут по флагам:
- `design_status === 'provided'` → пропускается стадия `design` (макет от клиента, сразу в `prepress`)
- `need_lam === false` → пропускается `lamination`
- 3D-стадии (`pouring`, `selection_pouring`, `assembly_3d`) уже разруливаются через `ORDER_ROUTES` per-type

`isStageAllowed(order, stage)` валидирует переход. `updateOrderStatus(...)` бросает ошибку при попытке перейти на стадию вне маршрута; `{ isRollback: true }` или `{ force: true }` — admin escape (используется в `StatusOverride` и кнопке возврата в `OrderStepper`). DnD-канбан блокирует колонки запрещённых этапов через `useDroppable({ disabled: !isStageAllowed(...) })`. Если статус уже вне маршрута (грязные данные), `OrderStepper` показывает предупреждение и кнопку «Вернуть на корректный этап».

**Типы заказов (в коде):** sticker_cut, sticker_kiss, stickerpack, sticker3D, stickerpack3D, rect, big

**Ламинация:** matte (матовая), glossy (глянцевая), null (без ламинации) — задаётся при создании заказа.

**Плёнка (film_type):** G (глянцевая), M (матовая), Transparent_G (прозрачная глянцевая), Transparent_M (прозрачная матовая), Holo (голографическая), Gold (золотая), Chrome (хром) — default 'G'.

## Структура заказа (входящие данные)

Данные приходят из Bitrix24 через webhook (read-only в Kontora24) или вводятся вручную при создании заказа.
Форма создания заказа (`CreateOrderPage`) разделена на 3 секции: Сделка / Заказ / Отгрузка.

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
| Материал (плёнка) | `film_type` | выбор | `G` (глянцевая) / `M` (матовая) / `Holo` (голографическая) / `Gold` (золотая) / `Chrome` (хром) |
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
| Печать | print | printer | Загружает файл в плоттер, печатает на плёнке | Расход по каждому типу плёнки отдельно, стикеры шт, фоны шт |
| Ламинация | lamination | printer | Ламинирует напечатанные листы | Метры ламинации, брак |
| Резка | cutting | printer | Плоттерная резка (die cut / kiss cut) | Брак |
| Заливка | pouring | post_printer | Заливает эпоксидной смолой, ручной контроль сушки | Кол-во залитых стикеров, брак, граммы смолы |
| Выборка/Заливка | selection_pouring | post_printer | Выборка фонов + заливка стикеров (параллельно) | Выбрано фонов, залито стикеров, брак, граммы смолы |
| Сборка 3D | assembly_3d | post_printer | Наклеивает залитые стикеры на фоны | Кол-во собранных паков |
| Упаковка | packaging | post_printer | Упаковывает в пакеты/коробки | Кол-во упакованных |
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
      components/         # TechCard (A4), TechCardActions (PNG/PDF/Print),
                          #   ProductionSticker + DeliverySticker (120x75мм), StickerActions
      utils.js
    warehouse/
      pages/WarehousePage.jsx   # tabs: stock/analytics
      components/         # MaterialCard, MaterialForm, StockModal, ConsumptionChart
      hooks/useMaterials.js
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
      pages/SettingsPage.jsx    # tabs: profile, users, Bitrix24, logs, import
      components/         # ProfileCard, SheetsImport
      hooks/useSettings.js
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
    lib/                  # supabase.js, utils.js, export.js, html-export.js,
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
    incoming.js           # Webhook: Bitrix → создание заказа
    status-update.js      # Webhook: смена статуса → update Bitrix deal
    server-calculator.js  # Server-side calculation logic
  users/
    create.js             # API: admin создаёт пользователя (service_role key)
    update.js             # API: admin обновляет пользователя
supabase/
  migrations/             # SQL миграции (001-009 + integration_log + security hardening)
  seed.sql                # Начальные материалы + настройки
```

## Supabase — SHARED DATABASE (2 проекта!)

**ВАЖНО:** Supabase проект `pulzirakjqehsulmjhdj` делят 2 приложения. НЕ ТРОГАТЬ чужие таблицы!

| Проект | Префикс | Таблицы |
|--------|---------|---------|
| **Kontora24** | `k24_` | `k24_profiles`, `k24_orders`, `k24_clients`, `k24_materials`, `k24_material_transactions`, `k24_settings`, `k24_order_status_history`, `k24_order_comments`, `k24_order_attachments`, `k24_time_entries` (legacy, не пишется), `k24_production_logs` (с `deleted_at`), `k24_shift_entries`, `k24_integration_log`, `k24_order_audit`, `k24_order_templates`, `k24_pack_designs` (виды стикеров в паке), `k24_user_filters` (личные пресеты фильтров) |
| **PinheadOS** | нет/`pinhead_` | `pinhead_users`, `catalog_config`, `app_config` |
| **Общее** | — | `auth.users` (Supabase Auth, разделить нельзя) |

**Изоляция auth:** При логине Kontora24 проверяет наличие записи в `k24_profiles`. Если нет — "Нет доступа к Kontora24". Триггер `handle_new_user` создаёт `k24_profiles` только для пользователей с `display_name` в метаданных.

Storage bucket: `order-files`

RPC: `update_stock` · `auto_deduct_materials` · `reserve_materials` · `release_materials` · `consume_reservations` · `is_admin` · `check_stage_completion` (с поддержкой track + pack_designs для stickerpack3D)

### Ключевые поля k24_orders

**Основные:** `order_type` (TEXT), `status` (TEXT, default 'new'), `qty` (INT), `width_mm`/`height_mm` (NUMERIC), `need_lam` (BOOL), `lam_type` (TEXT: 'matte'/'glossy'/NULL), `film_type` (TEXT, default 'G': G/M/Holo/Gold/Chrome), `design_variants` (INT), `stickers_per_pack` (INT), `design_status` (TEXT, default 'provided': provided/needs_development), `mockup_path` (TEXT)

**Сделка:** `deal_name` (TEXT), `bitrix_deal_id` (TEXT), `bitrix_url` (TEXT), `is_partner` (BOOL), `source` (TEXT: referrer/avito/website/word_of_mouth/repeat/other), `source_referrer` (TEXT), `payment_status` (TEXT, default 'not_paid': not_paid/sbp_tochka/ip_chikrizov_vtb/pinhead_fabrika/aventa/pinhead_studio/cash/barter)

**Отгрузка:** `delivery_type` (TEXT, default 'pickup': pickup/delivery), `delivery_city` (TEXT), `delivery_address` (TEXT), `delivery_notes` (TEXT)

**Связи:** `client_id` (UUID FK), `assigned_to` (UUID FK), `deadline` (DATE), `priority` (TEXT), `notes` (TEXT)

**Флаги:** `is_3d` (BOOL), `is_urgent` (BOOL), `needs_montage_film` (BOOL), `needs_individual_cut` (BOOL), `bopp_bag` (BOOL)

**Финансы:** `cost_materials`/`cost_labor`/`cost_total`/`markup`/`discount_pct`/`price_final`/`price_per_unit` (NUMERIC)

**Производство:** `printed_meters`/`resin_used` (NUMERIC), `printed_qty`/`rejected_qty` (INT), `checklist` (JSONB)

### Ключевые поля k24_production_logs

`order_id` (UUID FK), `stage` (TEXT), `worker_id` (UUID FK), `track` (TEXT: NULL/'backgrounds'/'stickers'), `stickers_printed`, `backgrounds_printed`, `film_meters`, `film_type`, `lamination_meters`, `defects`, `qty_cut`, `qty_selected`, `stickers_poured`, `stickers_good`, `resin_grams`, `packs_assembled`, `packs_packaged`

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

## Обработка ошибок

- **toast.error в action handlers:** `toast.error(translateError(err).message)` — перевод Supabase ошибок на человеческий русский
- **error в data hooks:** хук возвращает `{ data, loading, error, refetch }`, страница рендерит `<ErrorState error={error} onRetry={refetch} />`
- **Non-critical RPC:** `safeRpc('rpc_name', params, { source: 'caller.method' })` — log-only в Sentry, не throw
- **Render crashes:** ловятся `<ErrorBoundary>` в routes.jsx — auto-reset на смену route, eventId в UI для support
- **Silent fails:** запрещены — каждый `await supabase.*` либо проверяет `error` поле, либо обёрнут в try/catch с `captureError`
- **`captureError(err, { tags: { source: 'модуль.метод' } })`** — единая конвенция тегов для фильтрации в Sentry
