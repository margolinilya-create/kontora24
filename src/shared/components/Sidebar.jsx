import { useEffect, useState, useCallback } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useThemeStore } from '@/shared/stores/theme-store'
import { useSidebarStore } from '@/shared/stores/sidebar-store'
import { NAV_ITEMS } from '@/shared/constants'
import { cn } from '@/shared/lib/utils'
import ConfirmDialog from '@/shared/components/ConfirmDialog'
import { RoleSwitcher } from '@/shared/components/RoleSwitcher'

const ICONS = {
  LayoutDashboard: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>,
  ShoppingCart: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" /></svg>,
  Palette: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z" /></svg>,
  Printer: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" /></svg>,
  Hammer: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085" /></svg>,
  Scissors: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.121 14.121L7.05 21.192m0-14.142l7.071 7.071m-4.95 1.414a2 2 0 11-2.828-2.828 2 2 0 012.828 2.828zm9.9 0a2 2 0 11-2.828-2.828 2 2 0 012.828 2.828z" /></svg>,
  Package: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
  Crosshair: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><line x1="22" y1="12" x2="18" y2="12" /><line x1="6" y1="12" x2="2" y2="12" /><line x1="12" y1="6" x2="12" y2="2" /><line x1="12" y1="22" x2="12" y2="18" /></svg>,
  Droplets: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 22c4-4 8-7.5 8-12a8 8 0 10-16 0c0 4.5 4 8 8 12z" /></svg>,
  FileCheck: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2 2 4-4m-2-8H8a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.828a2 2 0 00-.586-1.414l-3.828-3.828A2 2 0 0012.172 2H8z" /></svg>,
  Layers: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>,
  Combine: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><rect x="2" y="2" width="8" height="8" rx="1.5" /><rect x="14" y="14" width="8" height="8" rx="1.5" /><path strokeLinecap="round" strokeLinejoin="round" d="M8 6h8m-4-4v8m-4 4h8m-4-4v8" /></svg>,
  User: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>,
  FileText: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>,
  Warehouse: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.15c0 .415.336.75.75.75z" /></svg>,
  Users: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>,
  BarChart3: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>,
  Settings: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  HelpCircle: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
}

// Nav groups — all collapsible, collapsed by default
const PRODUCTION_QUEUE_PATHS = ['/production/design', '/production/prepress', '/production/print', '/production/lamination', '/production/cutting', '/production/pouring', '/production/selection', '/production/assembly3d', '/production/packaging', '/production/otk']

const NAV_GROUPS = [
  { id: 'manage', label: 'Управление', paths: ['/', '/orders'] },
  { id: 'production', label: 'Производство', paths: ['/production', ...PRODUCTION_QUEUE_PATHS], headerPath: '/production' },
  { id: 'resources', label: 'Ресурсы', paths: ['/warehouse', '/clients', '/analytics'] },
  { id: 'system', label: 'Система', paths: ['/cabinet', '/reports', '/settings', '/help'] },
]

const STORAGE_KEY = 'sidebar-groups'

function loadOpenGroups() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (stored && typeof stored === 'object') return stored
  } catch {}
  return {}
}

const COUNT_MAP = {
  '/orders': 'new',
  '/production/design': 'design',
  '/production/prepress': 'prepress',
  '/production/print': 'print',
  '/production/lamination': 'lamination',
  '/production/cutting': 'cutting',
  '/production/pouring': 'pouring',
  '/production/selection': 'selection_pouring',
  '/production/assembly3d': 'assembly_3d',
  '/production/packaging': 'packaging',
  '/production/otk': 'otk',
}

function Badge({ count, size = 'sm' }) {
  if (!count || count <= 0) return null
  const label = count > 99 ? '99+' : count
  return (
    <span className={cn(
      'bg-accent text-on-accent font-bold rounded-full flex items-center justify-center shrink-0',
      size === 'sm' ? 'text-[9px] min-w-[18px] h-[18px] px-1' : 'text-[10px] min-w-5 h-5 px-1'
    )}>
      {label}
    </span>
  )
}

function NavItem({ item, counts, lowStockCount, collapsed, indent, isHelper }) {
  const Icon = ICONS[item.icon] || ICONS.LayoutDashboard
  const count = COUNT_MAP[item.path] ? counts[COUNT_MAP[item.path]] : null
  const hasAlert = item.path === '/warehouse' && lowStockCount > 0

  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      title={isHelper ? `${item.label} (помощь)` : undefined}
      className={({ isActive }) => cn(
        'group relative flex items-center gap-2.5 rounded-lg text-[13px] transition-all min-h-[40px]',
        collapsed ? 'px-3 py-2 justify-center' : indent ? 'pl-9 pr-3 py-1.5' : 'px-3 py-2',
        isActive
          ? 'bg-white/12 text-white font-medium'
          : 'text-white/60 hover:bg-white/8 hover:text-white/90',
        isHelper && !isActive && 'opacity-55 hover:opacity-100'
      )}
    >
      {({ isActive }) => (
        <>
          {isActive && !collapsed && (
            <span className="absolute left-1 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-accent" />
          )}
          <span className="relative shrink-0">
            <Icon />
            {hasAlert && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-danger ring-2 ring-sidebar" aria-label="Низкий остаток материалов" />
            )}
          </span>
          {!collapsed && (
            <>
              <span className="flex-1 truncate">{item.label}</span>
              <Badge count={count} />
            </>
          )}
        </>
      )}
    </NavLink>
  )
}

