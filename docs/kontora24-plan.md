# Kontora24 — План проекта

> CRM / MES / WMS для стикерного производства «Контора»
> Дата: 30.04.2026 · Версия плана: 1.0

---

## 1. Что это

Внутренняя веб-платформа для управления полным циклом стикерного производства:
приём заказа → расчёт → дизайн → печать → резка → ламинация → заливка смолой → сборка → выдача.

**Пользователи:** 5 ролей (admin, manager, designer, printer, assembler).
**Цель:** заменить монолит crm_v3.jsx (~900KB) на модульное приложение с нормальной БД.

---

## 2. Стек

| Слой | Технология | Почему |
|------|-----------|--------|
| **Сборка** | Vite | Стандарт 2026, быстрый HMR, нативный ESM |
| **UI** | React 19 + JSX | Уже есть весь код на React |
| **Роутинг** | React Router v7 | Простой, хорошо документирован, достаточен для SPA |
| **Стейт** | Zustand | Легче Context для частых обновлений, нет провайдеров-обёрток |
| **Формы** | React Hook Form + Zod | Без ре-рендеров на каждый keystroke, валидация на схемах |
| **Стилизация** | Tailwind CSS 4 | Быстрая разработка, utility-first, хорошо с Vite |
| **БД + Auth** | Supabase (PostgreSQL) | Уже есть проект, Auth + RLS + Realtime + Storage из коробки |
| **Деплой** | Vercel | Автодеплой из GitHub, preview для PR |
| **IDE** | VS Code + Claude Code | AI-assisted development |

---

## 3. Архитектура — Feature-based

Каждый модуль (feature) содержит всё своё: компоненты, хуки, типы, утилиты.
Общие вещи живут в `shared/`.

```
kontora24/
├── .claude/
│   └── settings.json
├── CLAUDE.md
├── src/
│   ├── app/
│   │   ├── App.jsx            # Корневой компонент + роутер
│   │   ├── routes.jsx         # Все роуты в одном месте
│   │   └── providers.jsx      # QueryClient, Zustand devtools
│   │
│   ├── features/
│   │   ├── auth/
│   │   │   ├── components/    # LoginForm, AuthGuard
│   │   │   ├── hooks/         # useAuth, useSession
│   │   │   └── store.js       # Zustand store для auth
│   │   │
│   │   ├── orders/
│   │   │   ├── components/    # OrderCard, OrderForm, OrderList, StatusBadge
│   │   │   ├── hooks/         # useOrders, useOrderDetail
│   │   │   ├── pages/         # OrdersPage, OrderDetailPage
│   │   │   └── utils.js
│   │   │
│   │   ├── calculator/
│   │   │   ├── components/    # StickerCalculator, ResultCard, SettingsPanel
│   │   │   ├── lib/           # calculator.js — чистые функции расчёта
│   │   │   └── pages/         # CalculatorPage
│   │   │
│   │   ├── techcard/
│   │   │   ├── components/    # TechCard (A4), TechCardPrint
│   │   │   └── utils.js
│   │   │
│   │   ├── kp/
│   │   │   ├── components/    # CommercialProposal, PriceBlock
│   │   │   └── utils.js
│   │   │
│   │   ├── production/
│   │   │   ├── components/    # QueueCard, StatusSwitcher
│   │   │   └── pages/         # DesignQueue, PrintQueue, AssemblyQueue
│   │   │
│   │   ├── warehouse/
│   │   │   ├── components/    # MaterialCard, StockAlert
│   │   │   └── pages/         # WarehousePage
│   │   │
│   │   ├── clients/
│   │   │   ├── components/    # ClientCard, ClientForm
│   │   │   └── pages/         # ClientsPage
│   │   │
│   │   ├── analytics/
│   │   │   ├── components/    # RevenueChart, MarginTable
│   │   │   └── pages/         # AnalyticsPage
│   │   │
│   │   └── settings/
│   │       ├── components/    # SettingsForm, UserManagement
│   │       └── pages/         # SettingsPage
│   │
│   ├── shared/
│   │   ├── components/        # Button, Input, Card, Modal, Badge, Sidebar
│   │   ├── hooks/             # useRealtime, useDebounce
│   │   ├── lib/
│   │   │   ├── supabase.js    # Supabase client (singleton)
│   │   │   └── utils.js       # formatDate, formatPrice, pluralize
│   │   ├── stores/            # Zustand stores (глобальные)
│   │   └── constants.js       # Статусы, роли, enum-ы
│   │
│   ├── assets/
│   │   ├── fonts/
│   │   └── logo.svg
│   │
│   ├── styles/
│   │   └── globals.css
│   │
│   └── main.jsx
│
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   └── config.toml
│
├── public/
│   └── favicon.svg
├── .env.local
├── .env.example
├── vite.config.js
├── package.json
└── .gitignore
```

---

## 4. Supabase — база данных

**Project ID:** `pulzirakjqehsulmjhdj` · **Region:** `eu-west-1`

### Таблицы

