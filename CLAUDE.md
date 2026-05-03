# Kontora24 — MES/WMS для стикерного производства

Система управления производством стикеров: заказы → расчёт → дизайн → печать → постобработка → [заливка] → сборка → упаковка → выдача.
CRM — Bitrix24 (интеграция через webhooks). Аналитика — здесь и в Bitrix.

**Планы:** `docs/project-overview.md` · `docs/improvement-plan-final.md` · `docs/kontora24-plan.md`
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
| manager | Заказы, Калькулятор, Клиенты, Аналитика, Производство |
| designer | Dashboard + Очередь дизайна |
| printer | Dashboard + Очередь печати |
| assembler | Dashboard + Очередь сборки |
| resin_pourer | Dashboard + Очередь заливки |

## Команды

```bash
npm run dev          # Dev server (Vite)
npm run build        # Production build
npm run preview      # Preview production build
npx vitest run       # Run tests (39 тестов: калькулятор + таймер + константы)
npm run lint         # ESLint
npx vercel deploy --yes --prod --scope margolinilya-creates-projects  # Deploy
```

## Архитектура — Feature-based

```
src/
  app/                  # App.jsx, routes.jsx
  features/
    auth/               # LoginForm, AuthGuard, useAuth, store (Supabase Auth)
    orders/             # OrdersPage (table+kanban), OrderDetailPage (single-scroll),
                        #   StatusSwitcher, DepartmentTimeline, DepartmentFilter,
                        #   DateRangeFilter, OrderComments, OrderAttachments,
                        #   OrderPdfExport, ClaimButton, OrdersKanban
    calculator/         # CalculatorPage, calculator.js (pure), LayoutPreview, CompareMode, CalcHistory
    production/         # ProductionBoardPage (DnD, horizontal scroll, phase groups),
                        #   QueuePage (unified), DesignQueue, PrintQueue (batch view),
                        #   PostProcessingQueue, AssemblyQueue,
                        #   ResinQueue, PackagingQueue, DraggableCard, QueueCard,
                        #   PipelineSummary, TaskTimer, DryingTimer, OperationChecklist,
                        #   CompleteTaskModal, TechCardPreview, MaterialConsumption,
                        #   BatchView, ProductionCalendar
                        #   hooks: useTimer
    warehouse/          # WarehousePage (tabs: stock/analytics), MaterialCard, StockModal,
                        #   MaterialForm, ConsumptionChart (forecast)
    clients/            # ClientsPage, ClientDetailPage (LTV, order history), ClientForm
    analytics/          # DashboardPage (worker cabinets + simplified manager: 3 metrics + stock),
                        #   AnalyticsPage (period filter, charts, comparison, workload, top clients)
    techcard/           # TechCard (A4 redesign: black header + 3 blocks),
                        #   TechCardActions (PNG/PDF/Print),
                        #   ProductionSticker (120x75mm "В производство"),
                        #   DeliverySticker (120x75mm "На выдачу"),
                        #   StickerActions (PNG/PDF/Print export)
    kp/                 # CommercialProposal (3 templates: standard/detailed/short)
    settings/           # SettingsPage (tabs: profile, calculator, markups, users, Bitrix24, logs)
  shared/
    components/         # Layout (skip-to-content, Suspense, help button), Sidebar (counters, low-stock badge),
                        #   Button (min-h-44px touch targets), Input, Modal (focus trap), Spinner, Tabs, SearchInput,
                        #   ConfirmDialog, ErrorBoundary (Sentry), Toaster, Skeleton,
                        #   Pagination (range display), NotFoundPage, OfflineIndicator, OnboardingTip
    hooks/              # useDebounce, usePagination, useDeadlineAlerts, useStageNotifications
    lib/                # supabase.js, utils.js, export.js (CSV with format), sentry.js, sound.js,
                        #   department-mapping.js (status→department mapping for TZ filters/timeline)
    stores/             # toast-store, theme-store, sidebar-store
    constants.js        # Statuses, roles, types, transitions, nav items, discounts
  styles/globals.css    # Tailwind + light/dark theme
api/
  bitrix/incoming.js    # Webhook: Bitrix → create order + auto-calculate
  bitrix/status-update.js  # Webhook: order done → update Bitrix deal
  users/create.js       # API: admin creates user (service_role key)
supabase/
  migrations/           # SQL migrations
  seed.sql              # Initial materials + settings
```

## Supabase — SHARED DATABASE (2 проекта!)

**ВАЖНО:** Supabase проект `pulzirakjqehsulmjhdj` делят 2 приложения. НЕ ТРОГАТЬ чужие таблицы!

| Проект | Префикс | Таблицы |
|--------|---------|---------|
| **Kontora24** | `k24_` | `k24_profiles`, `k24_orders`, `k24_clients`, `k24_materials`, `k24_material_transactions`, `k24_settings`, `k24_order_status_history`, `k24_order_comments`, `k24_order_attachments`, `k24_time_entries`, `k24_integration_log`, `k24_order_audit`, `k24_order_templates` |
| **PinheadOS** | нет/`pinhead_` | `pinhead_users`, `catalog_config`, `app_config` |
| **Общее** | — | `auth.users` (Supabase Auth, разделить нельзя) |

