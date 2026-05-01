import { useEffect, Suspense, lazy } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { useAuthStore } from '@/features/auth/store'
import { useThemeStore } from '@/shared/stores/theme-store'
import { Toaster } from '@/shared/components/Toaster'
import { OfflineIndicator } from '@/shared/components/OfflineIndicator'
import { routes } from './routes'

const AgentationComponent = lazy(() => import('agentation').then((m) => ({ default: m.Agentation })))

const router = createBrowserRouter(routes)

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]" role="status" aria-label="Загрузка">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent" />
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
      <Suspense fallback={null}>
        <AgentationComponent />
      </Suspense>
    </>
  )
}
