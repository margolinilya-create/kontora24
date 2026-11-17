import { useParams } from 'react-router-dom'
import { AuthGuard } from '@/features/auth/components/AuthGuard'
import { useOrderTypesStore } from '@/features/order-types/store'
import { isCustomStageKey } from '@/shared/lib/route-registry'
import { NotFoundPage } from '@/shared/components/NotFoundPage'
import Spinner from '@/shared/components/Spinner'
import QueuePage from './QueuePage'

/**
 * R25.7D (ТЗ 7.4): очередь своего этапа /production/stage/:key на общем
 * QueuePage. Доступ — право stage:<ключ> (заводится create_stage_def).
 */
export default function CustomStageQueuePage() {
  const { key } = useParams()
  const loaded = useOrderTypesStore((s) => s.loaded)
  const def = useOrderTypesStore((s) => s.stages.find((d) => d.key === key))
  if (!isCustomStageKey(key)) return <NotFoundPage />
  if (!loaded) return <div className="flex justify-center py-12"><Spinner /></div>
  if (!def) return <NotFoundPage />
  return (
    <AuthGuard permission={`stage:${key}`}>
      <QueuePage key={key} queueType={key} />
    </AuthGuard>
  )
}