export function Sidebar({ collapsed }) {
  const { profile, signOut } = useAuth()
  const { theme, toggle: toggleTheme } = useThemeStore()
  const counts = useSidebarStore((s) => s.counts)
  const lowStockCount = useSidebarStore((s) => s.lowStockCount)
  const fetchCounts = useSidebarStore((s) => s.fetchCounts)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [openGroups, setOpenGroups] = useState(loadOpenGroups)
  const location = useLocation()
  const role = profile?.role || 'viewer'

  const toggleGroup = useCallback((id) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  useEffect(() => {
    fetchCounts()
    const interval = setInterval(fetchCounts, 60000)
    return () => clearInterval(interval)
  }, [fetchCounts])

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role))

  const groupedNav = NAV_GROUPS.map((group) => ({
    ...group,
    items: visibleItems.filter((item) => group.paths.includes(item.path)),
  })).filter((g) => g.items.length > 0)

  return (
    <aside aria-label="Боковая навигация" className={cn(
      'fixed left-0 top-0 h-screen bg-sidebar text-white flex flex-col transition-all duration-200 z-40 safe-area-top safe-area-left',
      collapsed ? 'w-16' : 'w-60'
    )}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-white/8">
        <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-accent flex items-center justify-center font-bold text-sm text-on-accent">
          K
        </div>
        {!collapsed && <span className="text-lg font-semibold tracking-tight font-display">Kontora24</span>}
      </div>

      {/* Nav */}
      <nav aria-label="Основная навигация" className="flex-1 overflow-y-auto py-1.5 px-2">
        {groupedNav.map((group, gi) => {
          const isOpen = !!openGroups[group.id]
          const hasHeader = !!group.headerPath
          const childItems = hasHeader
            ? group.items.filter((item) => item.path !== group.headerPath)
            : group.items

          // Badge total for collapsed state
          const groupTotal = group.items.reduce((sum, item) => {
            const key = COUNT_MAP[item.path]
            return sum + (key ? (counts[key] || 0) : 0)
          }, 0)

          // Check if current route is within this group
          const isGroupActive = group.paths.some(p =>
            p === '/' ? location.pathname === '/' : location.pathname.startsWith(p)
          )

          return (
            <div key={group.id}>
              {/* Divider between groups */}
              {gi > 0 && !collapsed && (
                <div className="mx-3 my-1.5 border-t border-white/8" />
              )}

              {/* Group header — clickable row with label + badge + chevron */}
              {!collapsed && (
                <button
                  onClick={() => toggleGroup(group.id)}
                  className={cn(
                    'flex items-center gap-2 w-full px-3 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-wider transition-colors',
                    isGroupActive && !isOpen
                      ? 'text-white/90'
                      : 'text-white/40 hover:text-white/70'
                  )}
                >
                  <span className="flex-1 text-left">{group.label}</span>
                  {!isOpen && groupTotal > 0 && <Badge count={groupTotal} size="sm" />}
                  <svg
                    className={cn(
                      'w-3 h-3 transition-transform duration-200 opacity-50',
                      isOpen && 'rotate-180'
                    )}
                    fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
              )}

              {/* Pinned header (Производство board) — always visible */}
              {hasHeader && group.items
                .filter((item) => item.path === group.headerPath)
                .map((item) => (
                  <NavItem
                    key={item.path}
                    item={item}
                    counts={counts}
                    lowStockCount={lowStockCount}
                    collapsed={collapsed}
                    isHelper={item.helperRoles?.includes(role)}
                  />
                ))}

              {/* Child items */}
              {(collapsed || isOpen) && childItems.map((item) => (
                <NavItem
                  key={item.path}
                  item={item}
                  counts={counts}
                  lowStockCount={lowStockCount}
                  collapsed={collapsed}
                  indent={hasHeader}
                  isHelper={item.helperRoles?.includes(role)}
                />
              ))}
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/8 p-2 space-y-0.5">
        {!collapsed && profile && (
          <div className="flex items-center gap-2.5 px-3 py-1.5">
            <div className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center text-[11px] font-semibold text-accent">
              {profile.display_name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium truncate">{profile.display_name}</p>
              <p className="text-[11px] text-white/50 capitalize">{profile.role}</p>
            </div>
          </div>
        )}
        <RoleSwitcher collapsed={collapsed} />
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] text-white/50 hover:bg-white/8 hover:text-white/80 transition-colors"
          aria-label="Сменить тему"
        >
          {theme === 'light' ? (
            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" /></svg>
          ) : (
            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>
          )}
          {!collapsed && <span>{theme === 'light' ? 'Тёмная' : 'Светлая'}</span>}
        </button>
        <button
          onClick={() => setShowLogoutConfirm(true)}
          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] text-white/50 hover:bg-white/8 hover:text-white/80 transition-colors"
          aria-label="Выйти"
        >
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" /></svg>
          {!collapsed && <span>Выйти</span>}
        </button>
      </div>

      <ConfirmDialog
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={() => { setShowLogoutConfirm(false); signOut() }}
        title="Выйти из системы?"
        message="Вы уверены, что хотите выйти?"
        confirmText="Выйти"
      />
    </aside>
  )
}
