import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { cn } from '@/shared/lib/utils'

export function Layout() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="min-h-screen bg-surface-dim">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />

      <div className={cn('transition-all duration-200', collapsed ? 'ml-16' : 'ml-60')}>
        {/* Header */}
        <header className="sticky top-0 z-30 flex items-center gap-4 h-14 bg-surface border-b border-border px-6">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-lg hover:bg-surface-dim transition-colors"
          >
            <svg className="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
        </header>

        {/* Content */}
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
