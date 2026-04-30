import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { ErrorBoundary } from './ErrorBoundary'
import { useSidebarStore } from '@/shared/stores/sidebar-store'
import { cn } from '@/shared/lib/utils'

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/orders': 'Заказы',
  '/calculator': 'Калькулятор',
  '/production': 'Производство',
  '/production/design': 'Дизайн',
  '/production/print': 'Печать',
  '/production/assembly': 'Сборка',
  '/warehouse': 'Склад',
  '/clients': 'Клиенты',
  '/analytics': 'Аналитика',
  '/settings': 'Настройки',
}

export function Layout() {
  const collapsed = useSidebarStore((s) => s.collapsed)
  const toggleCollapsed = useSidebarStore((s) => s.toggleCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  // Get page title from path (handle /orders/:id etc)
  const basePath = '/' + (location.pathname.split('/').filter(Boolean).slice(0, 2).join('/') || '')
  const pageTitle = PAGE_TITLES[location.pathname] || PAGE_TITLES[basePath] || PAGE_TITLES['/' + location.pathname.split('/')[1]] || ''

  return (
    <div className="min-h-screen bg-surface-dim">
      <div className="hidden md:block">
        <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative z-50 w-60" onClick={(e) => e.stopPropagation()}>
            <Sidebar collapsed={false} onToggle={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className={cn('transition-all duration-200', collapsed ? 'md:ml-16' : 'md:ml-60')}>
        <header className="sticky top-0 z-30 flex items-center gap-4 h-14 bg-surface border-b border-border px-4 sm:px-6">
          <button
            onClick={() => {
              if (window.innerWidth < 768) setMobileOpen(!mobileOpen)
              else toggleCollapsed()
            }}
            className="p-1.5 rounded-lg hover:bg-surface-dim transition-colors"
            aria-label="Меню"
          >
            <svg className="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          {pageTitle && <h2 className="text-sm font-medium text-text-muted">{pageTitle}</h2>}
        </header>

        <main className="p-4 sm:p-6">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
