# Kontora24 — MES/WMS для стикерного производства

Система управления производством стикеров: заказы → дизайн → препресс → печать → ламинация → резка → [заливка] → [сборка 3D] → упаковка → ОТК → выдача.
CRM — Bitrix24 (интеграция через webhooks).

**Production:** https://kontora24.vercel.app
**Login:** mib@pnhd.ru / Kontora24!

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
| admin | Всё, включая настройки и пользователей |
| manager | Заказы, Клиенты, Аналитика, Производство |
| designer | Dashboard + Дизайн + Препресс |
| printer | Dashboard + Препресс + Печать + Ламинация + Резка (+ помощь на постпечати) |
| post_printer | Dashboard + Заливка + Выборка + Сборка 3D + Упаковка |

## Команды

```bash
npm run dev          # Dev server (Vite)
npm run build        # Production build
npm run preview      # Preview production build
npx vitest run       # Run tests (165 тестов)
npm run lint         # ESLint
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

**Типы заказов:** sticker_cut, sticker_kiss, stickerpack, sticker3D, stickerpack3D, rect, big

**Ламинация:** matte (матовая), glossy (глянцевая), null (без ламинации) — задаётся при создании заказа.

### Детали каждого этапа

| Этап | Статус | Кто | Что делает | Данные |
|------|--------|-----|-----------|--------|
| Дизайн | design | designer | Рисует макет в Illustrator/Photoshop | — |
| Препресс | prepress | designer, printer | Цветокоррекция, раскладка на лист, экспорт для плоттера | — |
| Печать | print | printer | Загружает файл в плоттер, печатает на плёнке | стикеры шт, фоны шт, метры плёнки, тип плёнки |
| Ламинация | lamination | printer | Ламинирует напечатанные листы | метры ламинации, брак |
| Резка | cutting | printer | Плоттерная резка (die cut / kiss cut) | кол-во нарезанных, брак |
| Заливка | pouring | post_printer | Заливает эпоксидной смолой, ручной контроль сушки | кол-во залитых, хороших, брак, граммы смолы |
| Выборка/Заливка | selection_pouring | post_printer | Выборка фонов + заливка стикеров (параллельно) | выбрано фонов, залито стикеров, брак, смола |
| Сборка 3D | assembly_3d | post_printer | Наклеивает залитые стикеры на фоны | кол-во собранных паков |
| Упаковка | packaging | post_printer | Упаковывает в пакеты/коробки | кол-во упакованных |
| ОТК | otk | admin | Проверка качества, выдача клиенту | — |

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
  app/                  # App.jsx, routes.jsx
  features/
    auth/               # LoginForm, AuthGuard, useAuth, store (Supabase Auth)
    orders/             # OrdersPage (table+kanban), OrderDetailPage (single-scroll),
                        #   CreateOrderPage (ручное создание заказа),
                        #   StatusSwitcher, DepartmentTimeline, DepartmentFilter,
                        #   DateRangeFilter, OrderComments, OrderAttachments,
                        #   OrderPdfExport, ClaimButton, OrdersKanban, AdminOrderEditor
    production/         # ProductionBoardPage (DnD, horizontal scroll, 4 phase groups),
                        #   QueuePage (unified), 10 очередей (Design, Prepress, Print,
                        #   Lamination, Cutting, Pouring, SelectionPouring, Assembly3d,
                        #   Packaging, Otk), DraggableCard, QueueCard,
                        #   PipelineSummary, TaskTimer, OperationChecklist,
                        #   CompleteTaskModal, TechCardPreview, MaterialConsumption,
                        #   BatchView, ProductionCalendar
                        #   lib: production-logs.js (STAGE_FIELDS, dual-track progress)
                        #   hooks: useTimer, useProductionLogs
    warehouse/          # WarehousePage (tabs: stock/analytics), MaterialCard, StockModal,
                        #   MaterialForm, ConsumptionChart (forecast)
    clients/            # ClientsPage, ClientDetailPage (LTV, order history), ClientForm
    analytics/          # DashboardPage (worker cabinets + manager: 3 метрики + склад),
                        #   AnalyticsPage (period filter, charts, comparison, workload)
    techcard/           # TechCard (A4), TechCardActions (PNG/PDF/Print),
                        #   ProductionSticker + DeliverySticker (120x75мм),
                        #   StickerActions (PNG/PDF/Print)
    reports/            # ReportsPage (бонусы, качество, себестоимость)
    settings/           # SettingsPage (tabs: profile, users, Bitrix24, logs, import)
    cabinet/            # CabinetPage (личный кабинет работника)
    help/               # HelpPage (5 tabs: Обзор/Этапы/Роли/Отчёты/Вопросы)
  shared/
    components/         # Layout, Sidebar, Button, Input, Modal, Spinner, Tabs,
                        #   SearchInput, ConfirmDialog, ErrorBoundary, Toaster,
                        #   Skeleton, Pagination, NotFoundPage, OfflineIndicator, OnboardingTip
    hooks/              # useDebounce, usePagination, useDeadlineAlerts, useStageNotifications
    lib/                # supabase.js, utils.js, export.js, sentry.js, sound.js,
                        #   department-mapping.js (7 отделов → статусы)
    stores/             # toast-store, theme-store, sidebar-store
    constants.js        # ORDER_STATUSES, ORDER_ROUTES, ORDER_TYPES, ROLES,
                        #   getNextStatus(), getOrderRoute(), isDualTrack(),
                        #   NOTIFY_ROLES, NAV_ITEMS, PRIORITIES, LAMINATION_TYPES
  styles/globals.css    # Tailwind + light/dark theme
api/
  bitrix/incoming.js    # Webhook: Bitrix → создание заказа (без расчёта цены)
  bitrix/status-update.js  # Webhook: смена статуса → update Bitrix deal
  users/create.js       # API: admin создаёт пользователя (service_role key)
  users/update.js       # API: admin обновляет пользователя
supabase/
  migrations/           # SQL миграции (001-008 + security hardening)
  seed.sql              # Начальные материалы + настройки
```