**Изоляция auth:** При логине Kontora24 проверяет наличие записи в `k24_profiles`. Если нет — "Нет доступа к Kontora24". Триггер `handle_new_user` создаёт `k24_profiles` только для пользователей с `display_name` в метаданных (т.е. созданных через `api/users/create.js`).

Storage bucket: `order-files`

RPC: `update_stock` · `auto_deduct_materials` · `reserve_materials` · `release_materials` · `consume_reservations` · `is_admin`

## Реализовано (112/112 пунктов плана + расширения)

### Готово
- Auth: login, logout, role guard, password reset, Russian errors, show/hide password, "запомнить меня"
- Dashboard: личные кабинеты работников (мои задачи + очередь + статистика), role-based (workers/managers), упрощённый менеджерский дашборд (3 метрики + склад: закончились/заканчиваются), deadlines, batch complete, onboarding tips
- Orders: table (5 столбцов: №/Заказчик/Тип/Этап/Срок) + kanban toggle, search, pagination, сортировка (по сроку сдачи / по номеру), фильтр по отделам (DepartmentFilter с чекбоксами), фильтр по дате сдачи (от-до), CSV export с format-функциями, priority (low/normal/high/urgent)
- Order detail: единая прокручиваемая страница (без табов), шапка ORD-{номер} + клиент + менеджер + дата + статус, таймлайн по отделам (DepartmentTimeline с hover-подсказками), ссылка на файлы + копирование, редактируемые поля (напечатанные метры/смола/брак/напечатанные шт), comments (realtime), file attachments (Storage), tech card (PNG/PDF/print), КП (3 templates), стикеры "В производство" и "На выдачу" (120x75мм, PNG/PDF/Печать), recalculate price, client link, time tracking
- Calculator: full formulas, presets, reset, layout preview (responsive), compare mode (responsive), history (localStorage), auto-calc from Bitrix webhook, client/deadline/notes/priority fields, lamination type, sticky CTA, toast on create
- Production: unified board with bidirectional drag-and-drop (@dnd-kit + TouchSensor + KeyboardSensor), optimistic updates, drop animation, claim button (with confirm), time-in-status, sort by deadline/priority, "my orders" filter, search by number, 7 columns (Новый/Дизайн/Печать/Постобработка/Заливка/Сборка/Упаковка), conditional resin flow for 3D, throughput counter, sound notification, production calendar, batch printing view, tech card preview modal, stage notifications between roles, deadline alerts, pipeline summary strip, phase groups
- Time tracking: start/stop timer per order, localStorage persistence, history in order detail, auto-stop on "Готово"
- Material consumption: record from order card, planned vs actual, stock update, unified "Готово" modal (timer + materials + status)
- Warehouse: materials CRUD, stock modal with balance + history tab, auto-deduct on print, consumption chart (themed), forecast table, low stock filter, low-stock badge on sidebar, material reservation on creation, release on cancel
- Clients: list with search + "дней без заказа", detail page (LTV, order history, tags, Bitrix link), create form
- Analytics: 3 tabs (Финансы/Производство/Ресурсы), period filter, revenue by type, status pie, avg stage time, conversion, revenue trend, top clients, workload, material consumption, period comparison, throughput trend by week, PDF export
- Settings: tabs (profile/calculator/markups/users/Bitrix24/logs), calculator params from DB, markup editor, user management (6 roles), profile, create user (name/email/password/role via API), Bitrix config UI, integration log
- Tech card: A4 layout по ТЗ (чёрная заливка + Oswald Bold, 3 блока: инфо/производство/превью+комментарии), PNG/PDF export, print CSS
- Стикеры: "В производство" (120x75мм, логотип + номер Bebas Neue + срок/заказчик/тираж) и "На выдачу" (производитель kontora.su вместо срока), PNG/PDF/Печать через StickerActions
- Department mapping: маппинг DB-статусов на отделы из ТЗ (Отдел продаж/Допечатная/Печать/3D/ОСК/Выдан)
- KP: 3 templates (standard/detailed/short)
- Performance: React.memo on QueueCard/PipelineSummary/DraggableCard, useMemo on DashboardPage filtering, debounced realtime subscriptions (2s), timer tick 30s in compact mode (vs 1s)
- Infra: error boundaries (retry + Sentry), Suspense fallback, pagination, toast system, skeleton loading, dark theme, PWA manifest + service worker (offline), offline indicator, 41 Vitest tests, GitHub Actions CI/CD, Sentry, Agentation
- Bitrix: incoming webhook (auto-create + auto-calc), outbound webhook (status sync, retry with backoff), settings UI, integration log
- Shared UI Kit: Button, Input, Modal, Spinner, Tabs, SearchInput, ConfirmDialog, OnboardingTip
- A11y: skip-to-content, aria-labels, keyboard DnD, table captions, focus-visible, prefers-reduced-motion, iOS safe areas, min 44px touch targets
- Mobile: responsive search/controls on Production Board, safe-area-inset on fixed sidebar/header, 44px tap targets on buttons/nav, full-width inputs on small screens
- Help: HelpPage (5 tabs: Обзор/Этапы/Роли/Отчёты/Вопросы), contextual OnboardingTips on Dashboard/Queues/Board, header help button (?)
- Worker UX: simplified layout (no sidebar), unified "Готово" action, onboarding tips, drying timer for resin, design preview thumbnails

