# Kontora24 — MES/WMS для стикерного производства

Система управления производством стикеров: заказы → расчёт → дизайн → печать → сборка → выдача.
CRM — Bitrix24 (интеграция через webhooks). Аналитика — здесь и в Bitrix.

**Планы:** `docs/kontora24-plan.md` · `docs/improvement-plan-final.md`
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

**Supabase project:** `pulzirakjqehsulmjhdj` (eu-west-1) — shared с pinhead, таблицы kontora24 без префикса.

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
npx vitest run       # Run tests (22 тестов калькулятора)
npm run lint         # ESLint
npx vercel deploy --yes --prod --scope margolinilya-creates-projects  # Deploy
```

## Архитектура — Feature-based

```
src/
  app/                  # App.jsx, routes.jsx
  features/
    auth/               # LoginForm, AuthGuard, useAuth, store (Supabase Auth)
    orders/             # OrdersPage (table+kanban), OrderDetailPage, StatusSwitcher,
                        #   OrderEditForm, OrderComments, OrderAttachments, OrderTimeline,
                        #   OrderPdfExport, ClaimButton, SavedFilters, OrdersKanban
    calculator/         # CalculatorPage, calculator.js (pure), LayoutPreview, CompareMode, CalcHistory
    production/         # ProductionBoardPage (DnD bidirectional, optimistic, calendar view),
                        #   QueuePage (unified), DesignQueue, PrintQueue (batch view),
                        #   AssemblyQueue, ResinQueue, DraggableCard, QueueCard,
                        #   TaskTimer, DryingTimer, OperationChecklist, CompleteTaskModal,
                        #   TechCardPreview, MaterialConsumption, BatchView, ProductionCalendar
                        #   hooks: useTimer
    warehouse/          # WarehousePage (tabs: stock/analytics), MaterialCard, StockModal,
                        #   MaterialForm, ConsumptionChart (forecast)
    clients/            # ClientsPage, ClientDetailPage (LTV, order history), ClientForm
    analytics/          # DashboardPage (role-based), AnalyticsPage (period filter, charts,
                        #   comparison, workload, material consumption, top clients)
    techcard/           # TechCard (A4), TechCardActions (PNG/PDF/Print)
    kp/                 # CommercialProposal (3 templates: standard/detailed/short)
    settings/           # SettingsPage (tabs: profile, calculator, markups, users, Bitrix24, logs)
  shared/
    components/         # Layout (skip-to-content, Suspense), Sidebar (counters, low-stock badge),
                        #   Button, Input, Modal (focus trap), Spinner, Tabs, SearchInput,
                        #   ConfirmDialog, ErrorBoundary (Sentry), Toaster, Skeleton,
                        #   Pagination (range display), Breadcrumbs, NotFoundPage, OfflineIndicator
    hooks/              # useDebounce, useRealtime, usePagination, useDeadlineAlerts, useStageNotifications
    lib/                # supabase.js, utils.js, export.js (CSV), sentry.js, sound.js
    stores/             # toast-store, theme-store, sidebar-store, notification-store
    components/         # + OnboardingTip
    constants.js        # Statuses, roles, types, transitions, nav items, discounts
  styles/globals.css    # Tailwind + light/dark theme
api/
  bitrix/incoming.js    # Webhook: Bitrix → create order + auto-calculate
  bitrix/status-update.js  # Webhook: order done → update Bitrix deal
supabase/
  migrations/           # SQL migrations
  seed.sql              # Initial materials + settings
