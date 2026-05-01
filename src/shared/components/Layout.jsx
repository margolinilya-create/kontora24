import { useState, useEffect, Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { ErrorBoundary } from './ErrorBoundary'
import Spinner from '@/shared/components/Spinner'
import { useSidebarStore } from '@/shared/stores/sidebar-store'
import { cn } from '@/shared/lib/utils'
import { useDeadlineAlerts } from '@/shared/hooks/useDeadlineAlerts'
import { useStageNotifications } from '@/shared/hooks/useStageNotifications'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { ROLES } from '@/shared/constants'

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
  const { profile, signOut } = useAuth()

  useDeadlineAlerts()
  useStageNotifications()

  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  // Get page title from path (handle /orders/:id etc)
  const basePath = '/' + (location.pathname.split('/').filter(Boolean).slice(0, 2).join('/') || '')
  const pageTitle = PAGE_TITLES[location.pathname] || PAGE_TITLES[basePath] || PAGE_TITLES['/' + location.pathname.split('/')[1]] || ''

  // Simplified layout for worker roles
  const isWorker = profile && ['designer', 'printer', 'assembler', 'resin_pourer'].includes(profile.role)

  if (isWorker) {
    return (
      <div className="min-h-screen bg-surface-dim">
        <header className="sticky top-0 z-40 bg-sidebar text-white px-4 py-3 flex items-center justify-between">
          <div>
            <span className="font-semibold">{ROLES[profile.role]?.label}</span>
            <span className="text-white/60 ml-2 text-sm">{profile.display_name}</span>
          </div>
          <button onClick={() => { if (window.confirm('Выйти?')) signOut() }} className="text-white/60 hover:text-white text-sm">
            Выход
          </button>
        </header>
        <main id="main-content" className="p-4 sm:p-6">
          <ErrorBoundary>
            <Suspense fallback={<div className="flex justify-center py-12"><Spinner size="lg" /></div>}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-dim">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-accent focus:text-white focus:px-4 focus:py-2 focus:rounded-lg">
        Перейти к содержимому
      </a>
      <div className="hidden md:block">
        <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/50" role="button" aria-label="Закрыть меню" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setMobileOpen(false)} />
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
            className="p-2.5 rounded-lg hover:bg-surface-dim transition-colors"
            aria-label="Меню"
          >
            <svg className="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          {pageTitle && <h2 className="text-sm font-medium text-text-muted">{pageTitle}</h2>}
        </header>

        <main id="main-content" className="p-4 sm:p-6">
          <ErrorBoundary>
            <Suspense fallback={<div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
