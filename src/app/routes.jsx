import { lazy } from 'react'
import { Layout } from '@/shared/components/Layout'
import { AuthGuard } from '@/features/auth/components/AuthGuard'
import { LoginForm } from '@/features/auth/components/LoginForm'
import { NotFoundPage } from '@/shared/components/NotFoundPage'

// Lazy-loaded pages
const DashboardPage = lazy(() => import('@/features/analytics/pages/DashboardPage'))
const OrdersPage = lazy(() => import('@/features/orders/pages/OrdersPage'))
const OrderDetailPage = lazy(() => import('@/features/orders/pages/OrderDetailPage'))
const CreateOrderPage = lazy(() => import('@/features/orders/pages/CreateOrderPage'))
const ProductionBoardPage = lazy(() => import('@/features/production/pages/ProductionBoardPage'))
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
      { index: true, element: <DashboardPage /> },
      { path: 'orders', element: <AuthGuard roles={['admin', 'manager']}><OrdersPage /></AuthGuard> },
      { path: 'orders/create', element: <AuthGuard roles={['admin', 'manager']}><CreateOrderPage /></AuthGuard> },
      { path: 'orders/:id', element: <OrderDetailPage /> },
      { path: 'production', element: <AuthGuard roles={['admin', 'manager']}><ProductionBoardPage /></AuthGuard> },
      { path: 'production/design', element: <AuthGuard roles={['admin', 'manager', 'designer']}><DesignQueuePage /></AuthGuard> },
      { path: 'production/prepress', element: <AuthGuard roles={['admin', 'manager', 'designer', 'printer']}><PrepressQueuePage /></AuthGuard> },
      { path: 'production/print', element: <AuthGuard roles={['admin', 'manager', 'printer']}><PrintQueuePage /></AuthGuard> },
      { path: 'production/lamination', element: <AuthGuard roles={['admin', 'manager', 'printer']}><LaminationQueuePage /></AuthGuard> },
      { path: 'production/cutting', element: <AuthGuard roles={['admin', 'manager', 'printer']}><CuttingQueuePage /></AuthGuard> },
      { path: 'production/pouring', element: <AuthGuard roles={['admin', 'manager', 'post_printer']}><PouringQueuePage /></AuthGuard> },
      { path: 'production/selection', element: <AuthGuard roles={['admin', 'manager', 'post_printer']}><SelectionPouringQueuePage /></AuthGuard> },
      { path: 'production/assembly3d', element: <AuthGuard roles={['admin', 'manager', 'post_printer']}><Assembly3dQueuePage /></AuthGuard> },
      { path: 'production/packaging', element: <AuthGuard roles={['admin', 'manager', 'post_printer']}><PackagingQueuePage /></AuthGuard> },
      { path: 'production/otk', element: <AuthGuard roles={['admin']}><OtkQueuePage /></AuthGuard> },
      { path: 'warehouse', element: <AuthGuard roles={['admin', 'manager']}><WarehousePage /></AuthGuard> },
      { path: 'clients', element: <AuthGuard roles={['admin', 'manager']}><ClientsPage /></AuthGuard> },
      { path: 'clients/:id', element: <AuthGuard roles={['admin', 'manager']}><ClientDetailPage /></AuthGuard> },
      { path: 'analytics', element: <AuthGuard roles={['admin', 'manager']}><AnalyticsPage /></AuthGuard> },
      { path: 'cabinet', element: <CabinetPage /> },
      { path: 'reports', element: <AuthGuard roles={['admin']}><ReportsPage /></AuthGuard> },
      { path: 'settings', element: <AuthGuard roles={['admin']}><SettingsPage /></AuthGuard> },
      { path: 'help', element: <HelpPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
