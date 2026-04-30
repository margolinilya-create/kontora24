# Kontora24 — CRM/MES/WMS для стикерного производства

CRM-система для управления полным циклом стикерного производства: заказы → расчёт → дизайн → печать → сборка → выдача.

**Полный план:** `docs/kontora24-plan.md`

## Стек

| Слой | Технология |
|------|-----------|
| Сборка | Vite |
| UI | React 19 + JSX |
| Роутинг | React Router v7 |
| Стейт | Zustand |
| Формы | React Hook Form + Zod |
| Стили | Tailwind CSS 4 |
| БД + Auth | Supabase (PostgreSQL + RLS + Realtime) |
| Деплой | Vercel |

**Supabase project:** `pulzirakjqehsulmjhdj` (eu-west-1)

## Роли

| Роль | Доступ |
|------|--------|
| admin | Всё |
| manager | Заказы, Калькулятор, Клиенты, Аналитика |
| designer | Очередь дизайна |
| printer | Очередь печати, Тех карты |
| assembler | Очередь сборки |

## Команды

```bash
npm run dev          # Dev server (Vite)
npm run build        # Production build
npm run preview      # Preview production build
npx vitest           # Run tests
npm run lint         # ESLint
```

## Архитектура — Feature-based

```
src/
  app/             # App.jsx, routes.jsx, providers.jsx
  features/        # Модули: auth, orders, calculator, production, warehouse, clients, analytics, settings, techcard, kp
    <module>/
      components/  # React components
      hooks/       # Custom hooks
      pages/       # Route-level pages
      lib/         # Pure functions (e.g. calculator logic)
      store.js     # Zustand store
  shared/
    components/    # Layout, Sidebar, Button, Card, Modal, Badge
    hooks/         # useDebounce, useRealtime
    lib/           # supabase.js, utils.js
    stores/        # Global Zustand stores
    constants.js   # Statuses, roles, enums
  styles/          # globals.css (Tailwind directives)
  assets/          # Fonts, logos
```

## Правила

- **Архитектура:** feature-based — каждый модуль самодостаточен
- **Бизнес-логика:** чистые функции без React (testable), живут в `lib/`
- **Import alias:** `@/` → `src/`
- **UI текст:** русский
- **Код, комментарии, переменные:** английский
- **Git:** feature-ветки → squash merge в main
- **Никогда не коммитить:** `.env.local`, ключи, пароли
- **Формы:** React Hook Form + Zod, валидация на клиенте и сервере
- **State:** Zustand для клиентского стейта, Supabase realtime для данных
- **Тесты:** Vitest для бизнес-логики (калькулятор, утилиты)

## Текущая фаза

Фаза 0-2: Инфраструктура + Auth + Layout + Калькулятор — готово.
Следующий шаг: Фаза 3 — Заказы (CRUD, статусы, связь с калькулятором).
