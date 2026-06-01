import { Link, useLocation } from 'react-router-dom'
import { NAV_ITEMS } from '@/shared/constants'

const PATH_LABELS = Object.fromEntries(NAV_ITEMS.map((item) => [item.path, item.label]))

// Динамические сегменты с уникальной обработкой (для /orders/:id, /clients/:id и т.п.)
// Лейбл подкручивается в DynamicCrumb через `useOutletContext` если страница
// передаёт его через outlet; иначе fallback — генерируется по сегменту.
const SUBPATH_LABELS = {
  '/orders/create': 'Новый заказ',
  '/orders': 'Заказы',
  '/clients': 'Клиенты',
  '/warehouse': 'Склад',
  '/analytics': 'Аналитика',
  '/reports': 'Отчёты',
  '/settings': 'Настройки',
  '/cabinet': 'Кабинет',
  '/help': 'Справка',
}

/**
 * R11.4: хлебные крошки сверху main-области. Прячется на корневой странице.
 * Парсит pathname → массив крошек. Динамические сегменты (UUID, числовые ID)
 * получают плейсхолдер «Заказ» / «Клиент» в зависимости от родительского пути.
 *
 * Пример:
 *   /orders                      → [Главная, Заказы]
 *   /orders/abcd-1234            → [Главная, Заказы, Заказ]
 *   /production/print            → [Главная, Печать]
 */
export function Breadcrumbs() {
  const location = useLocation()
  const segments = location.pathname.split('/').filter(Boolean)
  if (segments.length === 0) return null

  const crumbs = []
  let acc = ''
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    acc += '/' + seg
    const label = resolveLabel(acc, seg, segments[i - 1])
    if (!label) continue
    crumbs.push({ path: acc, label, isLast: i === segments.length - 1 })
  }

  if (crumbs.length === 0) return null

  return (
    <nav aria-label="Хлебные крошки" className="px-4 sm:px-6 pt-3 pb-1">
      <ol className="flex items-center flex-wrap gap-1 text-xs text-text-muted">
        <li>
          <Link to="/" className="hover:text-text transition-colors">Главная</Link>
        </li>
        {crumbs.map((c) => (
          <li key={c.path} className="flex items-center gap-1">
            <ChevronIcon />
            {c.isLast ? (
              <span className="text-text font-medium" aria-current="page">{c.label}</span>
            ) : (
              <Link to={c.path} className="hover:text-text transition-colors">{c.label}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

function resolveLabel(fullPath, segment, parentSegment) {
  // 1. Точное совпадение по NAV_ITEMS / SUBPATH_LABELS
  if (SUBPATH_LABELS[fullPath]) return SUBPATH_LABELS[fullPath]
  if (PATH_LABELS[fullPath]) return PATH_LABELS[fullPath]

  // 2. Динамические сегменты (UUID / числовой ID) — показываем тип родителя
  if (isDynamicSegment(segment)) {
    if (parentSegment === 'orders') return 'Заказ'
    if (parentSegment === 'clients') return 'Клиент'
    return null // прячем UUID без контекста
  }

  // 3. Под-сегменты production (/production/print → «Печать»)
  if (parentSegment === 'production') {
    return PATH_LABELS[fullPath] || PATH_LABELS[`/production/${segment}`] || capitalize(segment)
  }

  return capitalize(segment)
}

function isDynamicSegment(s) {
  // UUID v4
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true
  // Числовой ID
  if (/^\d+$/.test(s)) return true
  return false
}

function capitalize(s) {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
