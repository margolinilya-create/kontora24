import { lazy } from 'react'
import { Layout } from '@/shared/components/Layout'
import { AuthGuard } from '@/features/auth/components/AuthGuard'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import { LoginForm } from '@/features/auth/components/LoginForm'
import { NotFoundPage } from '@/shared/components/NotFoundPage'

// Lazy-loaded pages
const DashboardPage = lazy(() => import('@/features/analytics/pages/DashboardPage'))
const OrdersPage = lazy(() => import('@/features/orders/pages/OrdersPage'))
const OrderDetailPage = lazy(() => import('@/features/orders/pages/OrderDetailPage'))
const CreateOrderPage = lazy(() => import('@/features/orders/pages/CreateOrderPage'))
const DesignQueuePage = lazy(() => import('@/features/production/pages/DesignQueuePage'))
const PrepressQueuePage = lazy(() => import('@/features/production/pages/PrepressQueuePage'))
const PrintQueuePage = lazy(() => import('@/features/production/pages/PrintQueuePage'))
const LaminationQueuePage = lazy(() => import('@/features/production/pages/LaminationQueuePage'))
const CuttingQueuePage = lazy(() => import('@/features/production/pages/CuttingQueuePage'))
const PouringQueuePage = lazy(() => import('@/features/production/pages/PouringQueuePage'))
const SelectionPouringQueuePage = lazy(() => import('@/features/production/pages/SelectionPouringQueuePage'))
const Assembly3dQueuePage = lazy(() => import('@/features/production/pages/Assembly3dQueuePage'))
const PackagingQueuePage = lazy(() => import('@/features/production/pages/PackagingQueuePage'))
const OtkQueuePage = lazy(() => import('@/features/production/pages/OtkQueuePage'))
const WarehousePage = lazy(() => import('@/features/warehouse/pages/WarehousePage'))
const ClientsPage = lazy(() => import('@/features/clients/pages/ClientsPage'))
const ClientDetailPage = lazy(() => import('@/features/clients/pages/ClientDetailPage'))
const AnalyticsPage = lazy(() => import('@/features/analytics/pages/AnalyticsPage'))
const SettingsPage = lazy(() => import('@/features/settings/pages/SettingsPage'))
const CabinetPage = lazy(() => import('@/features/cabinet/pages/CabinetPage'))
const ReportsPage = lazy(() => import('@/features/reports/pages/ReportsPage'))
const HelpPage = lazy(() => import('@/features/help/pages/HelpPage'))

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
      { index: true, element: <ErrorBoundary><DashboardPage /></ErrorBoundary> },
      { path: 'orders', element: <AuthGuard roles={['admin', 'manager']}><ErrorBoundary><OrdersPage /></ErrorBoundary></AuthGuard> },
      { path: 'orders/create', element: <AuthGuard roles={['admin', 'manager']}><ErrorBoundary><CreateOrderPage /></ErrorBoundary></AuthGuard> },
      { path: 'orders/:id', element: <ErrorBoundary><OrderDetailPage /></ErrorBoundary> },
      { path: 'production/design', element: <AuthGuard roles={['admin', 'manager', 'designer']}><ErrorBoundary><DesignQueuePage /></ErrorBoundary></AuthGuard> },
      { path: 'production/prepress', element: <AuthGuard roles={['admin', 'manager', 'designer', 'printer']}><ErrorBoundary><PrepressQueuePage /></ErrorBoundary></AuthGuard> },
      { path: 'production/print', element: <AuthGuard roles={['admin', 'manager', 'printer']}><ErrorBoundary><PrintQueuePage /></ErrorBoundary></AuthGuard> },
      { path: 'production/lamination', element: <AuthGuard roles={['admin', 'manager', 'printer']}><ErrorBoundary><LaminationQueuePage /></ErrorBoundary></AuthGuard> },
      { path: 'production/cutting', element: <AuthGuard roles={['admin', 'manager', 'printer']}><ErrorBoundary><CuttingQueuePage /></ErrorBoundary></AuthGuard> },
      { path: 'production/pouring', element: <AuthGuard roles={['admin', 'manager', 'post_printer', 'printer']}><ErrorBoundary><PouringQueuePage /></ErrorBoundary></AuthGuard> },
      { path: 'production/selection', element: <AuthGuard roles={['admin', 'manager', 'post_printer', 'printer']}><ErrorBoundary><SelectionPouringQueuePage /></ErrorBoundary></AuthGuard> },
      { path: 'production/assembly3d', element: <AuthGuard roles={['admin', 'manager', 'post_printer', 'printer']}><ErrorBoundary><Assembly3dQueuePage /></ErrorBoundary></AuthGuard> },
      { path: 'production/packaging', element: <AuthGuard roles={['admin', 'manager', 'post_printer', 'printer']}><ErrorBoundary><PackagingQueuePage /></ErrorBoundary></AuthGuard> },
      { path: 'production/otk', element: <AuthGuard roles={['admin', 'manager']}><ErrorBoundary><OtkQueuePage /></ErrorBoundary></AuthGuard> },
      { path: 'warehouse', element: <AuthGuard roles={['admin', 'manager']}><ErrorBoundary><WarehousePage /></ErrorBoundary></AuthGuard> },
      { path: 'clients', element: <AuthGuard roles={['admin', 'manager']}><ErrorBoundary><ClientsPage /></ErrorBoundary></AuthGuard> },
      { path: 'clients/:id', element: <AuthGuard roles={['admin', 'manager']}><ErrorBoundary><ClientDetailPage /></ErrorBoundary></AuthGuard> },
      { path: 'analytics', element: <AuthGuard roles={['admin', 'manager']}><ErrorBoundary><AnalyticsPage /></ErrorBoundary></AuthGuard> },
      { path: 'cabinet', element: <ErrorBoundary><CabinetPage /></ErrorBoundary> },
      { path: 'reports', element: <AuthGuard roles={['admin']}><ErrorBoundary><ReportsPage /></ErrorBoundary></AuthGuard> },
      { path: 'settings', element: <AuthGuard roles={['admin']}><ErrorBoundary><SettingsPage /></ErrorBoundary></AuthGuard> },
      { path: 'help', element: <ErrorBoundary><HelpPage /></ErrorBoundary> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