## Контекст производства

Kontora24 — внутренний инструмент для 5 сотрудников стикерного производства.
НЕ ecommerce, НЕ SaaS. Целевая аудитория — работники в цеху на планшетах.

### Команда и роли

| Человек | Роль в системе | Что делает |
|---------|---------------|------------|
| Менеджер (ОП) | Работает в Bitrix24 | Продажи, клиенты, сделки. Не заходит в Kontora24 |
| Руководитель производства | admin | Назначает заказы, контролирует все этапы |
| Дизайнер (он же руков.) | designer | Делает макеты стикеров |
| Печатник | printer | Печатает на плоттере, может делать дизайн |
| Заливщик 1 | resin_pourer | Заливает 3D стикеры смолой |
| Заливщик 2 | resin_pourer | Заливает 3D стикеры смолой |
| Сборщик | assembler | Режет, ламинирует, собирает стикерпаки |

### Производственный цикл

```
Bitrix24 (сделка) → webhook → Kontora24 (заказ)
  → Дизайн → Печать → Постобработка (резка die/kiss cut, ламинация)
    → [Заливка смолой (только 3D)] → Сборка → Упаковка → Готово
  → webhook → Bitrix24 (стадия "Готово" + цена)
```

**Статусы (11):** new → design → design_done → print → print_done → post_processing → [resin_pouring] → assembly → packaging → done | cancelled

### Материалы

| Тип | Единица | Когда расходуется |
|-----|---------|-------------------|
| Плёнка | м² | Печать |
| Краска | мл | Печать |
| Ламинация | м² | Постобработка |
| Смола | г | Заливка (только 3D) |
| Упаковочные пакеты | шт | Упаковка |
| Коробки | шт | Упаковка |

### Детали каждого этапа

| Этап | Статус | Кто | Что делает физически | Время | Оборудование |
|------|--------|-----|---------------------|-------|-------------|
| Дизайн | design | Дизайнер | Рисует макет в Illustrator/Photoshop, готовит файл для печати | 15мин–2ч | Компьютер |
| Печать | print | Печатник | Загружает файл в плоттер, печатает на плёнке | 10–30мин | Широкоформатный принтер |
| Постобработка | post_processing | Печатник/Сборщик | Плоттерная резка (die cut / kiss cut), ламинация | 10–60мин | Режущий плоттер, ламинатор |
| Заливка смолой | resin_pouring | Заливщик | Заливает эпоксидной смолой, ждёт высыхания 24ч | 15мин + 24ч сушка | Стол заливки |
| Сборка | assembly | Сборщик | Собирает стикерпаки | 10–30мин | Руки |
| Упаковка | packaging | Сборщик | Упаковывает в пакеты/коробки | 5–10мин | Руки |

### Типичный день

- 100-300 заказов в месяц, 5-15 новых в день
- 80% заказов — 3D стикеры (со смолой), 20% — обычные
- Смола сохнет 24ч, брак частый (пузыри, неровности) — перезаливка каждого 5-го заказа
- Стикерпаки: от 1 до 20 видов, каждый заказ уникален
- Дизайн: ~50% клиент даёт макет, ~50% рисуем сами
- Назначение: руководитель говорит устно "Иван, напечатай заказ 15"
- Устройства: работники на своих телефонах (не планшеты!)
- Клиент узнаёт статус от менеджера в Bitrix
- Bitrix интеграция ещё не подключена к реальному Bitrix24

### Частые проблемы (главные боли)

- Заказы теряются между этапами — забывают, путают
- Нет контроля кто что делает — руководитель не видит загрузку
- Расход материалов на глаз — реальная себестоимость неизвестна
- Просрочка дедлайнов — клиенты недовольны
- Смола не высохла, а сборщик уже ждёт (или высохла, а никто не проверил)
- Брак при заливке — нужно перезаливать, учёт потерь нулевой
- Стикерпак собран неправильно (перепутали виды)

### Бизнес-метрики для руководителя

- Выручка за период / по типам продукции
- Средняя маржинальность
- Throughput (заказов в день)
- Время на этап (bottleneck detection)
- Расход материалов vs план
- Загрузка работников

### UX принципы для работников

- Работник открывает систему → видит СВОИ задачи → берёт задачу → делает → отмечает "Готово"
- Минимум кликов: "Взять → Начать → Готово" = 3 клика
- Планшет/телефон — основное устройство в цеху
- Простота > функциональность
- Звук при новом заказе
- Дедлайны видны сразу, просроченные выделены
- Красный = просрочено. Оранжевый = срочно. Без цвета = нормально.
- Работник НЕ видит цены и маржу — только параметры заказа

### Чего НЕ делать

- Не усложнять интерфейс работника — он должен быть проще мессенджера
- Не показывать финансы работникам (только admin/manager)
- Не требовать ввод данных, которые система может рассчитать сама
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
