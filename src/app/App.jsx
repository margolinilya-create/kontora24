import { useEffect, Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { useAuthStore } from '@/features/auth/store'
import { Toaster } from '@/shared/components/Toaster'
import { routes } from './routes'

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

  useEffect(() => {
    initialize()
  }, [initialize])

  return (
    <>
      <Suspense fallback={<LoadingFallback />}>
        <RouterProvider router={router} />
      </Suspense>
      <Toaster />
    </>
  )
}
