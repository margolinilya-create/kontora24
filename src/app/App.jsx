import { useEffect, Suspense, lazy } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { useAuthStore } from '@/features/auth/store'
import { useThemeStore } from '@/shared/stores/theme-store'
import { Toaster } from '@/shared/components/Toaster'
import { OfflineIndicator } from '@/shared/components/OfflineIndicator'
import { InstallPrompt } from '@/shared/components/InstallPrompt'
import Spinner from '@/shared/components/Spinner'
import { routes } from './routes'

// Виджет разметки для разработки. Только в dev: в прод-сборке ветка вырезается
// (import.meta.env.DEV === false → динамический import не попадает в бандл).
const AgentationComponent = import.meta.env.DEV
  ? lazy(() => import('agentation').then((m) => ({ default: m.Agentation })))
  : null

const router = createBrowserRouter(routes)

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]" role="status" aria-label="Загрузка">
      <Spinner />
    </div>
  )
}

export function App() {
  const initialize = useAuthStore((s) => s.initialize)
  const initTheme = useThemeStore((s) => s.init)

  useEffect(() => {
    initialize()
    initTheme()
  }, [initialize, initTheme])

  return (
    <>
      <Suspense fallback={<LoadingFallback />}>
        <RouterProvider router={router} />
      </Suspense>
      <Toaster />
      <OfflineIndicator />
      <InstallPrompt />
      {AgentationComponent && (
        <Suspense fallback={null}>
          <AgentationComponent />
        </Suspense>
      )}
    </>
  )
}
