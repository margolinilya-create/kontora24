import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { ErrorBoundary } from './ErrorBoundary'
import { cn } from '@/shared/lib/utils'

export function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  // Close mobile sidebar on navigation
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  return (
    <div className="min-h-screen bg-surface-dim">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative z-50 w-60" onClick={(e) => e.stopPropagation()}>
            <Sidebar collapsed={false} onToggle={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className={cn('transition-all duration-200', collapsed ? 'md:ml-16' : 'md:ml-60')}>
        {/* Header */}
        <header className="sticky top-0 z-30 flex items-center gap-4 h-14 bg-surface border-b border-border px-4 sm:px-6">
          <button
            onClick={() => {
              if (window.innerWidth < 768) setMobileOpen(!mobileOpen)
              else setCollapsed(!collapsed)
            }}
            className="p-1.5 rounded-lg hover:bg-surface-dim transition-colors"
            aria-label="Меню"
          >
            <svg className="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
        </header>

        {/* Content */}
        <main className="p-4 sm:p-6">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
