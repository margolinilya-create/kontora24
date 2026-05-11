import { lazy } from 'react'
import { Navigate } from 'react-router-dom'
import { Layout } from '@/shared/components/Layout'
import { AuthGuard } from '@/features/auth/components/AuthGuard'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import { LoginForm } from '@/features/auth/components/LoginForm'
import { NotFoundPage } from '@/shared/components/NotFoundPage'
import { useAuth } from '@/features/auth/hooks/useAuth'

/**
 * Главная по аудиту R5 (8.05): для рабочих ролей при первом входе —
 * сразу личный кабинет; админ/менеджер видят DashboardPage.
 */
function HomeRoute() {
  const { profile, hasRole } = useAuth()
  if (!profile) return null
  const isManager = hasRole(['admin', 'manager'])
  if (!isManager) return <Navigate to="/cabinet" replace />
  return <DashboardPage />
}

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
      { index: true, element: <ErrorBoundary><HomeRoute /></ErrorBoundary> },
      { path: 'orders', element: <ErrorBoundary><OrdersPage /></ErrorBoundary> },
      { path: 'orders/create', element: <AuthGuard permission="order:create"><ErrorBoundary><CreateOrderPage /></ErrorBoundary></AuthGuard> },
      { path: 'orders/:id', element: <ErrorBoundary><OrderDetailPage /></ErrorBoundary> },
      { path: 'production/design', element: <AuthGuard permission="stage:design"><ErrorBoundary><DesignQueuePage /></ErrorBoundary></AuthGuard> },
      { path: 'production/prepress', element: <AuthGuard permission="stage:prepress"><ErrorBoundary><PrepressQueuePage /></ErrorBoundary></AuthGuard> },
      { path: 'production/print', element: <AuthGuard permission="stage:print"><ErrorBoundary><PrintQueuePage /></ErrorBoundary></AuthGuard> },
      { path: 'production/lamination', element: <AuthGuard permission="stage:lamination"><ErrorBoundary><LaminationQueuePage /></ErrorBoundary></AuthGuard> },
      { path: 'production/cutting', element: <AuthGuard permission="stage:cutting"><ErrorBoundary><CuttingQueuePage /></ErrorBoundary></AuthGuard> },
      { path: 'production/pouring', element: <AuthGuard permission="stage:pouring"><ErrorBoundary><PouringQueuePage /></ErrorBoundary></AuthGuard> },
      { path: 'production/selection', element: <AuthGuard permission="stage:selection_pouring"><ErrorBoundary><SelectionPouringQueuePage /></ErrorBoundary></AuthGuard> },
      { path: 'production/assembly3d', element: <AuthGuard permission="stage:assembly_3d"><ErrorBoundary><Assembly3dQueuePage /></ErrorBoundary></AuthGuard> },
      { path: 'production/packaging', element: <AuthGuard permission="stage:packaging"><ErrorBoundary><PackagingQueuePage /></ErrorBoundary></AuthGuard> },
      { path: 'production/otk', element: <AuthGuard permission="stage:otk"><ErrorBoundary><OtkQueuePage /></ErrorBoundary></AuthGuard> },
      { path: 'warehouse', element: <AuthGuard permission="view:warehouse"><ErrorBoundary><WarehousePage /></ErrorBoundary></AuthGuard> },
      { path: 'clients', element: <AuthGuard permission="view:clients"><ErrorBoundary><ClientsPage /></ErrorBoundary></AuthGuard> },
      { path: 'clients/:id', element: <AuthGuard permission="view:clients"><ErrorBoundary><ClientDetailPage /></ErrorBoundary></AuthGuard> },
      { path: 'analytics', element: <AuthGuard permission="view:analytics"><ErrorBoundary><AnalyticsPage /></ErrorBoundary></AuthGuard> },
      { path: 'cabinet', element: <ErrorBoundary><CabinetPage /></ErrorBoundary> },
      { path: 'reports', element: <AuthGuard permission="view:reports"><ErrorBoundary><ReportsPage /></ErrorBoundary></AuthGuard> },
      { path: 'settings', element: <AuthGuard permission="view:settings"><ErrorBoundary><SettingsPage /></ErrorBoundary></AuthGuard> },
      { path: 'help', element: <ErrorBoundary><HelpPage /></ErrorBoundary> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