```

## Supabase таблицы

`profiles` · `clients` · `orders` · `order_status_history` · `order_comments` · `order_attachments` · `materials` · `material_transactions` · `settings` · `integration_log` · `time_entries`

Storage bucket: `order-files`

RPC: `update_stock(material_id, delta)` · `auto_deduct_materials(order_id, changed_by)` · `reserve_materials(order_id, changed_by)` · `release_materials(order_id, changed_by)` · `consume_reservations(order_id, changed_by)`

## Реализовано (112/112 пунктов плана + расширения)

### Готово
- Auth: login, logout, role guard, password reset, Russian errors, show/hide password, "запомнить меня"
- Dashboard: личные кабинеты работников (мои задачи + очередь + статистика), role-based (workers/managers), deadlines, activity feed, low stock, mini-charts (revenue + orders 7d), status cards → filtered links, batch complete, onboarding tips
- Orders: table + kanban toggle, search, pagination, sort, status filters, saved filters, bulk actions, CSV export, client + deadline columns, keyboard-accessible sort, priority (low/normal/high/urgent)
- Order detail: edit (notes/deadline/assignee/client/priority), comments (realtime), file attachments (Storage), responsive timeline, tech card (PNG/PDF/print + QR), КП (3 templates), PDF export, duplicate, recalculate price, Bitrix link, client link, time tracking (start/stop), material consumption recording, operation checklist
- Calculator: full formulas, presets, reset, layout preview (responsive), compare mode (responsive), history (localStorage), auto-calc from Bitrix webhook, client/deadline/notes/priority fields, lamination type, sticky CTA, toast on create
- Production: unified board with bidirectional drag-and-drop (@dnd-kit + TouchSensor + KeyboardSensor), optimistic updates, drop animation, claim button (with confirm), time-in-status, sort by deadline/priority, "my orders" filter, search by number, 5 columns (Новый/Дизайн/Печать/Заливка/Сборка), conditional resin flow for 3D, throughput counter, sound notification, production calendar, batch printing view, tech card preview modal, stage notifications between roles, deadline alerts
- Time tracking: start/stop timer per order, localStorage persistence, history in order detail, auto-stop on "Готово"
- Material consumption: record from order card, planned vs actual, stock update, unified "Готово" modal (timer + materials + status)
- Warehouse: materials CRUD, stock modal with balance + history tab, auto-deduct on print, consumption chart (themed), forecast table, low stock filter, low-stock badge on sidebar, material reservation on creation, release on cancel
- Clients: list with search + "дней без заказа", detail page (LTV, order history, tags, Bitrix link), create form
- Analytics: 3 tabs (Финансы/Производство/Ресурсы), period filter, revenue by type, status pie, avg stage time, conversion, revenue trend, top clients, workload, material consumption, period comparison, throughput trend by week, PDF export
- Settings: tabs (profile/calculator/markups/users/Bitrix24/logs), calculator params from DB, markup editor, user management (6 roles), profile, invite by email, Bitrix config UI, integration log
- Tech card: A4 layout, PNG/PDF export, print CSS, layout preview, QR code, operation checklist
- KP: 3 templates (standard/detailed/short)
- Infra: error boundaries (retry + Sentry), Suspense fallback, pagination, toast system, skeleton loading, dark theme, PWA manifest + service worker (offline), offline indicator, 39 Vitest tests, GitHub Actions CI/CD, Sentry, Agentation
- Bitrix: incoming webhook (auto-create + auto-calc), outbound webhook (status sync, retry with backoff), settings UI, integration log
- Shared UI Kit: Button, Input, Modal, Spinner, Tabs, SearchInput, ConfirmDialog, OnboardingTip
- A11y: skip-to-content, aria-labels, keyboard DnD, table captions, focus-visible, prefers-reduced-motion, iOS safe areas
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
  → Дизайн → Печать → [Заливка смолой (только 3D)] → Сборка → Готово
  → webhook → Bitrix24 (стадия "Готово" + цена)
```

### Материалы

| Тип | Единица | Когда расходуется |
|-----|---------|-------------------|
| Плёнка | м² | Печать |
| Краска | мл | Печать |
| Ламинация | м² | Сборка |
| Смола | г | Заливка (только 3D) |
| Упаковочные пакеты | шт | Сборка |
| Коробки | шт | Сборка |

### Детали каждого этапа

| Этап | Кто | Что делает физически | Время | Оборудование |
|------|-----|---------------------|-------|-------------|
| Дизайн | Дизайнер | Рисует макет в Illustrator/Photoshop, готовит файл для печати | 15мин–2ч | Компьютер |
| Печать | Печатник | Загружает файл в плоттер, печатает на плёнке | 10–30мин | Широкоформатный принтер |
| Резка | Печатник/Сборщик | Вырезает стикеры по контуру (плоттерная или ручная) | 10–60мин | Режущий плоттер |
| Ламинация | Сборщик | Наклеивает защитную плёнку (глянцевую/матовую) | 5–15мин | Ламинатор |
| Заливка смолой | Заливщик | Заливает эпоксидной смолой, ждёт высыхания 24ч | 15мин + 24ч сушка | Стол заливки |
| Сборка | Сборщик | Собирает стикерпаки, упаковывает в пакеты/коробки | 10–30мин | Руки |

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