```sql
-- Пользователи (расширение auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin','manager','designer','printer','assembler')),
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Клиенты
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  comment TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Заказы
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number SERIAL,
  client_id UUID REFERENCES clients(id),
  order_type TEXT NOT NULL,               -- sticker_cut, sticker_kiss, stickerpack, sticker3D, stickerpack3D, rect, big
  status TEXT NOT NULL DEFAULT 'new',     -- new → design → design_done → print → print_done → assembly → done / cancelled
  width_mm NUMERIC NOT NULL,
  height_mm NUMERIC NOT NULL,
  qty INTEGER NOT NULL,
  design_variants INTEGER DEFAULT 1,
  need_lam BOOLEAN DEFAULT false,
  lam_type TEXT,
  cost_materials NUMERIC,
  cost_labor NUMERIC,
  cost_total NUMERIC,
  markup NUMERIC,
  discount_pct NUMERIC,
  price_final NUMERIC,
  price_per_unit NUMERIC,
  prod_days INTEGER,
  assigned_to UUID REFERENCES profiles(id),
  created_by UUID REFERENCES profiles(id),
  deadline DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- История статусов
CREATE TABLE order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Склад материалов
CREATE TABLE materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,                     -- film, ink, lam_film, resin
  name TEXT NOT NULL,
  stock_qty NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL,                     -- m2, g, ml
  min_qty NUMERIC DEFAULT 0,
  price_per_unit NUMERIC,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Движение материалов
CREATE TABLE material_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID REFERENCES materials(id),
  order_id UUID REFERENCES orders(id),
  delta NUMERIC NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Настройки производства (key-value)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 5. Роуты

```
/                       → Dashboard
/orders                 → Список заказов
/orders/:id             → Детальная страница заказа
/calculator             → Калькулятор
/production/design      → Очередь дизайна
/production/print       → Очередь печати
/production/assembly    → Очередь сборки
/warehouse              → Склад
/clients                → Клиенты
/analytics              → Аналитика
/settings               → Настройки (только admin)
/login                  → Страница входа
```

---

## 6. Роли и доступ

| Роль | Что видит | Что делает |
|------|----------|-----------|
| **admin** | Всё | Всё, включая управление пользователями и настройками |
| **manager** | Dashboard, Заказы, Калькулятор, Клиенты, Аналитика | Создаёт заказы, назначает исполнителей, выставляет КП |
| **designer** | Dashboard, Очередь дизайна | Меняет статус design → design_done |
| **printer** | Dashboard, Очередь печати, Тех карты | Меняет статус print → print_done |
| **assembler** | Dashboard, Очередь сборки | Меняет статус assembly → done |

---

## 7. Калькулятор — ключевые формулы

### Константы по умолчанию

| Параметр | Значение |
|---------|---------|
| Ширина печатного блока | 1230 мм |
| Тех. отступ по высоте | 30 мм |
| Зазор между изделиями | 6 мм |
| Скорость реза | 200 мм/с |
| Скорость ламинации | 200 мм/с |
| Расход смолы | 0.1444 г/см² |
| Время заливки 1 листа | 1200 сек |
| Стоимость труда | 500 ₽/час |
| Плёнка (печать) | 180 ₽/м² |
| Краска | 120 ₽/м² |
| Смола | 1.2 ₽/г |
| Ламинационная плёнка | 120 ₽/м² |

### Формулы

1. **Изделий на лист** = `floor(printWidth / (width + gap))`
2. **Листов на тираж** = `ceil(qty / itemsPerSheet)`
3. **Плёнка** = `sheets × (printWidth × (height + margin)) / 1_000_000` м²
4. **Краска** = `qty × (width × height) / 1_000_000` м²
5. **Периметр** = `2 × (width + height)` мм
6. **Время резки** = `perimeter / cutSpeed × qty / 3600` ч
7. **Себестоимость** = материалы + труд
8. **Цена** = `себестоимость × наценка × (1 − скидка)`

### Наценки

| Тип | Множитель |
|-----|----------|
| Обычные стикеры | ×4.0 |
| Стикерпак | ×4.0 |
| 3D стикеры | ×4.5 |
| 3D стикерпак | ×4.5 |

### Скидки — стикеры

| Тираж | Скидка |
|-------|--------|
| 1–9 | 0% |
| 10–24 | 5% |
| 25–49 | 10% |
| 50–99 | 15% |
| 100–199 | 20% |
| 200–499 | 25% |
| 500+ | 30% |

---

## 8. Статусы заказа

```
new → design → design_done → print → print_done → assembly → done
  → cancelled (из любого статуса, только admin/manager)
```

| Кто переводит | Из | В |
|---|---|---|
| manager | new | design |
| designer | design | design_done |
| manager | design_done | print |
| printer | print | print_done |
| manager | print_done | assembly |
| assembler | assembly | done |
| admin, manager | любой | cancelled |

---

## 9. Фазы внедрения

### Фаза 0 — Инфраструктура ⏱ ~2ч
### Фаза 1 — Auth + Layout ⏱ ~3ч
### Фаза 2 — Калькулятор ⏱ ~3ч
### Фаза 3 — Заказы ⏱ ~4ч
### Фаза 4 — Тех карта + КП ⏱ ~3ч
### Фаза 5 — Производственные очереди + Realtime ⏱ ~4ч
### Фаза 6 — Склад ⏱ ~3ч
### Фаза 7 — Клиенты + Аналитика ⏱ ~3ч
### Фаза 8 — Полировка ⏱ ~2ч

---

*Этот документ — источник правды для проекта. Обновлять после каждой завершённой фазы.*
