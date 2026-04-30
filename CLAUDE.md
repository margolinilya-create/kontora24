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
| БД + Auth | Supabase (PostgreSQL + RLS + Realtime + Storage) |
| Деплой | Vercel (auto) |

**Supabase project:** `pulzirakjqehsulmjhdj` (eu-west-1) — shared с pinhead, таблицы kontora24 без префикса.

## Роли

| Роль | Доступ |
|------|--------|
| admin | Всё, включая настройки и пользователей |
| manager | Заказы, Калькулятор, Клиенты, Аналитика, Производство |
| designer | Dashboard + Очередь дизайна |
| printer | Dashboard + Очередь печати |
| assembler | Dashboard + Очередь сборки |

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
    production/         # ProductionBoardPage (drag-and-drop), DesignQueue, PrintQueue, AssemblyQueue,
                        #   DraggableCard, QueueCard
    warehouse/          # WarehousePage (tabs: stock/analytics), MaterialCard, StockModal,
                        #   MaterialForm, ConsumptionChart (forecast)
    clients/            # ClientsPage, ClientDetailPage (LTV, order history), ClientForm
    analytics/          # DashboardPage (role-based), AnalyticsPage (period filter, charts,
                        #   comparison, workload, material consumption, top clients)
    techcard/           # TechCard (A4), TechCardActions (PNG/PDF/Print)
    kp/                 # CommercialProposal (text copy)
    settings/           # SettingsPage (calculator params, markups, users, profile, invites)
  shared/
    components/         # Layout, Sidebar (grouped nav, counters, theme toggle),
                        #   ErrorBoundary, Toaster, Skeleton, Pagination, Breadcrumbs,
                        #   NotFoundPage, OfflineIndicator
    hooks/              # useDebounce, useRealtime, usePagination
    lib/                # supabase.js, utils.js, export.js (CSV)
    stores/             # toast-store, theme-store, sidebar-store
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

`profiles` · `clients` · `orders` · `order_status_history` · `order_comments` · `order_attachments` · `materials` · `material_transactions` · `settings`

Storage bucket: `order-files`

RPC: `update_stock(material_id, delta)` · `auto_deduct_materials(order_id, changed_by)`

## Реализовано (88/112 пунктов плана = 79%)

### Готово
- Auth: login, logout, role guard, password reset, Russian errors
- Dashboard: role-based (workers see queue, managers see all), deadlines, activity feed, low stock
- Orders: table + kanban toggle, search, pagination, sort, status filters, saved filters, bulk actions, CSV export
- Order detail: edit (notes/deadline/assignee), comments (realtime), file attachments (Storage), visual timeline, tech card (PNG/PDF/print), КП, PDF export, duplicate, Bitrix link
- Calculator: full formulas, presets, reset, layout preview, compare mode, history (localStorage), auto-calc from Bitrix webhook
- Production: unified board with drag-and-drop (@dnd-kit), claim button, time-in-status, sort by deadline, "my orders" filter
- Warehouse: materials CRUD, stock modal with balance + history tab, auto-deduct on print, consumption chart, forecast table, low stock filter
- Clients: list with search, detail page (LTV, order history, tags), create form
- Analytics: period filter (7d/30d/90d/all), revenue by type (bar), status pie, avg stage time, conversion, revenue trend (line), top clients, workload by assignee, material consumption, period comparison, PDF export
- Settings: calculator params from DB, markup editor, user management (roles), profile (name/password), invite by email
- Tech card: A4 layout, PNG/PDF export, print CSS
- Infra: error boundaries, pagination, toast system, skeleton loading, dark theme, PWA manifest, offline indicator, 22 Vitest tests
- Bitrix: incoming webhook (auto-create + auto-calc), outbound webhook (status sync)

### Осталось (интеграции — отложены)
- Bitrix config UI в настройках (webhook URL, маппинг полей)
- Bitrix retry/queue при недоступности
- Integration log page
- Telegram уведомления
- CI/CD (GitHub Actions)
- Звуковые уведомления
- Кастомные шрифты (Onder/Guidy)

## Правила

- **Архитектура:** feature-based, каждый модуль самодостаточен
- **Бизнес-логика:** чистые функции без React, в `lib/`
- **Import alias:** `@/` → `src/`
- **UI текст:** русский · **Код:** английский
- **Git:** feature-ветки → squash merge в main
- **Никогда не коммитить:** `.env.local`, ключи, пароли
- **Тесты:** Vitest для бизнес-логики
- **Деплой:** `npx vercel deploy --yes --prod --scope margolinilya-creates-projects`
