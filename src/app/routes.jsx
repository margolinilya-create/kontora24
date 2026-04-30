import { lazy } from 'react'
import { Layout } from '@/shared/components/Layout'
import { AuthGuard } from '@/features/auth/components/AuthGuard'
import { LoginForm } from '@/features/auth/components/LoginForm'

// Lazy-loaded pages
const DashboardPage = lazy(() => import('@/features/analytics/pages/DashboardPage'))
const OrdersPage = lazy(() => import('@/features/orders/pages/OrdersPage'))
const OrderDetailPage = lazy(() => import('@/features/orders/pages/OrderDetailPage'))
const CalculatorPage = lazy(() => import('@/features/calculator/pages/CalculatorPage'))
const DesignQueuePage = lazy(() => import('@/features/production/pages/DesignQueuePage'))
const PrintQueuePage = lazy(() => import('@/features/production/pages/PrintQueuePage'))
const AssemblyQueuePage = lazy(() => import('@/features/production/pages/AssemblyQueuePage'))
const WarehousePage = lazy(() => import('@/features/warehouse/pages/WarehousePage'))
const ClientsPage = lazy(() => import('@/features/clients/pages/ClientsPage'))
const AnalyticsPage = lazy(() => import('@/features/analytics/pages/AnalyticsPage'))
const SettingsPage = lazy(() => import('@/features/settings/pages/SettingsPage'))

export const routes = [
  {
    path: '/login',
    element: <LoginForm />,
  },
  {
    element: (
      <AuthGuard>
        <Layout />
      </AuthGuard>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'orders', element: <AuthGuard roles={['admin', 'manager']}><OrdersPage /></AuthGuard> },
      { path: 'orders/:id', element: <AuthGuard roles={['admin', 'manager']}><OrderDetailPage /></AuthGuard> },
      { path: 'calculator', element: <AuthGuard roles={['admin', 'manager']}><CalculatorPage /></AuthGuard> },
      { path: 'production/design', element: <AuthGuard roles={['admin', 'manager', 'designer']}><DesignQueuePage /></AuthGuard> },
      { path: 'production/print', element: <AuthGuard roles={['admin', 'manager', 'printer']}><PrintQueuePage /></AuthGuard> },
      { path: 'production/assembly', element: <AuthGuard roles={['admin', 'manager', 'assembler']}><AssemblyQueuePage /></AuthGuard> },
      { path: 'warehouse', element: <AuthGuard roles={['admin', 'manager']}><WarehousePage /></AuthGuard> },
      { path: 'clients', element: <AuthGuard roles={['admin', 'manager']}><ClientsPage /></AuthGuard> },
      { path: 'analytics', element: <AuthGuard roles={['admin', 'manager']}><AnalyticsPage /></AuthGuard> },
      { path: 'settings', element: <AuthGuard roles={['admin']}><SettingsPage /></AuthGuard> },
    ],
  },
]
