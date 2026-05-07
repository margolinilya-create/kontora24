import { useState, useEffect, Suspense } from 'react'
import { Outlet, useLocation, Link } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { ErrorBoundary } from './ErrorBoundary'
import Spinner from '@/shared/components/Spinner'
import { useSidebarStore } from '@/shared/stores/sidebar-store'
import { cn } from '@/shared/lib/utils'
import { useDeadlineAlerts } from '@/shared/hooks/useDeadlineAlerts'
import { useStageNotifications } from '@/shared/hooks/useStageNotifications'
import { NAV_ITEMS } from '@/shared/constants'
import { RoleEmulationBanner } from './RoleEmulationBanner'

const PAGE_TITLES = Object.fromEntries(NAV_ITEMS.map(item => [item.path, item.label]))

export function Layout() {
  const collapsed = useSidebarStore((s) => s.collapsed)
  const toggleCollapsed = useSidebarStore((s) => s.toggleCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  useDeadlineAlerts()
  useStageNotifications()

  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  // Get page title from path (handle /orders/:id etc)
  const basePath = '/' + (location.pathname.split('/').filter(Boolean).slice(0, 2).join('/') || '')
  const pageTitle = PAGE_TITLES[location.pathname] || PAGE_TITLES[basePath] || PAGE_TITLES['/' + location.pathname.split('/')[1]] || ''

  return (
    <div className="min-h-screen bg-bg">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-accent focus:text-on-accent focus:px-4 focus:py-2 focus:rounded-xl focus:shadow-card">
        Перейти к содержимому
      </a>
      <div className="hidden md:block">
        <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" role="button" aria-label="Закрыть меню" tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setMobileOpen(false))} />
          <div className="relative z-50 w-60" onClick={(e) => e.stopPropagation()}>
            <Sidebar collapsed={false} onToggle={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className={cn('transition-all duration-200', collapsed ? 'md:ml-16' : 'md:ml-60')}>
        <header className="sticky top-0 z-30 flex items-center gap-4 h-14 bg-surface/80 backdrop-blur-md border-b border-border px-4 sm:px-6">
          <button
            onClick={() => {
              if (window.innerWidth < 768) setMobileOpen(!mobileOpen)
              else toggleCollapsed()
            }}
            className="p-3 rounded-xl hover:bg-surface-2 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Меню"
          >
            <svg className="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          {pageTitle && <h2 className="text-sm font-medium text-text-muted">{pageTitle}</h2>}
          <Link to="/help" className="ml-auto p-2.5 rounded-xl hover:bg-surface-2 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="Справка">
            <svg className="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </Link>
        </header>

        <main id="main-content" className="p-4 sm:p-6">
          <ErrorBoundary>
            <Suspense fallback={<div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <RoleEmulationBanner />
    </div>
  )
}