## Supabase — SHARED DATABASE (2 проекта!)

**ВАЖНО:** Supabase проект `pulzirakjqehsulmjhdj` делят 2 приложения. НЕ ТРОГАТЬ чужие таблицы!

| Проект | Префикс | Таблицы |
|--------|---------|---------|
| **Kontora24** | `k24_` | `k24_profiles`, `k24_orders`, `k24_clients`, `k24_materials`, `k24_material_transactions`, `k24_settings`, `k24_order_status_history`, `k24_order_comments`, `k24_order_attachments`, `k24_time_entries`, `k24_production_logs`, `k24_shift_entries`, `k24_integration_log`, `k24_order_audit`, `k24_order_templates` |
| **PinheadOS** | нет/`pinhead_` | `pinhead_users`, `catalog_config`, `app_config` |
| **Общее** | — | `auth.users` (Supabase Auth, разделить нельзя) |

**Изоляция auth:** При логине Kontora24 проверяет наличие записи в `k24_profiles`. Если нет — "Нет доступа к Kontora24". Триггер `handle_new_user` создаёт `k24_profiles` только для пользователей с `display_name` в метаданных.

Storage bucket: `order-files`

RPC: `update_stock` · `auto_deduct_materials` · `reserve_materials` · `release_materials` · `consume_reservations` · `is_admin` · `check_stage_completion` (с поддержкой track)

### Ключевые поля k24_orders

`order_type` (TEXT), `status` (TEXT, default 'new'), `qty` (INT), `width_mm`/`height_mm` (NUMERIC), `need_lam` (BOOL), `lam_type` (TEXT: 'matte'/'glossy'/NULL), `design_variants` (INT), `client_id` (UUID FK), `assigned_to` (UUID FK), `deadline` (TIMESTAMPTZ), `priority` (TEXT), `notes` (TEXT), `bitrix_deal_id` (TEXT)

### Ключевые поля k24_production_logs

`order_id` (UUID FK), `stage` (TEXT), `worker_id` (UUID FK), `track` (TEXT: NULL/'backgrounds'/'stickers'), `stickers_printed`, `backgrounds_printed`, `film_meters`, `film_type`, `lamination_meters`, `defects`, `qty_cut`, `qty_selected`, `stickers_poured`, `stickers_good`, `resin_grams`, `packs_assembled`, `packs_packaged`

## Контекст производства

Kontora24 — внутренний инструмент для 5 сотрудников стикерного производства.
НЕ ecommerce, НЕ SaaS. Работники в цеху на своих телефонах.

### Команда

| Человек | Роль | Что делает |
|---------|------|-----------|
| Менеджер (ОП) | Bitrix24 | Продажи, клиенты, сделки. Не заходит в Kontora24 |
| Руководитель | admin | Назначает заказы, контролирует все этапы |
| Дизайнер (он же руков.) | designer | Макеты, препресс |
| Печатник | printer | Печать, ламинация, резка |
| Постпечатник 1 | post_printer | Заливка, выборка, сборка 3D, упаковка |
| Постпечатник 2 | post_printer | Заливка, выборка, сборка 3D, упаковка |

### Типичный день

- 100-300 заказов в месяц, 5-15 новых в день
- 80% заказов — 3D стикеры (со смолой), 20% — обычные
- Брак при заливке частый (пузыри, неровности) — только учёт, без автовозврата
- Стикерпаки: от 1 до 20 видов, каждый заказ уникален
- Дизайн: ~50% клиент даёт макет, ~50% рисуем сами
- Битрикс интеграция ещё не подключена к реальному Bitrix24

### UX принципы

- Работник: СВОИ задачи → Взять → Начать → Готово = 3 клика
- Телефон — основное устройство в цеху
- Простота > функциональность
- Звук при новом заказе
- Красный = просрочено. Оранжевый = срочно. Без цвета = нормально
- Работник НЕ видит цены — только параметры заказа

### Чего НЕ делать

- Не усложнять интерфейс работника — проще мессенджера
- Не показывать финансы работникам (только admin/manager)
- Не требовать ввод данных, которые система может рассчитать
- Не создавать отдельных страниц, когда можно модал
- Не использовать англоязычные термины в UI

## Правила

- **Архитектура:** feature-based, каждый модуль самодостаточен
- **Бизнес-логика:** чистые функции без React, в `lib/`
- **Import alias:** `@/` → `src/`
- **UI текст:** русский · **Код:** английский
- **Git:** feature-ветки → squash merge в main
- **Никогда не коммитить:** `.env.local`, ключи, пароли
- **Тесты:** Vitest для бизнес-логики
- **Деплой:** `npx vercel deploy --yes --prod --scope margolinilya-creates-projects`
